import { db } from '../db/database';
import { MessageRow, PaginatedResponse, MessageStatus, MessageTransport } from '../types';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

export class MessageService {
  /**
   * Paginated messages for a conversation, newest first.
   * Cursor = message created_at ISO string.
   */
  listByConversation(
    conversationId: string,
    cursor?: string,
    limit?: number
  ): PaginatedResponse<MessageRow> {
    const pageSize = limit || config.pageSize;
    const fetchSize = pageSize + 1;

    let rows: MessageRow[];

    if (cursor) {
      const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      rows = stmt.all(conversationId, cursor, fetchSize) as MessageRow[];
    } else {
      const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      rows = stmt.all(conversationId, fetchSize) as MessageRow[];
    }

    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore && data.length > 0
      ? data[data.length - 1].created_at as unknown as string
      : null;

    return { data, cursor: nextCursor, hasMore };
  }

  /**
   * Complete create payload specifically for webhooks/sync insertion
   */
  createFull(payload: {
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    body: string;
    status: MessageStatus;
    transport: MessageTransport;
    external_message_id?: string;
    sender_number?: string;
    recipient_number?: string;
    error_message?: string;
    created_at?: string;
    sent_at?: string;
    failed_at?: string;
  }): MessageRow {
    
    // Deduplication by external_message_id
    if (payload.external_message_id) {
       const existing = db.prepare('SELECT * FROM messages WHERE external_message_id = ?').get(payload.external_message_id) as MessageRow | undefined;
       if (existing) {
         return existing;
       }
    }

    const id = uuidv4();
    const createdTs = payload.created_at || new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, direction, body, status, transport, 
        external_message_id, sender_number, recipient_number, error_message,
        created_at, sent_at, failed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, payload.conversation_id, payload.direction, payload.body, payload.status, payload.transport,
      payload.external_message_id || null, payload.sender_number || null, payload.recipient_number || null,
      payload.error_message || null, createdTs, payload.sent_at || null, payload.failed_at || null
    );

    return this.getById(id)!;
  }

  /**
   * Create a new simple message (used mostly for outbound).
   */
  create(
    conversationId: string,
    direction: 'inbound' | 'outbound',
    body: string,
    status: MessageStatus = 'queued',
    externalId?: string
  ): MessageRow {
    return this.createFull({
      conversation_id: conversationId,
      direction,
      body,
      status,
      transport: 'local_adapter',
      external_message_id: externalId
    });
  }

  /**
   * Update message status.
   */
  updateStatus(
    messageId: string,
    status: MessageStatus,
    externalId?: string,
    errorMessage?: string
  ): MessageRow | null {
    const errorBit = errorMessage ? `, error_message = ?` : ``;
    
    if (externalId && errorMessage) {
        db.prepare(`UPDATE messages SET status = ?, external_message_id = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(status, externalId, errorMessage, messageId);
    } else if (externalId) {
      db.prepare(`UPDATE messages SET status = ?, external_message_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(status, externalId, messageId);
    } else if (errorMessage) {
      db.prepare(`UPDATE messages SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(status, errorMessage, messageId);
    } else {
      db.prepare(`UPDATE messages SET status = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(status, messageId);
    }

    return this.getById(messageId);
  }

  /**
   * Get a single message by ID.
   */
  getById(id: string): MessageRow | null {
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    return (stmt.get(id) as MessageRow) || null;
  }
}

export const messageService = new MessageService();
