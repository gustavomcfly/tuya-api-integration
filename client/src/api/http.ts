import { session } from "../utils/session";
import type { ApiEnvelope } from "../types/api";

// Mesmo caminho em dev (proxy do Vite) e em produção (redirect do Netlify).
export const API_BASE = "/api";
export const DB_BASE = "/db";

let redirecting = false;

// fetch que anexa a sessão. Em 401 limpa o login e volta para a tela de entrada.
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = session.getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && token && !redirecting) {
    redirecting = true;
    session.clear();
    location.reload();
  }
  return res;
}

async function parseJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`);
  }
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// Rotas de dispositivo: contrato { errcode: 0, ...dados } | { errcode, errmsg }.
// Lança ApiError quando errcode != 0, para as telas tratarem com try/catch.
export async function apiPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
  const data = await parseJson<ApiEnvelope & T>(res);
  if (data.errcode !== 0) throw new ApiError(data.errcode, data.errmsg || "Erro desconhecido.");
  return data;
}

// Rotas de banco: contrato { success: boolean, message? , ... }.
export async function dbRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(url, init);
  const data = await parseJson<{ success: boolean; message?: string } & T>(res);
  if (!data.success) throw new ApiError(res.status, data.message || `Erro (${res.status}).`);
  return data;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
