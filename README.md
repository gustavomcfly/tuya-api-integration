<h1 align="center">🔓 TestLock Tuya - Pado</h1>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
</p>

Sistema de controle e automação para testes de fechaduras digitais **Tuya** (e de qualquer dispositivo Tuya com DP de liga/desliga). Mesma arquitetura, visual e modelo serverless do [TestLock TTLock](../ttlock-api-integration): gerencia dispositivos, executa comandos remotos, roda testes de ciclagem em background e auditorias de qualidade com relatórios em PDF.

---

## 🚀 Tecnologias

- **Frontend:** React 19 + TypeScript, Tailwind CSS 4, [Vite](https://vitejs.dev/)
- **Backend:** Node.js 20.19+ + Express 5 em TypeScript (executado com `tsx`)
- **Banco:** PostgreSQL + [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`)
- **Sessão:** JWT próprio (contas locais, senha com `scrypt`)
- **Integração:** [Tuya Cloud Open API](https://developer.tuya.com/en/docs/cloud/) (assinatura HMAC-SHA256, tickets AES)
- **Deploy:** Netlify (site estático + Function `api` com `serverless-http`)

---

## 🔑 Como a autenticação difere da TTLock

| | TTLock (projeto original) | Tuya (este projeto) |
| --- | --- | --- |
| Quem autentica | A conta do usuário no app TTLock | O **projeto cloud** (Access ID/Secret) |
| Token do fornecedor | Vai para o navegador | **Fica só no servidor**, renovado sozinho |
| Login no sistema | E-mail/senha da TTLock | Conta local do TestLock (usuário/senha) |
| Rotas de dispositivo | Sem sessão | Exigem sessão (JWT) |

Os dispositivos aparecem quando a conta do app **Smart Life / Tuya Smart** é vinculada ao projeto cloud.

---

## 💻 Como Executar Localmente

### 1. Pré-requisitos

- Node.js **20.19+** (recomendado 22 LTS), PostgreSQL 14+ (pgAdmin), Git
- Um projeto em [platform.tuya.com](https://platform.tuya.com) → **Cloud → Development → Create Cloud Project**
  - Em **Service API**, autorize: *IoT Core*, *Authorization Token Management* e *Smart Lock Open Service*
  - Em **Devices → Link App Account**, vincule a conta do app Smart Life onde as fechaduras estão pareadas
  - Anote o **Access ID**, o **Access Secret** e o **Data Center** do projeto

### 2. Instalar

```bash
npm run install:all
```

### 3. Banco de dados

No pgAdmin, crie um banco vazio chamado `tuya_testlock_db`.

### 4. `server/.env`

Copie `server/.env.example` para `server/.env` e preencha:

```env
PORT=3002
TUYA_ACCESS_ID=seu_access_id
TUYA_ACCESS_SECRET=seu_access_secret
TUYA_REGION=us            # us | us-e | eu | eu-w | cn | in | sg
JWT_SECRET=um_segredo_longo_e_aleatorio
SIGNUP_CODE=              # código para novos cadastros (vazio = cadastro fechado)
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/tuya_testlock_db?schema=public"
```

Gerar um `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 5. Tabelas

```bash
cd server
npx prisma migrate deploy
npx prisma generate
cd ..
```

### 6. Conferir a integração com a Tuya

```bash
cd server && npm run tuya:check
```

Mostra se o token foi obtido, lista os dispositivos vinculados e o status do primeiro.

### 7. Rodar

```bash
npm run dev
```

- **Frontend:** <http://localhost:5174> · **Backend:** <http://localhost:3002>
- Portas diferentes do projeto TTLock (5173/3001): os dois rodam lado a lado.
- **Primeiro acesso:** a tela abre em "Primeiro acesso" e cria a conta de administrador. Depois disso, novos cadastros exigem o `SIGNUP_CODE`.

### 🧪 Modo demonstração (sem hardware e sem conta Tuya)

```bash
npm run dev:demo
```

Sobe um **simulador da Tuya Cloud** (`server/scripts/mock-tuya.ts`) que valida a assinatura de cada requisição, emite tickets AES e simula uma fechadura Wi-Fi, uma tomada e uma fechadura offline. `MOCK_FAIL_RATE=0.1` injeta 10% de falhas para exercitar a ciclagem.

### ✅ Testes

```bash
npm test
```

Confere a assinatura HMAC contra os **vetores oficiais da documentação da Tuya** e a criptografia ticket/senha.

---

## 🔁 Mapeamento TTLock → Tuya

| Recurso | TTLock | Tuya |
| --- | --- | --- |
| Listar | `/v3/lock/list` | `/v1.0/iot-01/associated-users/devices` |
| Detalhes/bateria | `/v3/lock/detail` (`electricQuantity`) | `/v1.0/devices/{id}` (DP `residual_electricity`) |
| Abrir/trancar | `/v3/lock/unlock`, `/lock` | ticket + `/v1.0/smart-lock/devices/{id}/password-free/door-operate` (`open: true/false`) |
| Senha personalizada | `/v3/keyboardPwd/add` | `/v1.0/devices/{id}/door-lock/temp-password` (senha cifrada AES-128-ECB) |
| Senha aleatória | `/v3/keyboardPwd/get` | Senha offline `/v1.1/devices/{id}/door-lock/offline-temp-password` |
| Cartão / digital | Envio do número pelo gateway | **Cadastro físico** disparado pela nuvem (`door-lock/actions/entry`) |
| Fechamento automático | `/v3/lock/setAutoLockTime` | DPs `automatic_lock` + `auto_lock_time` |
| Histórico | `/v3/lockRecord/list` (+ limpar) | `/v1.1/devices/{id}/door-lock/open-logs` (sem limpar) |
| Firmware | `/v3/lock/upgradeCheck` | `/v2.0/cloud/thing/{id}/firmware` |
| Senha de admin / modo passagem | endpoints próprios | painel genérico de **data points** (Configurações Avançadas) |

Várias APIs de fechadura existem em mais de uma versão conforme o tipo (Wi-Fi, Zigbee, BLE). O cliente (`tuyaRequestFirst`) tenta as variantes em ordem e só avança quando o erro indica "rota não suportada".

Dispositivos que **não** são fechadura, mas têm DP `switch_1`/`switch`, podem ser usados na ciclagem e nas auditorias (útil para validar a bancada).

---

## 🛠️ Problemas comuns

| Erro | Solução |
| --- | --- |
| `1004 sign invalid` | Access ID/Secret errados ou relógio do servidor fora de hora |
| `1106 permission deny` | Conta do app não vinculada ao projeto ou dispositivo de outra conta |
| `28841105` / `28841101` | Autorize a API em *Cloud → Service API* (ex.: Smart Lock Open Service) |
| `2001 device is offline` | Fechadura sem Wi-Fi / gateway desconectado |
| Abrir/trancar falha em fechadura | Habilite "abertura remota sem senha" em *Configurações Avançadas* ou no app |
| Senha recusada (`1109`) | Wi-Fi exige 7 dígitos; Zigbee/BLE, 6 |
| `self-signed certificate` no `prisma` | Rede corporativa com inspeção TLS: rode o Prisma numa rede sem proxy ou configure `NODE_EXTRA_CA_CERTS` |
| `EADDRINUSE :::3002` | Libere a porta ou altere `PORT` (e `VITE_API_TARGET` no client) |

---

## 📁 Estrutura

```text
/
├── client/                        # React + TS (Vite)
│   ├── vite.config.ts             # Porta 5174 + proxy de /api e /db
│   └── src/
│       ├── main.tsx, App.tsx      # Raiz e troca de telas
│       ├── index.css              # Design system original (tokens + classes ui-*)
│       ├── api/                   # http.ts (authFetch) + clientes tipados
│       ├── components/            # layout/Shell, ui/ (Panel, Button, Field...)
│       ├── pages/                 # Login, Home, Device, Passcodes, Credentials, Cyclic, Quality, Reports...
│       ├── state/AppContext.tsx   # Sessão, navegação, configurações
│       ├── types/api.ts           # Contrato com o backend
│       └── utils/                 # sessão, toast, formatação, PDF
├── server/                        # Express 5 + TS
│   ├── server.ts                  # Rotas e listen (local) / export (Netlify)
│   ├── tuya/                      # client (token + requisições), sign, crypto, deviceModel
│   ├── services/                  # device, lock, passcode, credential, record, quality, user
│   ├── routes/                    # auth, device, passcode, credential, record, quality, reports, settings
│   ├── db-routes/cyclicTestsDB.ts # /db/cyclic-tests
│   ├── cyclicEngine.ts            # Motor de ciclagem em background
│   ├── utils/                     # tuyaErrors (pt-BR), respond (contrato errcode/errmsg)
│   ├── scripts/                   # tuya-check, mock-tuya
│   └── prisma/                    # schema + migrations
├── netlify/functions/api.ts       # Wrapper serverless do Express
└── netlify.toml
```

---

## ☁️ Deploy (Netlify)

Mesmo modelo do projeto TTLock: o site estático sai de `client/dist` e o Express roda como Function `api`. Configure no Netlify as variáveis `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_REGION`, `JWT_SECRET`, `SIGNUP_CODE` e `DATABASE_URL` (banco acessível pela internet). O build aplica as migrations com `prisma migrate deploy`.

> ⚠️ Limitação herdada do projeto original: a ciclagem e a auditoria rodam **dentro do processo** do servidor. Em Functions serverless o processo termina após cada resposta, então testes longos devem rodar com o servidor local (`npm run dev`) ou num servidor Node permanente.

---

## 🔐 Segurança

- `server/.env` está no `.gitignore`. Nunca versione o Access Secret, o `JWT_SECRET` ou a senha do banco.
- O `local_key` dos dispositivos (controle via LAN) nunca é enviado ao navegador.
- IDs vindos do navegador são validados antes de entrar no caminho das URLs da Tuya.

---

_Desenvolvido para pesquisa e desenvolvimento de integrações IoT e automação de controle de acessos._
