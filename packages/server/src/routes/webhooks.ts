import { Router, Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { conversationService } from '../services/conversation.service';

const router = Router();

/**
 * POST /webhooks/quo/messages
 * Receive an inbound message webhook from Quo API.
 * 
 * Target Quo format mapping:
 * This treats Quo Webhook as main live updating mechanism.
 */
router.post('/quo/messages', (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    // Validate we have a message object from Quo payload hook
    // Usually quo sends { type: 'message.created', data: { id, direction, body, fromNumber, toNumber, conversationId, createdAt, ... } }
    // Assuming 'event' itself is the message or event.data if it's wrapped.
    const messageData = event.data || event;

    if (!messageData || !messageData.fromNumber || !messageData.body) {
      return res.status(400).json({ error: 'Invalid Quo message payload' });
    }

    // Is it inbound or outbound?
    // According to Quo, incoming vs outgoing.
    const isIncoming = messageData.direction === 'incoming' || messageData.direction === 'inbound';
    
    // Usually the remote sender is fromNumber for incoming. If it's outgoing via Quo elsewhere, sender is toNumber.
    const contactPhoneNumber = isIncoming ? messageData.fromNumber : messageData.toNumber;
    
    const dbConv = conversationService.getOrCreateByExternalId(
      messageData.conversationId, 
      contactPhoneNumber, 
      'sms', 
      messageData.contactName || undefined
    );

    // Save message unconditionally. messageService handles deduplication implicitly via external_message_id.
    const msg = messageService.createFull({
      conversation_id: dbConv.id,
      direction: isIncoming ? 'inbound' : 'outbound',
      body: messageData.body,
      status: isIncoming ? 'received' : 'sent',
      transport: 'webhook',
      external_message_id: messageData.id,
      sender_number: messageData.fromNumber,
      recipient_number: messageData.toNumber,
      created_at: messageData.createdAt || new Date().toISOString(),
    });

    // Update conversation state (only increment unread if incoming)
    conversationService.updateLastMessage(
      dbConv.id, 
      msg.body, 
      isIncoming, 
      msg.created_at
    );

    res.status(200).json({ success: true, messageId: msg.id });
  } catch (err) {
    console.error('POST /webhooks/quo/messages error:', err);
    res.status(500).json({ error: 'Failed to process Quo webhook' });
  }
});

// Backward compatibility or secondary webhook routes can go below here
// ...

export default router;
