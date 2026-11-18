import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSign, canonicalUrl } from "./sign.js";
import { decryptTicketKey, encryptPassword } from "./crypto.js";
import crypto from "node:crypto";

// Vetores de teste publicados na doc oficial da Tuya (página "Sign Requests for Cloud Authorization").
const clientId = "1KAD46OrT9HafiKdsXeg";
const secret = "4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC";
const t = "1588925778000";
const nonce = "5138cc3a9033d69856923fd07b491173";
const signedHeaders = {
  area_id: "29a33e8796834b1efa6",
  call_id: "8afdb70ab2ed11eb85290242ac130003",
};

test("assinatura de requisição de token confere com a doc", () => {
  const sign = calcSign({
    clientId,
    secret,
    t,
    nonce,
    method: "GET",
    url: canonicalUrl("/v1.0/token", { grant_type: 1 }),
    signedHeaders,
  });
  assert.equal(
    sign,
    "9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E",
  );
});

test("assinatura de requisição de negócio confere com a doc", () => {
  const sign = calcSign({
    clientId,
    secret,
    t,
    nonce,
    accessToken: "3f4eda2bdec17232f67c0b188af3eec1",
    method: "GET",
    url: canonicalUrl("/v2.0/apps/schema/users", { page_size: 50, page_no: 1 }),
    signedHeaders,
  });
  assert.equal(
    sign,
    "AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784",
  );
});

test("canonicalUrl ordena as chaves e ignora vazios", () => {
  assert.equal(
    canonicalUrl("/p", { b: 2, a: 1, c: undefined, d: "" }),
    "/p?a=1&b=2",
  );
  assert.equal(canonicalUrl("/p"), "/p");
});

test("ticket_key: round-trip AES-256-ECB (secret) -> AES-128-ECB (senha)", () => {
  // Simula o servidor da Tuya: gera uma chave temporária e a cifra com o Access Secret.
  const rawKey = "0123456789abcdef";
  const c = crypto.createCipheriv("aes-256-ecb", Buffer.from(secret, "utf8"), null);
  const ticketKey = Buffer.concat([c.update(rawKey, "utf8"), c.final()])
    .toString("hex")
    .toUpperCase();
  assert.equal(ticketKey.length, 64);

  const key = decryptTicketKey(ticketKey, secret);
  assert.equal(key.toString("utf8"), rawKey);

  const enc = encryptPassword("1234567", key);
  const d = crypto.createDecipheriv("aes-128-ecb", key, null);
  const plain = Buffer.concat([d.update(Buffer.from(enc, "hex")), d.final()]).toString();
  assert.equal(plain, "1234567");
  assert.match(enc, /^[0-9A-F]+$/);
});
