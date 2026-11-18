import crypto from "node:crypto";
import { promisify } from "node:util";
import prisma from "../prismaClient.js";

// Contas locais do sistema. Senha guardada como "scrypt$<salt>$<hash>" (sem dependências extras).
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Hash fixo para comparar quando o usuário não existe (tempo de resposta constante).
let dummyHash: Promise<string> | null = null;

export const userService = {
  normalizeUsername(username: unknown): string {
    return typeof username === "string" ? username.trim().toLowerCase() : "";
  },

  async count() {
    return prisma.user.count();
  },

  async create(username: string, password: string, name?: string | null) {
    return prisma.user.create({
      data: { username, name: name || null, passwordHash: await hashPassword(password) },
    });
  },

  async authenticate(username: string, password: string) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      dummyHash ??= hashPassword("dummy-password");
      await verifyPassword(password, await dummyHash);
      return null;
    }
    if (!(await verifyPassword(password, user.passwordHash))) return null;
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  },

  async getById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
};
