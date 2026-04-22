# QuoSender v2

Local-first chat inbox app with an operator UI for managing SMS conversations. Built tightly around the **Quo API** for inbound live webhook ingestion and historical syncing, while operating seamlessly with a fully local frontend and outbound sandbox adapter.

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Next.js UI     │─────▶│  Express API     │─────▶│  Sender Adapter │
│  :3000          │      │  :4000           │      │  :4001          │
└─────────────────┘      └────────┬─────────┘      └─────────────────┘
                                  │
                         ┌────────▼─────────┐
                         │  SQLite DB       │
                         │  (data/*.db)     │
                         └──────────────────┘
```

- **Express API** — Source of truth. Manages contacts, conversations, messages, and handles incoming webhooks + Quo API synchronization.
- **Sender Adapter** — Stateless transport sandbox. Receives `POST /internal/send`.
- **Next.js UI** — Operator inbox with real-time-like experience via active backend polling.

## Prerequisites

- Node.js 18+
- npm 7+ (workspaces support)
- Quo API credentials (Token & Webhook capabilities)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```
Edit `.env` to set your **Quo API Key**:
```env
QUO_API_KEY=your_api_key_here
QUO_BASE_URL=https://api.openphone.com
```

### 3. Run SQLite migrations and seed dummy UI data

```bash
npm run db:migrate
npm run db:seed
```

### 4. Start everything with one command

```bash
npm run dev
```

This launches API (`:4000`), sender adapter (`:4001`), and web UI (`:3000`) together in a single terminal.

### 5. (Optional) Start services individually

```bash
# Terminal 1: API server
npm run dev:server

# Terminal 2: Sender adapter
npm run dev:sender

# Terminal 3: Frontend (once built)
npm run dev:web
```

---

## Live Quo Integration

This application relies on the **Quo Webhook** to behave as the source of live incoming message ingestion. 

### Registering Webhooks
Set the designated webhook URL in your upstream service/Quo settings to:
`POST {YOUR_PUBLIC_URL_TO_HOST}/webhooks/quo/messages`

- Resolves conversations magically via sender phone mapping.
- Unconditionally deduplicates based on the external `id`. 
- Keeps the frontend immediately updated via lazy loads.

### Initial Synchronization & Backfilling
If you've just deployed this container, you'll want to pre-load history from the upstream Quo API endpoints directly into your local database. 

Simply call:
```bash
curl -X POST http://localhost:4000/admin/sync/quo/conversations
```
And then load up specific messages onto an existing thread:
```bash
curl -X POST http://localhost:4000/admin/sync/quo/messages \
  -H "Content-Type: application/json" \
  -d '{"externalConversationId":"quo_cv_abc123"}'
```

---

## Tech Stack

- TypeScript throughout
- Express 4 (API REST logic)
- SQLite with `better-sqlite3` driver
- Next.js 14 (Frontend Inbox Application)
- npm workspaces (monorepo structure)
