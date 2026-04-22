// ── Enums ──────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'received';
export type MessageTransport = 'webhook' | 'quo_sync' | 'local_adapter' | 'manual' | 'api';

// ── Database Row Types ─────────────────────────────────

export interface ContactRow {
  id: string;
  phone_number: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  contact_id: string;
  external_conversation_id: string | null;
  channel: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  transport: MessageTransport;
  external_message_id: string | null;
  sender_number: string | null;
  recipient_number: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  failed_at: string | null;
}

// ── API Types ──────────────────────────────────────────

export interface ConversationListItem extends ConversationRow {
  contact_name: string | null;
  contact_phone: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SendMessageRequest {
  conversationId: string;
  body: string;
  flowId?: string;
}

export interface WebhookMessageRequest {
  from: string;
  to?: string;
  body: string;
  externalId?: string;
  channel?: string;
  contactName?: string;
}

export interface SenderPayload {
  messageId: string;
  flowId: string;
  to: string;
  body: string;
}

export interface SenderResponse {
  success: boolean;
  externalId?: string;
  error?: string;
}
