import type { Request, RequestHandler, Response } from "express";
import { TuyaError } from "./tuyaErrors.js";

// Contrato da API com o front (o mesmo do projeto TTLock):
//   sucesso -> { errcode: 0, ...dados }
//   erro    -> { errcode: <código>, errmsg: <mensagem em pt-BR> }

export class BadRequest extends Error {}

export function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof BadRequest) {
    return res.status(400).json({ errcode: -3, errmsg: err.message });
  }
  if (err instanceof TuyaError) {
    return res.status(502).json({ errcode: err.code, errmsg: err.message, errmsgOriginal: err.original });
  }
  console.error(`[API] ${fallback}:`, err);
  return res.status(500).json({ errcode: -1, errmsg: fallback });
}

export function route(
  fallback: string,
  fn: (req: Request) => Promise<Record<string, unknown> | void>,
): RequestHandler {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json({ errcode: 0, ...(data ?? {}) });
    } catch (err) {
      sendError(res, err, fallback);
    }
  };
}

// IDs da Tuya entram no caminho da URL: só aceita caracteres seguros.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function idParam(value: unknown, label = "deviceId"): string {
  const v = typeof value === "number" ? String(value) : value;
  if (typeof v !== "string" || !ID_RE.test(v)) throw new BadRequest(`${label} inválido.`);
  return v;
}

export function text(value: unknown, label: string, max = 100): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new BadRequest(`${label} obrigatório.`);
  return v.slice(0, max);
}

export function optionalMs(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
