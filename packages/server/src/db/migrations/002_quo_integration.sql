-- QuoSender v2 — Migration 002: Quo Integration Updates
-- Run: npm run db:migrate

BEGIN;

-- Extend conversations table
ALTER TABLE conversations ADD COLUMN external_conversation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_id 
  ON conversations (external_conversation_id) WHERE external_conversation_id IS NOT NULL;

-- Extend messages table
-- We rename external_id to external_message_id for clarity
ALTER TABLE messages RENAME COLUMN external_id TO external_message_id;

ALTER TABLE messages ADD COLUMN transport TEXT DEFAULT 'local_adapter';
ALTER TABLE messages ADD COLUMN sender_number TEXT;
ALTER TABLE messages ADD COLUMN recipient_number TEXT;
ALTER TABLE messages ADD COLUMN error_message TEXT;
ALTER TABLE messages ADD COLUMN sent_at TEXT;
ALTER TABLE messages ADD COLUMN failed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id 
  ON messages (external_message_id) WHERE external_message_id IS NOT NULL;

COMMIT;
