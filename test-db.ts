import { db } from './packages/server/src/db/database';

const queries = [
  "ALTER TABLE conversations ADD COLUMN external_conversation_id TEXT;",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_ext_id ON conversations (external_conversation_id) WHERE external_conversation_id IS NOT NULL;",
  "ALTER TABLE messages ADD COLUMN transport TEXT DEFAULT 'local_adapter';",
  "ALTER TABLE messages ADD COLUMN sender_number TEXT;",
  "ALTER TABLE messages ADD COLUMN recipient_number TEXT;",
  "ALTER TABLE messages ADD COLUMN error_message TEXT;",
  "ALTER TABLE messages ADD COLUMN sent_at TEXT;",
  "ALTER TABLE messages ADD COLUMN failed_at TEXT;",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id ON messages (external_id) WHERE external_id IS NOT NULL;"
];

for (const q of queries) {
  try {
    db.exec(q);
    console.log("SUCCESS:", q);
  } catch (e: any) {
    if (!e.message.includes("duplicate column name")) {
      console.log("ERROR:", e.message, "---", q);
    } else {
      console.log("Column exists:", q);
    }
  }
}
