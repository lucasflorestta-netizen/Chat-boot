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
| `tickets` | Conversas/tickets com status (triage/attending/finished), departamento, atendente atribuído |
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
2. Webhook (Edge Function) recebe a mensagem e insere no banco
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
- **Mensagem Apagada:** tag visual "Mensagem apagada pelo cliente" com conteúdo original preservado
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

### 4. Recursos Avançados
- Sistema de Tags/Etiquetas coloridas
- Respostas Rápidas (Canned Responses) com atalhos
- Notas Internas (não enviadas ao WhatsApp)
- Transferência de Atendimento
- Notificações visuais e sonoras no navegador

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

- Node.js 18+
- As variáveis de ambiente do Supabase já estão configuradas em `.env`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Instalação

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

O servidor de desenvolvimento iniciará automaticamente.

### Build de Produção

```bash
npm run build
```

### Verificação de Tipos

```bash
npm run typecheck
```

### Primeiro Acesso

1. Acesse o sistema no navegador
2. Clique em "Cadastrar" para criar a primeira conta
3. O primeiro usuário se torna **Administrador** automaticamente
4. Após o login, você terá acesso a todas as funcionalidades
5. Crie agentes em "Usuários" e configure seus departamentos

---

## Integração com WhatsApp

### Arquitetura da Integração

A integração com WhatsApp utiliza a biblioteca **Baileys** (ou Venom) para conectar ao WhatsApp Web via API. O fluxo completo em produção é:

1. **Conexão:**
   - O admin gera o QR Code na tela "Conexão WhatsApp"
   - A Edge Function do Supabase inicia uma sessão Baileys
   - O QR Code é exibido no frontend
   - O admin escaneia com o WhatsApp Mobile → conexão estabelecida

2. **Recebimento de Mensagens:**
   - Mensagens recebidas no WhatsApp disparam um webhook
   - A Edge Function processa a mensagem:
     - Se o contato não existe, cria na tabela `contacts`
     - Se não há ticket ativo, cria um novo ticket em `triage`
     - Se o bot estiver ativo, envia a mensagem de boas-vindas e menu
     - Se o cliente digitar "1" ou "2", categoriza o ticket no departamento correspondente
     - Insere a mensagem na tabela `messages`

3. **Envio de Mensagens:**
   - Quando o agente envia uma mensagem no chat, ela é inserida no banco
   - A Edge Function detecta a nova mensagem e a envia via Baileys para o WhatsApp do cliente

4. **Mensagem Apagada:**
   - Se o cliente apaga uma mensagem no WhatsApp, o webhook recebe o evento
   - A Edge Function marca `is_deleted = true` e preserva `original_body`
   - O frontend exibe a tag "Mensagem apagada pelo cliente" com o conteúdo original

5. **NPS:**
   - Ao finalizar um ticket, o sistema envia a pergunta de NPS
   - Quando o cliente responde com 1-5, a Edge Function atualiza `nps_ratings.rating`

### Edge Function (Webhook WhatsApp)

Para ativar a integração em produção, deploy uma Edge Function no Supabase:

```
supabase/functions/whatsapp-webhook/index.ts
```

Esta função:
- Mantém a sessão Baileys ativa
- Recebe mensagens do WhatsApp e insere no banco
- Monitora a tabela `messages` para enviar mensagens dos agentes
- Processa eventos de exclusão de mensagens
- Executa o fluxo do bot de triagem

### Configuração de Segredes

Os seguintes segredos são necessários para a Edge Function (configurados automaticamente no painel do Supabase):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_SESSION_SECRET` (opcional, para criptografia da sessão Baileys)

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
5. Ticket aparece na fila de triagem para agentes do departamento correspondente
