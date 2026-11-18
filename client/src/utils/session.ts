// Única coisa guardada no navegador: a sessão do nosso servidor (JWT).
// Diferente da versão TTLock, não há token do fornecedor no navegador:
// o token da Tuya fica só no servidor.
const SESSION_KEY = "tuya_session";
const USER_KEY = "tuya_user";

export const session = {
  save(sessionToken: string, user: { username: string; name: string | null }) {
    localStorage.setItem(SESSION_KEY, sessionToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getToken(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },
  getUser(): { username: string; name: string | null } | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isAuthenticated() {
    return Boolean(this.getToken());
  },
};
