// Tradução dos códigos de erro da Tuya Cloud (as mensagens vêm em inglês/chinês).
// Fonte: https://developer.tuya.com/en/docs/iot/error-code?id=K989ruxx88swc

const MESSAGES: Record<number, string> = {
  500: "Erro interno no servidor da Tuya.",
  1000: "Dado não encontrado na Tuya.",
  1001: "Access Secret inválido. Confira o TUYA_ACCESS_SECRET.",
  1002: "Token de acesso ausente.",
  1003: "Tipo de concessão (grant_type) inválido.",
  1004: "Assinatura inválida. Confira o Access ID/Secret e o relógio do servidor.",
  1005: "Access ID inválido. Confira o TUYA_ACCESS_ID.",
  1010: "Token de acesso expirado.",
  1011: "Token de acesso inválido.",
  1012: "Status do token inválido.",
  1013: "Horário da requisição inválido: ajuste o relógio do servidor.",
  1100: "Parâmetro obrigatório vazio.",
  1101: "Parâmetro fora do intervalo permitido.",
  1102: "Parâmetro nulo.",
  1103: "Falha ao enviar o comando ao dispositivo.",
  1104: "Tipo de parâmetro incorreto.",
  1105: "Cabeçalho obrigatório ausente.",
  1106: "Permissão negada: o dispositivo não está vinculado a este projeto ou a API não foi autorizada.",
  1107: "Código inválido.",
  1108: "Caminho da API inválido.",
  1109: "Parâmetro inválido.",
  1110: "Limite de requisições simultâneas excedido.",
  1111: "Sistema da Tuya ocupado. Tente novamente.",
  1113: "Operação repetida em pouco tempo. Aguarde e tente novamente.",
  1114: "O IP deste servidor não tem acesso à API (lista de IPs do projeto).",
  1199: "Requisições muito frequentes. Aguarde e tente novamente.",
  1400: "Token de acesso inválido.",
  2001: "O dispositivo está offline.",
  2002: "Este usuário não possui dispositivos.",
  2003: "Função não suportada por este dispositivo.",
  2004: "Tipo de fechadura não suportado para esta operação.",
  2005: "Produto não encontrado.",
  2006: "Usuário não encontrado.",
  2008: "Comando ou valor não suportado pelo dispositivo.",
  2009: "Operação não suportada por este dispositivo.",
  2010: "Dispositivo não encontrado.",
  2018: "Falha ao descriptografar dados (confira o Access Secret).",
  2028: "Chave temporária (ticket) expirada. Tente novamente.",
  2047: "O dispositivo está congelado pelo usuário e não aceita comandos.",
  2056: "Dispositivo já vinculado ou não ativado.",
  28841001: "Sem permissão: o projeto não tem plano de desenvolvimento cloud ativo.",
  28841002: "O plano de desenvolvimento cloud expirou.",
  28841003: "O plano de desenvolvimento cloud tem fatura em atraso.",
  28841004: "Cota de teste do plano esgotada.",
  28841101: "A API não está inscrita neste projeto (Cloud > API Products).",
  28841102: "A inscrição da API expirou.",
  28841103: "A inscrição da API tem fatura em atraso.",
  28841104: "Cota da API esgotada.",
  28841105: "O projeto não está autorizado a usar esta API (Cloud > Service API).",
  28841106: "A API não está inscrita neste projeto.",
  60009001: "Operação fora do pacote de permissões do projeto.",
  40000801: "O dispositivo está offline.",
  40000901: "Dispositivo não encontrado.",
  40000203: "Parâmetro inválido.",
};

export function translateTuyaCode(code: number, original?: string): string {
  const known = MESSAGES[code];
  if (known) return known;
  console.warn(`[Tuya] código sem tradução ${code}: "${original ?? ""}"`);
  return `Erro retornado pela Tuya (código ${code}).`;
}

export function translateNetworkError(error: unknown): string | null {
  const err = error as { name?: string; code?: string; cause?: { code?: string }; message?: string };
  const code = err?.cause?.code ?? err?.code;
  const msg = String(err?.message ?? "");
  if (code && /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)/.test(code))
    return `Certificado HTTPS não confiável (${code}): a rede está inspecionando o tráfego. Rode o servidor com NODE_OPTIONS=--use-system-ca (já incluso nos scripts npm) ou configure NODE_EXTRA_CA_CERTS.`;
  if (err?.name === "TimeoutError" || err?.name === "AbortError" || /timeout/i.test(msg))
    return "Tempo esgotado ao comunicar com a Tuya.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "Não foi possível localizar o servidor da Tuya (verifique a internet e o TUYA_REGION).";
  if (code && ["ECONNREFUSED", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(code))
    return "Falha de conexão com a Tuya.";
  if (/fetch failed|network/i.test(msg)) return "Falha de conexão com a Tuya.";
  return null;
}

// Códigos que indicam "este caminho/versão da API não serve aqui" — vale tentar
// a rota alternativa (v1.0 <-> v1.1, smart-lock <-> door-lock...).
export const FALLBACK_CODES = new Set([
  1106, 1108, 1109, 2003, 2004, 2008, 2009, 28841101, 28841105, 28841106, 60009001,
]);

export class TuyaError extends Error {
  code: number;
  original: string;
  httpStatus?: number;

  // code -1 = erro local (rede/TLS/resposta inválida): a mensagem já vem pronta em pt-BR.
  constructor(code: number, original: string, httpStatus?: number) {
    super(code === -1 ? original : translateTuyaCode(code, original));
    this.name = "TuyaError";
    this.code = code;
    this.original = original;
    this.httpStatus = httpStatus;
  }
}
