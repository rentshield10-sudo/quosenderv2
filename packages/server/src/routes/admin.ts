import { Router, Request, Response } from 'express';
import { quoClient } from '../services/quo.client';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';

const router = Router();

/**
 * POST /admin/sync/quo/conversations
 * Fetches latest conversations from Quo and maps them into local SQLite DB.
 * Purely for initial setup and recovery back-fills.
 */
router.post('/sync/quo/conversations', async (req: Request, res: Response) => {
  try {
    const cursor = (req.body.cursor || req.query.cursor) as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    
    console.log(`[SYNC CONVERSATIONS] Requesting limit=${limit}, cursor=${cursor}`);
    const page = await quoClient.listConversations({ limit, cursor });

    // Filter to only include the Primary inbox number
    const allowedInboxNumber = 'PNAO2aXSml'; // OpenPhone ID for (201) 350-1990
    if (page.data) {
      const originalCount = page.data.length;
      page.data = page.data.filter(c => c.phoneNumberId === allowedInboxNumber);
      console.log(`[SYNC CONVERSATIONS] Filtered primary inbox: ${page.data.length} kept out of ${originalCount}`);
    }

    let fetched = page.data ? page.data.length : 0;
    let inserted = 0;
    let skipped = 0;
    let skipReasons: any[] = [];
    let sample = page.data && page.data.length > 0 ? page.data[0] : null;
    const nextCursor = page.nextPageToken || page.nextCursor || undefined;

    for (const remote of page.data || []) {
      const contactPhone = remote.participants && remote.participants.length > 0 ? remote.participants[0] : null;

      if (!contactPhone) {
        skipped++;
        skipReasons.push({ externalConversationId: remote.id, reason: 'missing_contact_phone' });
        continue;
      }

      const conv = conversationService.getOrCreateByExternalId(
        remote.id, 
        contactPhone, 
        'sms',
        remote.name || undefined
      );

      if (remote.lastMessageSnippet) {
        const timestamp = remote.lastActivityAt || remote.updatedAt || remote.createdAt;
        conversationService.updateLastMessage(conv.id, remote.lastMessageSnippet, false, timestamp);
      }
      inserted++;
    }

    console.log(`[SYNC CONVERSATIONS] Complete. Inserted ${inserted}, Next Cursor: ${nextCursor}`);
    res.json({ success: true, counts: { fetched, inserted, skipped }, sample, skipReasons, hasNextPage: !!nextCursor, nextCursor });
  } catch (err: any) {
    console.error('Quo Conv Sync Error:', err);
    res.status(500).json({ error: 'Failed to sync conversations', debug: err });
  }
});

/**
 * POST /admin/sync/quo/messages
 * Fetches latest messages for a specific conversation or fully globally.
 * Body: { externalConversationId?: string }
 */
