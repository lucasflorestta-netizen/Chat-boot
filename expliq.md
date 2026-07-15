# Expliq — Como funciona a conexão e o tráfego de mensagens WhatsApp

Documento gerado a partir da análise do repositório `chat-boot` (HelpDesk WhatsApp CRM).  
Objetivo: explicar **em detalhe** conexão, envio, recebimento, APIs externas, bibliotecas e o que é código próprio (inline/orquestração customizada).

---

## 1. Visão geral do projeto

Este repositório é um **Helpdesk/CRM de atendimento via WhatsApp**. Em termos de produto é um sistema único (monorepo / “monolítico” no sentido de um só produto e um só repositório). Em termos de execução, **não é um único processo Node**: há **dois runtimes** + backend gerenciado:

| Parte | Tecnologia | Pasta / onde roda |
|-------|------------|-------------------|
| Frontend (SPA) | React 18 + TypeScript + Vite + Tailwind | `src/` — `npm run dev` |
| Bridge WhatsApp | Node.js + TypeScript + **Baileys** | `services/whatsapp-bridge/` — precisa ficar ligado 24/7 |
| Backend / dados | **Supabase** (PostgreSQL, Auth, Realtime, Storage, Edge Functions) | `supabase/` + projeto na nuvem |

O frontend **nunca** fala direto com os servidores do WhatsApp.  
O bridge **nunca** expõe HTTP para o frontend.  
Tudo passa pelo **Supabase** (tabelas + Realtime + Storage) como barramento de integração.

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  React + Vite (SPA) │         │  whatsapp-bridge (Node 24/7) │
│  chave anon         │         │  service_role + Baileys      │
└─────────┬───────────┘         └──────────────┬───────────────┘
          │ REST + Realtime                    │ REST + Realtime + Storage
          └────────────────┬───────────────────┘
                           ▼
                ┌─────────────────────┐
                │      Supabase       │
                │ Postgres / Auth /   │
                │ Realtime / Storage  │
                └──────────┬──────────┘
                           │
                           │  (só o bridge)
                           ▼
                Servidores WhatsApp
                (protocolo multi-device / Web)
```

---

## 2. O que **não** está sendo usado

Não há integração com:

- Meta WhatsApp Cloud API (Graph API oficial)
- Twilio WhatsApp
- Evolution API
- whatsapp-web.js / Puppeteer / Chromium
- Outro provedor SaaS de WhatsApp

A conexão é **não oficial**, via protocolo Web do WhatsApp, implementado pela biblioteca **Baileys**.

---

## 3. API / biblioteca externa usada para WhatsApp

### 3.1 Biblioteca principal: Baileys

| Item | Valor |
|------|--------|
| Pacote npm | `@whiskeysockets/baileys` |
| Versão no projeto | `^7.0.0-rc13` (`services/whatsapp-bridge/package.json`) |
| O que faz | Abre WebSocket com os servidores do WhatsApp (multi-device), autentica com QR, envia/recebe mensagens, baixa mídia, sincroniza contatos, busca foto de perfil |
| Tipo | Biblioteca open-source (não é API REST da Meta) |

Funções Baileys usadas de forma direta no código:

- `makeWASocket` — cria o socket
- `useMultiFileAuthState` — sessão em arquivos locais (`creds.json` + keys)
- `fetchLatestBaileysVersion` — versão do protocolo
- `Browsers.ubuntu('Chrome')` — fingerprint de browser
- `downloadMediaMessage` — baixa mídia inbound
- `sock.sendMessage(...)` — envio outbound
- eventos: `connection.update`, `creds.update`, `messages.upsert`, `messages.update`, `contacts.upsert|update`, `messaging-history.set`

### 3.2 Dependências auxiliares do bridge

| Pacote | Uso |
|--------|-----|
| `@supabase/supabase-js` | DB, Realtime, Storage (com service role) |
| `@hapi/boom` | Status de desconexão (ex.: logout, connectionClosed) |
| `qrcode-terminal` | Imprime QR no terminal do servidor |
| `pino` | Logs |
| `dotenv` | Variáveis de ambiente |

### 3.3 Frontend (não envia WhatsApp)

| Pacote | Uso |
|--------|-----|
| `@supabase/supabase-js` | Auth, CRUD, Realtime |
| `qrcode.react` | Desenha o QR a partir da string salva no banco |
| `lucide-react` | Ícones da UI |
| React + Vite + Tailwind | Interface do CRM |

### 3.4 API externa de infraestrutura: Supabase

Sim — é a principal API externa **de backend**, não de WhatsApp:

- **PostgreSQL** — tickets, mensagens, contatos, fila de envio
- **Auth** — login de agentes/admins
- **Realtime** — UI ao vivo + controle do QR (`whatsapp_connection`)
- **Storage** — buckets `chat-media` (mídias) e `whatsapp-session` (backup da sessão Baileys)
- **Edge Functions** — só admin criar/remover usuário (`admin-create-user`, `admin-delete-user`); **não** envia WhatsApp

Variáveis:

**Frontend (`.env`):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Bridge (`services/whatsapp-bridge/.env`):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BRIDGE_POLL_INTERVAL_MS` (padrão `5000`)
- `WHATSAPP_RESTORE_SESSION` (`0` ou `1`)

