import { SenderPayload, SenderResponse } from '../types';

/**
 * Sender client executing sending logic inline within the same process.
 * No HTTP adapter needed.
 */
export class SenderClient {
  async send(payload: SenderPayload): Promise<SenderResponse> {
    const { messageId, flowId, to, body } = payload;
    
    if (!messageId || !to || !body) {
      return { success: false, error: 'messageId, to, and body are required' };
    }
    
    console.log(`\n📤 Sending message:`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Flow ID:    ${flowId || 'default'}`);
    console.log(`   To:         ${to}`);
    console.log(`   Body:       ${body.slice(0, 100)}${body.length > 100 ? '...' : ''}`);

    // Simulate network delay (500ms–1500ms)
    const delay = 500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate ~90% success rate for testing
    const shouldFail = Math.random() < 0.1;

    if (shouldFail) {
      console.log(`   ❌ FAILED (simulated)\n`);
      return { success: false, error: 'Simulated delivery failure' };
    }

    const externalId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`   ✅ SENT → ${externalId}\n`);

    return { success: true, externalId };
  }
}

export const senderClient = new SenderClient();