router.post('/sync/quo/messages', async (req: Request, res: Response) => {
  try {
    const { externalConversationId } = req.body || {};
    const cursor = (req.body.cursor || req.query.cursor) as string | undefined;
    
    console.log(`[SYNC MESSAGES] Requesting conv=${externalConversationId}, cursor=${cursor}`);
    
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;
    let skipReasons: any[] = [];
    let samples: any[] = [];
    let attempts: any[] = []; // Explicit attempt tracking per user requests
    let nextCursor: string | undefined = undefined;

    let targets: any[] = [];
    const allowedInboxNumber = 'PNAO2aXSml'; // OpenPhone ID for (201) 350-1990

    if (externalConversationId) {
        const localStmt = await import('../db/database').then(m => m.db.prepare(`
          SELECT c.id, c.external_conversation_id, ct.phone_number AS contact_phone 
          FROM conversations c 
          JOIN contacts ct ON c.contact_id = ct.id 
          WHERE c.external_conversation_id = ?
        `));
        const localConvRow = localStmt.get(externalConversationId) as any;
        if (!localConvRow || !localConvRow.contact_phone) {
            return res.status(404).json({ error: 'Local conversation/contact not found for external ID' });
        }
        targets = [{
            id: externalConversationId,
            phoneNumberId: allowedInboxNumber,
            participants: [localConvRow.contact_phone]
        }];
    } else {
        // Quo API requires \`phoneNumberId\` and \`participants\` to query messages.
        // So we must fetch the OpenPhone conversations list natively first, then match them.
        const convsPage = await quoClient.listConversations({ limit: 100 });
        targets = convsPage.data || [];
        targets = targets.filter(c => c.phoneNumberId === allowedInboxNumber);
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    console.log(`[SYNC MESSAGES] Found ${targets.length} target conversation(s) to pull from Quo`);

    for (const remoteConv of targets) {
      if (!remoteConv.id || !remoteConv.phoneNumberId || !remoteConv.participants || remoteConv.participants.length === 0) {
          skipped++;
          skipReasons.push({ convId: remoteConv.id, reason: 'missing_phone_details_in_quo_conversation' });
          continue;
      }

      // Map to SQLite
      const localStmt = await import('../db/database').then(m => m.db.prepare('SELECT id, external_conversation_id FROM conversations WHERE external_conversation_id = ?'));
      const localConv = localStmt.get(remoteConv.id) as {id: string, external_conversation_id: string} | undefined;
      
      if (!localConv) {
          skipped++;
          skipReasons.push({ convId: remoteConv.id, reason: 'missing_local_mapping' });
          continue;
      }

      try {
        console.log(`[SYNC MESSAGES] Calling Quo listMessages for phone=${remoteConv.phoneNumberId} parts=${remoteConv.participants}, cursor=${cursor}`);
        const page = await quoClient.listMessages(remoteConv.phoneNumberId, remoteConv.participants || [], { limit, cursor });
        fetched += page.data ? page.data.length : 0;
        // Check for both nextPageToken and nextCursor based on QuoPaginated type
        nextCursor = page.nextPageToken || page.nextCursor || undefined;
        console.log(`[SYNC MESSAGES] Received ${page.data?.length || 0} messages. Next cursor: ${nextCursor}`);
        
        if (samples.length === 0 && page.data && page.data.length > 0) {
            samples.push(page.data[0]);
        }

        let newestMessageTime = 0;
        let newestMessageBody = '';

        for (const remoteMsg of page.data || []) {
          const isIncoming = remoteMsg.direction === 'incoming' || remoteMsg.direction === 'inbound';
          
          const senderRaw = remoteMsg.fromNumber || remoteMsg.from || remoteConv.participants[0];
          const sender = Array.isArray(senderRaw) ? senderRaw[0] : senderRaw;
          
          const recipientRaw = remoteMsg.toNumber || remoteMsg.to || remoteConv.phoneNumberId;
          const recipient = Array.isArray(recipientRaw) ? recipientRaw[0] : recipientRaw;
          
          const body = remoteMsg.body || remoteMsg.text || '';

          if (!remoteMsg.id) {
            skipped++;
            skipReasons.push({ messageId: null, reason: 'missing_message_id', payload: null });
            continue;
          }

          try {
            messageService.createFull({
              conversation_id: localConv.id,
              direction: isIncoming ? 'inbound' : 'outbound',
              body: body.toString().slice(0, 2000), 
              status: remoteMsg.status === 'delivered' ? 'delivered' : 'sent',
              transport: 'quo_sync',
              external_message_id: remoteMsg.id,
              sender_number: sender,
              recipient_number: recipient,
              created_at: remoteMsg.createdAt || new Date().toISOString(),
              error_message: remoteMsg.errorMessage
            });
            inserted++;

            const msgTime = new Date(remoteMsg.createdAt || 0).getTime();
            if (msgTime > newestMessageTime) {
              newestMessageTime = msgTime;
              newestMessageBody = body;
            }
          } catch (e: any) {
            skipped++;
            skipReasons.push({ messageId: remoteMsg.id, reason: 'insert_fail: ' + e.message });
          }
        } // End inner loop for messages

        // Dynamic preview update
        if (newestMessageBody) {
            conversationService.updateLastMessage(localConv.id, newestMessageBody, false, new Date(newestMessageTime).toISOString());
        }

      } catch (err: any) {
         skipped++;
         // Capture precisely the new error format returned by QuoClient
         const errorDetail = typeof err === 'object' && err.status ? err : { message: err.message, status: 500, body: JSON.stringify(err) };
         
         skipReasons.push({ conversationId: remoteConv.id, reason: 'api_fetch_failed: ' + errorDetail.message });
         attempts.push({
           externalConversationId: remoteConv.id,
           phoneNumberId: remoteConv.phoneNumberId,
           participants: remoteConv.participants,
           upstreamUrl: errorDetail.url || 'unknown_url',
           upstreamStatus: errorDetail.status || 500,
           upstreamBody: errorDetail.body || 'unknown_body',
           requestParams: errorDetail.requestParams || null
         });
      }
    }

    res.json({ success: true, counts: { fetched, inserted, skipped }, attempts, sample: samples[0] || null, skipReasons, nextCursor });
  } catch (err: any) {
    console.error('Quo Message Global Sync Error:', err);
    res.status(500).json({ error: 'Failed to sync messages', debug: err });
  }
});

export default router;
