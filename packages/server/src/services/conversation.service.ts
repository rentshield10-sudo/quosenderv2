import { db } from '../db/database';
import { ConversationRow, ConversationListItem, PaginatedResponse } from '../types';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

export class ConversationService {
  /**
   * Paginated inbox list, ordered by last_message_at DESC.
   * Uses cursor-based pagination (cursor = last_message_at ISO string).
   */
  list(cursor?: string, limit?: number): PaginatedResponse<ConversationListItem> {
    const pageSize = limit || config.pageSize;
    const fetchSize = pageSize + 1;

    let rows: ConversationListItem[];

    // Ensure we handle SQLite datetime mapping safely
    if (cursor) {
      const stmt = db.prepare(`
        SELECT c.*, ct.name AS contact_name, ct.phone_number AS contact_phone
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        WHERE c.last_message_at < ?
        ORDER BY c.last_message_at DESC
        LIMIT ?
      `);
      rows = stmt.all(cursor, fetchSize) as ConversationListItem[];
    } else {
      const stmt = db.prepare(`
        SELECT c.*, ct.name AS contact_name, ct.phone_number AS contact_phone
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        ORDER BY c.last_message_at DESC
        LIMIT ?
      `);
      rows = stmt.all(fetchSize) as ConversationListItem[];
    }

    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore && data.length > 0
      ? data[data.length - 1].last_message_at ?? null
      : null;

    return { data, cursor: nextCursor, hasMore };
  }

  /**
   * Get a single conversation by ID.
   */
  getById(id: string): ConversationListItem | null {
    const stmt = db.prepare(`
      SELECT c.*, ct.name AS contact_name, ct.phone_number AS contact_phone
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.id = ?
    `);
    return (stmt.get(id) as ConversationListItem) || null;
  }

  getOrCreateByExternalId(externalId: string, phoneNumber: string, channel: string = 'sms', contactName?: string): ConversationListItem {
    // 1. Try to find the conversation by external ID
    let conv = db.prepare(`
      SELECT c.*, ct.name AS contact_name, ct.phone_number AS contact_phone
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.external_conversation_id = ?
    `).get(externalId) as ConversationListItem | undefined;

    if (conv) return conv;

    // 2. Otherwise use findOrCreate generic logic but stamp the external_conversation_id
    const newConv = this.findOrCreate(phoneNumber, channel, contactName);
    
    db.prepare(`UPDATE conversations SET external_conversation_id = ? WHERE id = ?`)
      .run(externalId, newConv.id);
      
    return this.getById(newConv.id)!;
  }

  /**
   * Mark a conversation as read (reset unread_count to 0).
   */
  markAsRead(id: string): ConversationRow | null {
    const stmt = db.prepare(
      `UPDATE conversations SET unread_count = 0, updated_at = datetime('now') WHERE id = ? RETURNING *`
    );
    return (stmt.get(id) as ConversationRow) || null;
  }

  /**
   * Update conversation's last message preview and timestamp.
   * Optionally increment unread count (for inbound messages).
   */
  updateLastMessage(conversationId: string, preview: string, incrementUnread: boolean, timestampOverride?: string): void {
    const ts = timestampOverride || new Date().toISOString();
    
    if (incrementUnread) {
      db.prepare(`
        UPDATE conversations
        SET last_message_preview = ?,
            last_message_at = MAX(COALESCE(last_message_at, ''), ?),
            unread_count = unread_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(preview.slice(0, 200), ts, conversationId);
    } else {
      db.prepare(`
        UPDATE conversations
        SET last_message_preview = ?,
            last_message_at = MAX(COALESCE(last_message_at, ''), ?),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(preview.slice(0, 200), ts, conversationId);
    }
  }

  /**
   * Find or create a conversation for a given phone number + channel.
   * Also find-or-creates the contact.
   */
  findOrCreate(phoneNumber: string, channel: string = 'sms', contactName?: string): ConversationListItem {
    // Upsert contact safely
    const contactId = uuidv4();
    db.prepare(`
      INSERT INTO contacts (id, phone_number, name)
      VALUES (?, ?, ?)
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
        updated_at = datetime('now')
    `).run(contactId, phoneNumber, contactName || null);

    const contact = db.prepare('SELECT * FROM contacts WHERE phone_number = ?').get(phoneNumber) as any;

    // Find existing conversation across this channel and contact
    const existing = db.prepare(`
      SELECT c.*, ct.name AS contact_name, ct.phone_number AS contact_phone
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.contact_id = ? AND c.channel = ?
      LIMIT 1
    `).get(contact.id, channel) as ConversationListItem | undefined;

    if (existing) {
      return existing;
    }

    // Create new conversation
    const convId = uuidv4();
    db.prepare(`
      INSERT INTO conversations (id, contact_id, channel)
      VALUES (?, ?, ?)
    `).run(convId, contact.id, channel);

    return this.getById(convId)!;
  }
}

export const conversationService = new ConversationService();
