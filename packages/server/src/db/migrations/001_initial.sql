-- QuoSender v2 — Initial Schema (SQLite)

-- ── Contacts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            TEXT PRIMARY KEY,
  phone_number  TEXT NOT NULL UNIQUE,
  name          TEXT,
  metadata      TEXT DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Conversations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                    TEXT PRIMARY KEY,
  contact_id            TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL DEFAULT 'sms',
  unread_count          INTEGER NOT NULL DEFAULT 0,
  last_message_preview  TEXT,
  last_message_at       TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
  ON conversations (contact_id);

-- ── Messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed')),
  external_id       TEXT,
  metadata          TEXT DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_status_pending
  ON messages (status)
  WHERE status IN ('queued', 'sending');