---

## 4. Estrutura do repositório (relevante)

```
chat-boot/
├── src/                          # SPA React (CRM)
│   ├── components/
│   │   ├── views/WhatsappView.tsx   # UI de QR / status
│   │   ├── chat/ChatDetail.tsx      # agente “envia” = INSERT no DB
│   │   └── ...
│   ├── hooks/useData.ts             # Realtime tickets/mensagens
│   └── lib/supabase.ts
├── services/whatsapp-bridge/     # Processos WhatsApp
│   └── src/
│       ├── index.ts              # entrypoint
│       ├── connection.ts         # Baileys + QR + reconnect
│       ├── session-storage.ts    # auth local + backup Storage
│       ├── inbound.ts            # recebimento
│       ├── outbound.ts           # envio (poll da fila)
│       ├── contacts-sync.ts      # sync da agenda WA
│       ├── profile-pictures.ts   # avatares
│       ├── scheduler.ts          # mensagens agendadas
│       ├── deleted.ts            # apagar no WA → CRM ignora (mantém histórico)
│       ├── bot/triage.ts         # menu / roteamento
│       ├── bot/nps.ts            # pesquisa 1–5
│       └── utils.ts              # tickets, contatos, JID/LID
└── supabase/migrations/          # schema + Storage + Realtime
```

Código de orquestração (fila, bot, tickets, LID, poller, etc.) é **código próprio do projeto**, não um wrapper tipo Evolution. A parte “falar com WhatsApp” é a Baileys.

---

## 5. Como funciona a conexão com o WhatsApp

### 5.1 Entry point

`services/whatsapp-bridge/src/index.ts`:

1. Adquire lock de processo (`process-lock.ts` → `data/bridge.lock`) — evita 2 bridges no mesmo host
2. Garante linha em `whatsapp_connection`
3. Inicia `startConnectionManager()` em `connection.ts`

### 5.2 Sessão / autenticação

Arquivo: `session-storage.ts`

1. Sessão primária em disco: `services/whatsapp-bridge/data/auth/` via `useMultiFileAuthState`
2. Após `creds.update`, faz upload dos arquivos para Storage bucket **`whatsapp-session`** (prefixo `baileys/`)
3. Restore remoto **só** se `WHATSAPP_RESTORE_SESSION=1` **e** não existir `creds.json` local (evita loop de Connection Closed 428 com snapshot quebrado)

### 5.3 Abertura do socket

Em `connection.ts` → `connectSocket()`:

```text
initAuthState()
→ fetchLatestBaileysVersion()
→ makeWASocket({
     browser: Ubuntu/Chrome,
     syncFullHistory: true,
     auth: creds + signal keys,
     ...
   })
```

Eventos importantes:

| Evento Baileys | O que o bridge faz |
|----------------|--------------------|
| `connection.update` com `qr` | Salva `qr_code` + `status='syncing'` na tabela; também imprime no terminal |
| `connection === 'open'` | `status='connected'`, limpa QR, grava `phone_number` |
| `connection === 'close'` | Reconnect, logout, ou limpa sessão se loop 428 |

### 5.4 Controle via UI (sem chamar Baileys no browser)

