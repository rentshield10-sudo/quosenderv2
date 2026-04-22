import { config } from '../config';
import { SenderPayload, SenderResponse } from '../types';

/**
 * Client for the local sender adapter service.
 * The sender is only a transport adapter — it receives a payload
 * and forwards the message through the actual channel (SMS, etc).
 */
export class SenderClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.senderAdapterUrl;
  }

  /**
   * Send a message through the local sender adapter.
   * POST /internal/send
   */
  async send(payload: SenderPayload): Promise<SenderResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/internal/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `Sender responded ${res.status}: ${text}` };
      }

      const data = await res.json() as SenderResponse;
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown sender error';
      return { success: false, error: message };
    }
  }
}

export const senderClient = new SenderClient();
