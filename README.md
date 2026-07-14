# HelpDesk WhatsApp CRM

Sistema web completo de controle de atendimento (Helpdesk/CRM) integrado ao WhatsApp, com design dark mode moderno em tons de azul escuro e preto.

## Sumário

- [Visão Geral](#visão-geral)
- [Arquitetura do Projeto](#arquitetura-do-projeto)
- [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
- [Comunicação entre Componentes](#comunicação-entre-componentes)
- [Funcionalidades](#funcionalidades)
- [Como Rodar o Projeto](#como-rodar-o-projeto)
- [Integração com WhatsApp](#integração-com-whatsapp)
- [Autenticação e Permissões](#autenticação-e-permissões)

---

## Visão Geral

Este sistema é um Helpdesk/CRM completo para atendimento via WhatsApp, construído com:

- **Frontend:** React + TypeScript + Vite
- **Estilização:** Tailwind CSS (tema escuro customizado)
- **Ícones:** Lucide React
- **Backend/Banco de Dados:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Tempo Real:** Supabase Realtime (WebSockets para mensagens e tickets ao vivo)

---

## Arquitetura do Projeto

```
src/
├── App.tsx                      # Componente raiz - roteamento entre telas
├── main.tsx                     # Entry point do React
├── index.css                    # Estilos globais + Tailwind + tema dark
├── lib/
│   └── supabase.ts              # Cliente Supabase singleton
├── types/
│   └── index.ts                 # Tipos TypeScript + constantes (labels, cores)
├── context/
│   └── AuthContext.tsx          # Contexto de autenticação (login/signup/session)
├── hooks/
│   ├── useData.ts               # Hooks de dados (tickets, messages, contacts, etc.)
│   └── useNotifications.ts      # Hook de notificações visuais e sonoras
└── components/
    ├── AuthScreen.tsx           # Tela de login/cadastro
    ├── layout/
    │   └── Sidebar.tsx          # Menu lateral de navegação
    └── views/
        ├── Dashboard.tsx        # Painel principal com métricas + export CSV
        ├── ChatView.tsx         # Chat/Tickets (Kanban + interface de chat)
        ├── ContactsView.tsx     # Agenda de contatos
        ├── UsersView.tsx        # Gestão de usuários e permissões
        ├── WhatsappView.tsx     # Conexão WhatsApp (QR Code)
        ├── AutoMessagesView.tsx # Configuração de mensagens automáticas
        ├── TagsView.tsx         # Gestão de etiquetas
        └── CannedView.tsx       # Respostas rápidas (canned responses)

services/
└── whatsapp-bridge/             # Serviço Node.js + Baileys (conexão WhatsApp 24/7)

supabase/
├── functions/
│   ├── admin-create-user/       # Edge Function: criar usuários (admin)
│   └── admin-delete-user/       # Edge Function: remover usuários (admin)
└── migrations/                  # Schema PostgreSQL + RLS + Storage
```

### Padrões Arquiteturais

1. **Singleton Supabase Client:** Uma instância do cliente Supabase é criada em `lib/supabase.ts` e importada em todos os hooks e componentes.

2. **Custom Hooks para Dados:** Cada entidade do banco tem um hook dedicado em `hooks/useData.ts` que:
   - Busca dados iniciais do Supabase
   - Inscreve em mudanças em tempo real (Realtime)
   - Expõe estado de loading e função de refetch

3. **AuthContext:** Gerencia sessão, perfil, login, signup e logout. O perfil do usuário é buscado da tabela `profiles` que estende `auth.users`.

4. **Comunicação entre telas:** O `App.tsx` mantém o estado da aba ativa e coordenadas de pré-seleção (ex: clicar "Nova Conversa" em Contatos navega para Chat com o ticket pré-selecionado).

---

## Estrutura do Banco de Dados

O banco de dados é hospedado no Supabase (PostgreSQL). Todas as tabelas têm RLS (Row Level Security) habilitada.

### Tabelas

| Tabela | Descrição |
|---|---|
| `profiles` | Extensão de `auth.users` com nome, role (admin/agent), departamento, limite de chats, horário de expediente |
| `contacts` | Contatos do WhatsApp (nome, telefone, foto de perfil) |
| `tickets` | Conversas/tickets com status (triage/attending/finished), departamento, atendente, `bot_paused` |
| `messages` | Mensagens com suporte a texto, imagem, áudio, arquivo, notas internas e rastreamento de exclusão |
| `tags` | Etiquetas coloridas para organização de tickets |
| `ticket_tags` | Relação N:N entre tickets e tags |
| `canned_responses` | Respostas rápidas com atalho (ex: /pix) |
| `scheduled_messages` | Mensagens agendadas para envio futuro |
| `nps_ratings` | Avaliações de satisfação (1-5) por ticket |
| `auto_message_settings` | Configurações de mensagens automáticas (singleton) |
| `whatsapp_connection` | Estado da conexão WhatsApp (singleton) |

### RLS (Row Level Security)

- Todos os dados de helpdesk (tickets, contatos, mensagens, tags) são compartilhados entre agentes autenticados (`TO authenticated USING (true)`)
- Gestão de perfis (criar/editar/remover usuários) é restrita a admins
- Usuários podem editar seu próprio perfil

### Trigger de Auto-criação de Perfil

Quando um usuário se cadastra no Supabase Auth, um trigger `handle_new_user()` cria automaticamente um perfil na tabela `profiles`. O **primeiro usuário** recebe role `admin` automaticamente; os subsequentes recebem `agent`.

---

## Comunicação entre Componentes

```
App.tsx
  ├── AuthProvider (contexto de auth)
  │     └── AuthContext (session, profile, signIn, signUp, signOut)
  │
  ├── Sidebar (navegação entre abas)
  │     └── notifica tab ativa via onNavigate(tabId)
  │
  └── Main Content (renderiza a view ativa)
        ├── Dashboard → onNavigateToChat()
        ├── ChatView → usa useTickets(), useMessages(), useTags(), etc.
        │     ├── Kanban Board (3 colunas: Triagem, Em Atendimento, Finalizados)
        │     ├── Chat Detail (mensagens + input + painel lateral)
        │     └── Realtime: mensagens chegam via WebSocket
        ├── ContactsView → onStartConversation(ticketId) → navega para Chat
        ├── UsersView → CRUD de perfis (admin only)
        ├── WhatsappView → estado da conexão
        ├── AutoMessagesView → editar configurações de bot
        ├── TagsView → CRUD de etiquetas
        └── CannedView → CRUD de respostas rápidas
```

### Fluxo de Dados em Tempo Real

1. Cliente envia mensagem no WhatsApp
2. WhatsApp Bridge recebe via Baileys e insere no banco (`messages`, `tickets`)
3. Supabase Realtime notifica o frontend via WebSocket
4. Hook `useMessages` atualiza a lista de mensagens
5. Hook `useNotifications` dispara alerta visual + sonoro

---

## Funcionalidades

### 1. Dashboard
- Métricas: conversas ativas, tickets finalizados, tempo médio de resposta, tickets em aberto
- Gráfico de NPS (avaliação de satisfação)
- Exportação de contatos e tickets finalizados em CSV
- Lista de tickets recentes

### 2. Chat / Tickets
- Visualização Kanban (Triagem, Em Atendimento, Finalizados) ou Lista
- Cada conversa funciona como um Ticket
- Interface de chat com foto, nome e telefone do cliente
- Suporte a emojis, envio de arquivos/fotos/áudios
- **Histórico preservado:** se o cliente apagar uma mensagem no WhatsApp, ela permanece intacta no painel para o agente
- **Pausar bot (por ticket):** no menu de ações, pausa greeting/menu/triagem/NPS enquanto o contato fala com outro bot; mensagens do cliente continuam sendo gravadas
- **Notas Internas:** observações com fundo amarelo, visíveis apenas para atendantes
- **Transferência:** transferir ticket para outro agente ou voltar para triagem
- **Etiquetas:** aplicar tags coloridas aos tickets
- **Respostas Rápidas:** digitar `/atalho` para preencher texto longo
- **Agendamento de Mensagens:** programar envio para data/hora específica
- **Histórico Unificado:** painel lateral com histórico do cliente, atendentes e tags

### 3. Bot de Triagem (Autoatendimento)
- Mensagem de boas-vindas automática para clientes novos
- Menu numérico (1-Suporte, 2-Vendas)
- Roteamento automático por departamento
- Pausável por ticket quando há outro bot integrado ativo

### 4. Recursos Avançados
- Sistema de Tags/Etiquetas coloridas
- Respostas Rápidas (Canned Responses) com atalhos
- Notas Internas (não enviadas ao WhatsApp)
- Transferência de Atendimento
- Notificações visuais e sonoras no navegador
- Sincronização de mensagens enviadas pelo WhatsApp oficial (celular/Web) para o painel

### 5. Agenda de Contatos
- Sincronização de contatos
- Lista completa com busca
- Botão "Iniciar Nova Conversa" que cria ticket e redireciona para o chat

### 6. Gestão de Usuários
- Criar usuários diretamente na tela
- Níveis: Administrador e Agente
- Departamentos: Administrador, Suporte, Comercial
- Configurações por agente: limite de chats simultâneos, horário de expediente
- Apenas admin acessa gestão de usuários

### 7. Conexão WhatsApp (QR Code)
- Tela dedicada para QR Code de autenticação
- Indicador de status (Conectado, Desconectado, Sincronizando)

### 8. Mensagens Automáticas
- Configurar saudação do bot, menu de opções, mensagem de assunção, finalização e NPS
- Ativar/desativar árvore do menu

### 9. NPS (Pesquisa de Satisfação)
- Ao finalizar ticket, envia pergunta automática "Digite de 1 a 5"
- Resultados alimentam gráfico no Dashboard

---

## Como Rodar o Projeto

### Pré-requisitos

- Node.js 20+
- Conta Supabase com projeto criado
- Supabase CLI (`supabase link`, `supabase db push`)

### Variáveis de ambiente

Copie `.env.example` para `.env` na raiz:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Para o WhatsApp Bridge, copie `services/whatsapp-bridge/.env.example` para `services/whatsapp-bridge/.env`:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
BRIDGE_POLL_INTERVAL_MS=5000
```

### Instalação

```bash
npm install
cd services/whatsapp-bridge && npm install && cd ../..
```

### Banco de dados e Edge Functions

```bash
supabase db push
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
```

### Desenvolvimento (3 terminais)

**Terminal 1 — Frontend:**
```bash
npm run dev
```

**Terminal 2 — WhatsApp Bridge:**
```bash
npm run whatsapp:bridge:dev
```

**Terminal 3 (opcional) — Supabase local:**
```bash
supabase start
```

### Build de Produção

```bash
npm run build
npm run whatsapp:bridge:build
```

### Verificação de Tipos

```bash
npm run typecheck
```

### Primeiro Acesso

1. Acesse o sistema no navegador (`http://localhost:5173`)
2. Clique em "Cadastrar" para criar a primeira conta
3. O primeiro usuário se torna **Administrador** automaticamente
4. Inicie o WhatsApp Bridge (`npm run whatsapp:bridge:dev`)
5. Vá em "Conexão WhatsApp" → "Gerar QR Code" → escaneie com o celular
6. Crie agentes em "Usuários" e configure seus departamentos

### Test plan (aceitação manual)

1. **Auth:** primeiro signup vira admin; admin cria agente sem deslogar
2. **Chat:** enviar texto e imagem; mídia aparece com URL válida
3. **Realtime:** abrir 2 abas; mensagem em uma aparece na outra
4. **WhatsApp:** gerar QR real, escanear, receber mensagem → ticket em triagem
5. **Bot:** cliente digita `1` → ticket vai para suporte
6. **Outbound:** agente responde no chat → mensagem chega no WhatsApp
7. **Agendada:** agendar mensagem → enviada no horário pelo bridge
8. **NPS:** finalizar ticket → pergunta NPS; resposta 1-5 salva
9. **Badge:** contador de não lidas reflete na sidebar

---

## Integração com WhatsApp

### Arquitetura

O Baileys exige uma conexão WebSocket **persistente 24/7**, portanto roda em um serviço Node.js dedicado (`services/whatsapp-bridge/`), não em Edge Functions serverless.

```
Frontend (Vite)  ──►  Supabase (DB + Realtime + Storage)
                            ▲
WhatsApp Bridge  ───────────┘  (service role key)
       │
       ▼
 WhatsApp Servers
```

**Componentes:**

| Componente | Responsabilidade |
|---|---|
| `services/whatsapp-bridge/` | Conexão Baileys, QR Code, inbound/outbound, bot, agendamento |
| `supabase/functions/admin-create-user` | Criar usuários (admin only, service role) |
| `supabase/functions/admin-delete-user` | Remover usuários do Auth |
| `whatsapp_connection` (tabela) | Controle de estado: disconnected → syncing → connected |
| `messages.whatsapp_delivered` | Fila de mensagens pendentes para envio ao WhatsApp |

### Fluxo completo

1. **Conexão:**
   - Admin clica "Gerar QR Code" → `whatsapp_connection.status = 'syncing'`
   - Bridge detecta via Realtime e inicia sessão Baileys
   - QR é salvo em `whatsapp_connection.qr_code` → frontend renderiza com `qrcode.react`
   - Após escanear → `status = 'connected'`, `phone_number` preenchido

2. **Recebimento:**
   - Mensagem WhatsApp → bridge cria/atualiza `contacts`, `tickets`, `messages`
   - Mensagens enviadas pelo app oficial (celular/Web) no número vinculado também são sincronizadas (`fromMe`), com dedupe do eco do outbound do CRM
   - Bot envia saudação + menu se ticket em triagem e `bot_paused = false`
   - Cliente digita `1` ou `2` → departamento atualizado

3. **Envio:**
   - Agente insere mensagem com `whatsapp_delivered = false`
   - Bridge faz poll e envia via Baileys → marca `whatsapp_delivered = true`

4. **Mensagem apagada no WhatsApp:**
   - Evento revoke do Baileys é ignorado — a mensagem permanece intacta no CRM para o agente

5. **Pausar bot:**
   - Agente ativa `tickets.bot_paused` no chat → greeting, menu, triagem e NPS automáticos são ignorados naquele ticket; mensagens do cliente continuam sendo gravadas

6. **Mensagens agendadas:**
   - Bridge faz poll em `scheduled_messages` e envia no horário

7. **NPS:**
   - Ao finalizar ticket, mensagem de NPS é enfileirada
   - Resposta 1-5 do cliente atualiza `nps_ratings` (exceto se o ticket estiver com bot pausado)

### Deploy do Bridge

**Docker:**
```bash
cd services/whatsapp-bridge
docker build -t whatsapp-bridge .
docker run -d --env-file .env --name whatsapp-bridge whatsapp-bridge
```

**PM2 (VPS):**
```bash
cd services/whatsapp-bridge
npm run build
pm2 start dist/index.js --name whatsapp-bridge
```

### Troubleshooting

| Problema | Solução |
|---|---|
| QR não aparece | Verifique se o bridge está rodando (`npm run whatsapp:bridge:dev`) |
| Upload de mídia falha | Execute `supabase db push` para criar bucket `chat-media` |
| Mensagens não atualizam ao vivo | Migration de Realtime aplicada? |
| Admin não cria usuários | Deploy das Edge Functions `admin-create-user` |
| Bridge offline na UI | Alerta aparece após 15s em status `syncing` sem QR |

### Variáveis do Bridge

- `SUPABASE_URL` — URL do projeto
- `SUPABASE_SERVICE_ROLE_KEY` — chave service role (nunca no frontend)
- `BRIDGE_POLL_INTERVAL_MS` — intervalo de poll (default 5000ms)
- `WHATSAPP_RESTORE_SESSION` — `1` para restaurar backup de sessão do Storage (cuidado com sessões antigas)

**Nota sobre criptografia:** o WhatsApp sempre usa E2E na rede. O bridge (Baileys) descriptografa e o CRM grava texto/mídia em claro no Postgres/Storage. Não há criptografia adicional de mensagens no CRM; a sessão Baileys é armazenada em arquivos locais e no bucket privado `whatsapp-session`.

---

## Autenticação e Permissões

### Níveis de Acesso

| Recurso | Admin | Agente |
|---|---|---|
| Dashboard | Sim | Sim |
| Chat / Tickets | Sim (todos) | Sim (seu departamento) |
| Contatos | Sim | Sim |
| Gestão de Usuários | Sim | Não |
| Conexão WhatsApp | Sim | Sim (visualização) |
| Mensagens Automáticas | Sim | Não |
| Etiquetas | Sim | Sim |
| Respostas Rápidas | Sim | Sim |

### Departamentos

- **Administrador:** Acesso a todos os departamentos e tickets
- **Suporte:** Vê tickets do departamento Suporte + Triagem
- **Comercial:** Vê tickets do departamento Comercial + Triagem

### Roteamento do Bot

Quando o bot está ativo e um cliente novo envia mensagem:
1. Sistema cria ticket em status `triage`
2. Envia mensagem de boas-vindas + menu de opções
3. Cliente digita "1" → ticket categorizado como `support`
4. Cliente digita "2" → ticket categorizado como `sales`

Se o agente pausar o bot naquele ticket (`bot_paused`), os passos 2–4 e o NPS automático ficam desligados até retomar.
5. Ticket aparece na fila de triagem para agentes do departamento correspondente