Tabela de controle: **`whatsapp_connection`** (singleton).

Fluxo do QR:

1. Admin em `WhatsappView.tsx` clica gerar QR → `UPDATE` com `status='syncing'`, `qr_code=null`
2. Bridge escuta Realtime na tabela
3. Bridge reinicia socket / gera novo QR
4. Bridge grava a string do QR no banco
5. Frontend renderiza com `<QRCodeSVG value={connection.qr_code} />` (`qrcode.react`)
6. Usuário escaneia no celular → Baileys `open` → status `connected`

Desconectar: UI põe `status='disconnected'` → bridge faz `logout` / `end` e limpa sessão se pedido.

---

## 6. Recebimento de mensagens (inbound)

### 6.1 Gatilho

Baileys: `sock.ev.on('messages.upsert')` com `type === 'notify'`  
→ `handleInboundMessages()` / `handleInboundMessage()` em `inbound.ts`

### 6.2 Pipeline (código próprio)

```text
Mensagem WA
  → ignora grupos (@g.us), status@broadcast, shells vazios/protocol
  → se fromMe: sincroniza eco do celular (dedupe por whatsapp_message_id)
  → resolveInboundPeer()  (@lid / @s.whatsapp.net + mapeamento LID)
  → upsertContact()
  → ticket ativo ou createTicket() (+ greeting/NPS se aplicável)
  → se mídia: downloadMediaMessage (Baileys) → upload Storage `chat-media`
  → INSERT em `messages` (sender_type = 'client')
  → atualiza ticket (unread, last_message_at)
  → opcional: triage bot / NPS
  → Supabase Realtime → UI (useMessages)
```

### 6.3 Mídia inbound

1. Download com **Baileys** (`downloadMediaMessage`)
2. Upload no bucket **`chat-media`** (`inbound/{timestamp}-...`)
3. URL pública salva em `messages.media_url`
4. Tipos: texto, image, audio, video, sticker, file (document)

### 6.4 Endereçamento (Baileys 7)

Mensagens frequentemente chegam como `@lid`. O telefone real pode vir em `remoteJidAlt` ou via `signalRepository.lidMapping`. Contatos guardam `phone` e `whatsapp_lid`.

### 6.5 Bot (inline no bridge)

| Módulo | Função |
|--------|--------|
| `bot/triage.ts` | Saudação + menu; opções `1`/`2` roteiam departamento |
| `bot/nps.ts` | Após finalizar ticket, coleta nota 1–5 |

Em triagem, o bot pode chamar `sock.sendMessage` **na hora** e já inserir a mensagem com `whatsapp_delivered: true` (não passa pelo poller).

### 6.6 Mensagens apagadas no WhatsApp

`deleted.ts` — política do produto: **não remove** do CRM (histórico permanece).

---

## 7. Envio de mensagens (outbound)

### 7.1 Padrão: fila no banco (outbox)

O navegador **não** chama `sendMessage` do WhatsApp.

Fluxo do agente:

1. `ChatDetail.tsx` / `ChatView.tsx` faz `INSERT` em `messages` com `whatsapp_delivered: false`
2. Se houver mídia: upload antes para `chat-media`, depois insert com `media_url`
3. Notas internas usam `media_type: 'note'` e **não** vão para o WhatsApp
4. Bridge (`outbound.ts`) faz **poll** a cada `BRIDGE_POLL_INTERVAL_MS` (padrão 5s)

### 7.2 Poller

`startOutboundPoller()` → `processOutboundMessages()`:

```sql
-- conceito (via Supabase client):
SELECT ... FROM messages
WHERE whatsapp_delivered = false
  AND sender_type IN ('agent', 'bot', 'system')
  AND media_type != 'note'
ORDER BY created_at
LIMIT 10
```

Para cada mensagem:

1. Resolve telefone / LID do contato (`resolveOutboundJid` — prefere `@lid`)
2. Monta opção `quoted` se houver `reply_to_message_id`
3. Chama **`sock.sendMessage`** (Baileys):
   - texto → `{ text }`
   - imagem/sticker → `{ image, caption }`
   - áudio → `{ audio, ptt? }` (ogg/opus vira nota de voz)
   - vídeo → `{ video, caption }`
   - documento → `{ document, fileName, caption }`
