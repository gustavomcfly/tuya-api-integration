import "dotenv/config";
import crypto from "node:crypto";
import { calcSign, canonicalUrl } from "./sign.js";
import { FALLBACK_CODES, TuyaError, translateNetworkError } from "../utils/tuyaErrors.js";

// Cliente da Tuya Cloud Open API.
//
// Diferente da TTLock (login com a conta do usuário), a Tuya autentica o PROJETO cloud:
// Access ID + Access Secret => token em "modo simples" (grant_type=1), válido ~2h.
// O token fica só no servidor, em cache por instância, e é renovado sozinho.

export const REGIONS: Record<string, string> = {
  cn: "https://openapi.tuyacn.com",
  us: "https://openapi.tuyaus.com",
  "us-e": "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  "eu-w": "https://openapi-weaz.tuyaeu.com",
  in: "https://openapi.tuyain.com",
  sg: "https://openapi-sg.iotbing.com",
};

export function tuyaConfig() {
  const accessId = process.env.TUYA_ACCESS_ID ?? "";
  const accessSecret = process.env.TUYA_ACCESS_SECRET ?? "";
  const region = (process.env.TUYA_REGION ?? "us").toLowerCase();
  const baseUrl = (process.env.TUYA_BASE_URL || REGIONS[region] || REGIONS.us).replace(/\/$/, "");
  return {
    accessId,
    accessSecret,
    region,
    baseUrl,
    appUid: process.env.TUYA_APP_UID || "",
    configured: Boolean(accessId && accessSecret),
  };
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface TuyaRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Query;
  body?: unknown;
}

interface TuyaEnvelope<T> {
  success: boolean;
  result?: T;
  code?: number;
  msg?: string;
  t?: number;
}

interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  uid: string;
  expiresAt: number; // ms
}

const REQUEST_TIMEOUT_MS = 15_000;
let token: TokenInfo | null = null;
let tokenPromise: Promise<TokenInfo> | null = null;

async function rawCall<T>(req: TuyaRequest, accessToken?: string): Promise<T> {
  const cfg = tuyaConfig();
  if (!cfg.configured) {
    throw new TuyaError(1005, "TUYA_ACCESS_ID/TUYA_ACCESS_SECRET ausentes no .env");
  }

  const url = canonicalUrl(req.path, req.query);
  const body = req.body === undefined ? "" : JSON.stringify(req.body);
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = calcSign({
    clientId: cfg.accessId,
    secret: cfg.accessSecret,
    t,
    nonce,
    accessToken,
    method: req.method,
    url,
    body,
  });

  const headers: Record<string, string> = {
    client_id: cfg.accessId,
    sign,
    sign_method: "HMAC-SHA256",
    t,
    nonce,
    lang: "en",
  };
  if (accessToken) headers.access_token = accessToken;
  if (body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    // A URL enviada usa encode normal; a assinatura usa os valores crus (regra da Tuya).
    const qs = new URLSearchParams(
      Object.entries(req.query ?? {})
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    response = await fetch(`${cfg.baseUrl}${req.path}${qs ? `?${qs}` : ""}`, {
      method: req.method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const friendly = translateNetworkError(err);
    throw new TuyaError(-1, friendly ?? String((err as Error)?.message ?? err));
  }

  let data: TuyaEnvelope<T>;
  try {
    data = (await response.json()) as TuyaEnvelope<T>;
  } catch {
    throw new TuyaError(-1, `Resposta inválida da Tuya (HTTP ${response.status}).`, response.status);
  }

  if (!data.success) {
    throw new TuyaError(Number(data.code ?? -1), data.msg ?? "", response.status);
  }
  return data.result as T;
}

async function fetchToken(): Promise<TokenInfo> {
  // Se houver refresh_token válido, tenta renovar; senão pede um token novo.
  if (token?.refreshToken) {
    try {
      const r = await rawCall<TokenResult>({ method: "GET", path: `/v1.0/token/${token.refreshToken}` });
      return toTokenInfo(r);
    } catch {
      // cai para um token novo
    }
  }
  const r = await rawCall<TokenResult>({ method: "GET", path: "/v1.0/token", query: { grant_type: 1 } });
  return toTokenInfo(r);
}

interface TokenResult {
  access_token: string;
  refresh_token: string;
  expire_time: number; // segundos
  uid: string;
}

function toTokenInfo(r: TokenResult): TokenInfo {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    uid: r.uid,
    // renova 60 s antes de expirar
    expiresAt: Date.now() + Math.max(60, Number(r.expire_time) - 60) * 1000,
  };
}

export async function getToken(force = false): Promise<TokenInfo> {
  if (!force && token && Date.now() < token.expiresAt) return token;
  if (!tokenPromise) {
    tokenPromise = fetchToken()
      .then((t) => (token = t))
      .finally(() => {
        tokenPromise = null;
      });
  }
  return tokenPromise;
}

const TOKEN_ERRORS = new Set([1010, 1011, 1012, 1400]);

export async function tuyaRequest<T = unknown>(req: TuyaRequest): Promise<T> {
  const { accessToken } = await getToken();
  try {
    return await rawCall<T>(req, accessToken);
  } catch (err) {
    if (err instanceof TuyaError && TOKEN_ERRORS.has(err.code)) {
      token = null;
      const fresh = await getToken(true);
      return rawCall<T>(req, fresh.accessToken);
    }
    throw err;
  }
}

// Várias APIs de fechadura existem em mais de uma versão/caminho dependendo do
// tipo de fechadura (Wi-Fi, Zigbee, BLE) e do que está inscrito no projeto.
// Tenta em ordem e só passa para a próxima se o erro indicar "rota não serve".
export async function tuyaRequestFirst<T = unknown>(variants: TuyaRequest[]): Promise<T> {
  // Guarda o erro mais informativo: "rota inexistente" (1108/404) numa alternativa
  // não pode esconder, p.ex., "comando não suportado" (2008) da rota principal.
  let bestError: unknown;
  const routeMissing = (e: TuyaError) => e.code === 1108 || e.httpStatus === 404;
  for (const v of variants) {
    try {
      return await tuyaRequest<T>(v);
    } catch (err) {
      const retryable = err instanceof TuyaError && (FALLBACK_CODES.has(err.code) || err.httpStatus === 404);
      if (!retryable) throw err;
      if (!bestError || (bestError instanceof TuyaError && routeMissing(bestError) && !routeMissing(err))) {
        bestError = err;
      }
    }
  }
  throw bestError;
}

export function resetTokenCache() {
  token = null;
}
