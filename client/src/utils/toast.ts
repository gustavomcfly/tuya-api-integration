import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";

// Rede de segurança: o usuário nunca vê mensagens técnicas do navegador nem textos
// em chinês. As mensagens da Tuya já chegam traduzidas pelo servidor.
const CJK = /[㐀-鿿豈-﫿]/;
const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i;
const BAD_JSON = /unexpected (token|end of json)|not valid json/i;

export function localizeMessage(message: unknown): string {
  const text = String(message ?? "");
  if (CJK.test(text)) return "Ocorreu um erro inesperado. Tente novamente.";
  if (NETWORK.test(text)) return "Falha de conexão com o servidor.";
  if (BAD_JSON.test(text)) return "Resposta inválida do servidor.";
  return text;
}

function show(text: string, background: string, duration: number) {
  Toastify({
    text,
    duration,
    close: true,
    gravity: "top",
    position: "right",
    style: { background, borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" },
  }).showToast();
}

export const toast = {
  success: (m: string) => show(m, "linear-gradient(to right, #00b09b, #96c93d)", 3000),
  error: (m: unknown) => show(localizeMessage(m), "linear-gradient(to right, #ff5f6d, #ffc371)", 4500),
  info: (m: string) => show(m, "linear-gradient(to right, #2193b0, #6dd5ed)", 3000),
};
