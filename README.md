# HelpDesk WhatsApp CRM

Frontend React (Vite + TypeScript) para atendimento WhatsApp. Consome **apenas** a API NestJS em `bot/api`.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (tema escuro)
- Socket.IO client (tempo real)
- Nest API (`VITE_API_URL` / `VITE_WS_URL`)

## Estrutura

```
src/
├── lib/
│   ├── api.ts          # HTTP client + token + upload
│   ├── socket.ts       # Socket.IO singleton
│   └── mappers.ts      # API camelCase/enums → shapes da UI
├── context/AuthContext.tsx
├── hooks/useData.ts    # tickets, messages, contacts, etc.
└── components/         # views (look & feel preservado)
```

## Configuração

Crie `.env` (veja `.env.example`):

```
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

A API Nest deve estar rodando na porta 3001 (ou ajuste as URLs).

## Como rodar

```bash
# Terminal 1 — API Nest
cd ../bot/api
npm run start:dev

# Terminal 2 — Frontend
cd chat-boot
npm install
npm run dev
```

Login inicial: use um usuário seed da API (ex.: `admin` / `admin123`).

## Autenticação

- `POST /auth/login` → JWT em `localStorage` (`nge_access_token`)
- `GET /auth/me` no mount se houver token
- Socket.IO autentica com `auth.token`

## WhatsApp

Conexão, QR e status vêm da API (`/whatsapp/*` + eventos `nge-qrcode` / `whatsapp:status`). Não há bridge local nem Supabase neste frontend.
