import crypto from "node:crypto";

// Criptografia das APIs de fechadura da Tuya.
//
// 1. POST .../password-ticket devolve { ticket_id, ticket_key }.
//    ticket_key = hex de AES-ECB(chave temporária de 16 bytes) usando o Access Secret
//    como chave. O Access Secret tem 32 caracteres => AES-256-ECB, PKCS7.
// 2. Toda senha enviada (temp-password, modify-password...) vai cifrada com
//    AES-128-ECB + PKCS7 usando a chave temporária, em hex maiúsculo.

function aesEcbForKey(key: Buffer): string {
  switch (key.length) {
    case 16:
      return "aes-128-ecb";
    case 24:
      return "aes-192-ecb";
    case 32:
      return "aes-256-ecb";
    default:
      throw new Error(
        `Tamanho de chave AES inválido (${key.length} bytes). Confira o TUYA_ACCESS_SECRET.`,
      );
  }
}

export function decryptTicketKey(ticketKeyHex: string, accessSecret: string): Buffer {
  const key = Buffer.from(accessSecret, "utf8");
  const decipher = crypto.createDecipheriv(aesEcbForKey(key), key, null);
  return Buffer.concat([
    decipher.update(Buffer.from(ticketKeyHex, "hex")),
    decipher.final(),
  ]);
}

export function encryptPassword(password: string, ticketKey: Buffer): string {
  const cipher = crypto.createCipheriv(aesEcbForKey(ticketKey), ticketKey, null);
  return Buffer.concat([cipher.update(password, "utf8"), cipher.final()])
    .toString("hex")
    .toUpperCase();
}
