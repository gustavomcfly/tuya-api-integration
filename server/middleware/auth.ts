import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

// Sessão própria do sistema (JWT) com o id da linha em User. Toda rota que lê/grava
// dados de usuário — e toda rota que comanda dispositivos — exige esta sessão.
// O token da Tuya nunca sai do servidor.
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

function getSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET não configurado no ambiente de produção.");
  }
  console.warn("[auth] JWT_SECRET ausente: usando segredo de desenvolvimento.");
  return "dev-only-insecure-secret";
}

export function signSession(user: SessionUser, expiresInSeconds = SEVEN_DAYS): string {
  return jwt.sign({ sub: user.id, username: user.username }, getSecret(), {
    expiresIn: expiresInSeconds,
  });
}

function unauthorized(res: Response, message: string) {
  // Mesmo duplo formato de erro do projeto original (success/message e errcode/errmsg).
  return res.status(401).json({ success: false, message, errcode: -401, errmsg: message });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return unauthorized(res, "Sessão ausente. Faça login novamente.");
  }
  try {
    const payload = jwt.verify(token, getSecret()) as jwt.JwtPayload;
    req.user = { id: String(payload.sub), username: String(payload.username) };
    next();
  } catch {
    return unauthorized(res, "Sessão inválida ou expirada. Faça login novamente.");
  }
}

// Atalho tipado para handlers que rodam depois de requireAuth.
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new Error("requireAuth não executado nesta rota");
  return req.user;
}
