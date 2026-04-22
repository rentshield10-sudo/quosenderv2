import { Router, Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { conversationService } from '../services/conversation.service';
import { senderClient } from '../services/sender.client';
import { SendMessageRequest } from '../types';

const router = Router();

/**
 * GET /conversations/:id/messages
 * Paginated messages for a conversation thread, newest first.
 * Query params: cursor (ISO timestamp), limit (number)
 */
router.get('/conversations/:id/messages', (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = messageService.listByConversation(req.params.id, cursor, limit);
    res.json(result);
  } catch (err) {
    console.error('GET /conversations/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /messages/send
 * Send an outbound message:
 *   1. Write message to DB with status 'queued'
 *   2. Update status to 'sending'
 *   3. Call local sender adapter
 *   4. Update status to 'sent' or 'failed'
 *
 * Body: { conversationId, body, flowId? }
 */
router.post('/messages/send', async (req: Request, res: Response) => {
  try {
    const { conversationId, body, flowId } = req.body as SendMessageRequest;

    if (!conversationId || !body) {
      return res.status(400).json({ error: 'conversationId and body are required' });
    }

    // 1. Get conversation to find the contact phone
    const conversation = conversationService.getById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // 2. Create message with status 'queued'
    const message = messageService.create(conversationId, 'outbound', body, 'queued');

    // 3. Update to 'sending'
    messageService.updateStatus(message.id, 'sending');

    // 4. Update conversation preview immediately
    conversationService.updateLastMessage(conversationId, body, false);

    // Return optimistic response before sender completes
    res.status(201).json({ ...message, status: 'sending' });

    // 5. Call sender adapter asynchronously (after response is sent)
    const senderResult = await senderClient.send({
      messageId: message.id,
      flowId: flowId || 'default',
      to: conversation.contact_phone,
      body,
    });

    // 6. Update final status
    if (senderResult.success) {
      messageService.updateStatus(message.id, 'sent', senderResult.externalId);
    } else {
      messageService.updateStatus(message.id, 'failed');
      console.error(`Message ${message.id} failed:`, senderResult.error);
    }
  } catch (err) {
    console.error('POST /messages/send error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

/**
 * POST /messages/:id/retry
 * Retry a failed message by re-sending it through the sender adapter.
 */
router.post('/messages/:id/retry', async (req: Request, res: Response) => {
  try {
    const message = messageService.getById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed messages can be retried' });
    }

    const conversation = conversationService.getById(message.conversation_id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update to 'sending'
    messageService.updateStatus(message.id, 'sending');
    res.json({ ...message, status: 'sending' });

    // Call sender
    const senderResult = await senderClient.send({
      messageId: message.id,
      flowId: (req.body?.flowId as string) || 'default',
      to: conversation.contact_phone,
      body: message.body,
    });

    if (senderResult.success) {
      messageService.updateStatus(message.id, 'sent', senderResult.externalId);
    } else {
      messageService.updateStatus(message.id, 'failed');
      console.error(`Retry for message ${message.id} failed:`, senderResult.error);
    }
  } catch (err) {
    console.error('POST /messages/:id/retry error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to retry message' });
    }
  }
});

export default router;