4. `UPDATE messages SET whatsapp_delivered=true, whatsapp_message_id=...`

Retries: até 5 tentativas em memória; depois “abandona” marcando delivered para não loopar.

### 7.3 Mensagens agendadas

`scheduler.ts` polleda `scheduled_messages` (`sent=false` e horário vencido), envia texto via Baileys e registra em `messages`.

---

## 8. Biblioteca vs código próprio — resumo direto

| Capacidade | Como é feito |
|------------|--------------|
| Conectar no WhatsApp (WebSocket, QR, sessão Signal) | **Biblioteca Baileys** |
| Enviar/receber payload WA | **Biblioteca Baileys** (`sendMessage`, eventos, download de mídia) |
| Fila de envio, tickets, bot de menu, NPS, sync de contatos CRM, avatares, lock de processo, restore de sessão, Realtime control plane | **Código próprio** (inline no bridge) |
| UI CRM, auth, chat | **Código próprio** React + **Supabase JS** |
| Persistência / realtime / arquivos | **API externo: Supabase** |

Conclusão: **não é “só código inline inventando o protocolo WhatsApp”**. O protocolo é a Baileys. O produto (helpdesk, fila, bot, UI) é implementação própria em cima dela + Supabase.

---

## 9. Tabelas / Storage envolvidos no WhatsApp

### Tabelas

| Tabela | Papel |
|--------|--------|
| `whatsapp_connection` | Status, QR, telefone conectado, pedido de sync de contatos |
| `contacts` | `phone`, `whatsapp_lid`, `profile_pic_url`, nome |
| `tickets` | Conversa (triage / attending / finished), departamento, `bot_paused` |
| `messages` | Corpo, mídia, `whatsapp_delivered`, `whatsapp_message_id`, reply |
| `scheduled_messages` | Envio futuro |
| `auto_message_settings` | Textos do bot |
| `nps_ratings` | Notas NPS |

### Storage

| Bucket | Uso |
|--------|-----|
| `chat-media` | Imagens/áudios/vídeos/docs (inbound e outbound) + avatares |
| `whatsapp-session` | Backup privado da pasta de auth Baileys |

---

## 10. Tecnologias do stack (lista fechada)

**Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Lucide, qrcode.react, Supabase JS  

**Bridge:** Node.js, TypeScript (tsx em dev), Baileys 7 RC, Supabase JS (service role), Pino, Boom, qrcode-terminal  

**Plataforma:** Supabase (Postgres + Auth + Realtime + Storage + Edge Functions admin)  

**WhatsApp:** protocolo multi-device via Baileys (não Cloud API oficial)

---

## 11. Como subir (para contextualizar o fluxo)

```bash
# Frontend
npm install
npm run dev

# Bridge (obrigatório para WhatsApp)
cd services/whatsapp-bridge && npm install
# na raiz:
npm run whatsapp:bridge:dev
```

1. Bridge rodando  
2. Admin → tela Conexão WhatsApp → Gerar QR  
3. Escanear no celular  
4. Mensagem recebida → ticket no CRM  
5. Resposta do agente no chat → fila → bridge → WhatsApp

---

## 12. Respostas curtas às perguntas do pedido

| Pergunta | Resposta |
|----------|----------|
| Como conecta? | Bridge Node + Baileys + QR; estado na tabela `whatsapp_connection`; sessão em arquivos locais (+ backup Storage). |
| Como recebe? | Evento Baileys `messages.upsert` → `inbound.ts` → Postgres → Realtime na UI. |
| Como envia? | UI insere mensagem com `whatsapp_delivered=false` → poller `outbound.ts` → `sock.sendMessage`. |
| API externa de WhatsApp? | Não (sem Meta Cloud / Twilio / Evolution). Usa Baileys no protocolo WA. |
| API externa de backend? | Sim: **Supabase**. |
| Biblioteca de envio? | Sim: **`@whiskeysockets/baileys`**. |
| É só código inline? | Orquestração e CRM = código próprio; protocolo WA = biblioteca. |
| É monolítico? | Monorepo/produto único; em runtime são SPA + bridge + Supabase (não um único binário). |
