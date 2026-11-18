import crypto from "node:crypto";

// Assinatura "nova" da Tuya Cloud (HMAC-SHA256).
// Doc: https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
//
//   stringToSign = METHOD \n SHA256(body) \n <headers assinados> \n URL
//   token:    str = client_id + t + nonce + stringToSign
//   negócio:  str = client_id + access_token + t + nonce + stringToSign
//   sign = HMAC-SHA256(str, secret).toUpperCase()

export const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

// path + "?" + chaves em ordem crescente (valores sem URL-encode, como a doc pede).
export function canonicalUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries = Object.entries(query ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return path;
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${path}?${entries.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

export interface StringToSignInput {
  method: string;
  url: string; // já canônica (canonicalUrl)
  body?: string; // exatamente os bytes enviados
  signedHeaders?: Record<string, string>; // ordem = ordem de Signature-Headers
}

export function buildStringToSign({
  method,
  url,
  body = "",
  signedHeaders = {},
}: StringToSignInput): string {
  const contentHash = body ? sha256Hex(body) : EMPTY_BODY_SHA256;
  const headersPart = Object.entries(signedHeaders)
    .map(([k, v]) => `${k}:${v}\n`)
    .join("");
  return `${method.toUpperCase()}\n${contentHash}\n${headersPart}\n${url}`;
}

export interface SignInput extends StringToSignInput {
  clientId: string;
  secret: string;
  t: string;
  nonce?: string;
  accessToken?: string; // ausente = requisição de token
}

export function calcSign(input: SignInput): string {
  const stringToSign = buildStringToSign(input);
  const str =
    input.clientId +
    (input.accessToken ?? "") +
    input.t +
    (input.nonce ?? "") +
    stringToSign;
  return crypto
    .createHmac("sha256", input.secret)
    .update(str, "utf8")
    .digest("hex")
    .toUpperCase();
}
