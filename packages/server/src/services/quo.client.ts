import { config } from '../config';

export interface QuoConversation {
  id: string;
  contactId?: string;
  channel?: string;
  lastMessageSnippet?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt?: string;
  name?: string | null;
  participants?: string[];
  phoneNumberId?: string;
}

export interface QuoMessage {
  id: string;
  conversationId?: string;
  direction?: string;
  body?: string;
  text?: string;
  status?: string;
  fromNumber?: string;
  toNumber?: string;
  from?: string;
  to?: string;
  createdAt?: string;
  sentAt?: string;
  failedAt?: string;
  errorMessage?: string;
}

export interface QuoPaginated<T> {
  data: T[];
  hasNextPage?: boolean;
  nextCursor?: string;
  nextPageToken?: string | null;
  totalItems?: number;
}

export class QuoClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.quoBaseUrl;
    this.apiKey = config.quoApiKey;
  }

  private async fetchQuo<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    if (!this.apiKey || this.apiKey === 'your_api_key_here') {
      throw {
        message: 'QUO_API_KEY is missing or invalid in environment',
        upstreamUrl: url,
        hasKey: !!this.apiKey
      };
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Authorization': this.apiKey, // Uses raw API key as requested
          'Content-Type': 'application/json',
          ...(options?.headers || {})
        }
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unparsable error body');
        throw {
          message: `Quo upstream error: ${res.statusText}`,
          upstreamStatus: res.status,
          upstreamBody: errText,
          upstreamUrl: url
        };
      }

      return res.json() as Promise<T>;
    } catch (err: any) {
      if (err.upstreamStatus || err.upstreamUrl) throw err; // Rethrow structured error
      throw {
        message: 'Network or parse failure reaching Quo',
        upstreamUrl: url,
        details: err.message || err.toString()
      };
    }
  }

  /**
   * List conversations from Quo API.
   * Can be used for initial backfill/sync.
   */
  async listConversations(params?: { limit?: number; cursor?: string }): Promise<QuoPaginated<QuoConversation>> {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.cursor) query.append('pageToken', params.cursor);

    return this.fetchQuo<QuoPaginated<QuoConversation>>(`/v1/conversations?${query.toString()}`);
  }

  /**
   * List messages for a conversation from Quo API.
   * Used for initial payload ingestion.
   */
  async listMessages(phoneNumberId: string, participants: string[], params?: { limit?: number; cursor?: string }): Promise<QuoPaginated<QuoMessage>> {
    const query = new URLSearchParams();
    query.append('phoneNumberId', phoneNumberId);
    
    // Quo documentation explicitly requires `participants` for fetching messages
    if (participants && participants.length > 0) {
       for (const p of participants) {
           query.append('participants', p);
       }
    }
    
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.cursor) query.append('pageToken', params.cursor); 

    const finalUrl = `/v1/messages?${query.toString()}`;
    console.log('Quo GET listMessages URL:', finalUrl);

    return this.fetchQuo<QuoPaginated<QuoMessage>>(finalUrl);
  }

  /**
   * Single message lookup.
   */
  async getMessageById(messageId: string): Promise<QuoMessage> {
    return this.fetchQuo<QuoMessage>(`/v1/messages/${messageId}`);
  }
}

export const quoClient = new QuoClient();
