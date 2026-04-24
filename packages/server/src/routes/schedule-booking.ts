import { Router } from 'express';
import { db } from '../db/database';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';

export const scheduleBookingRouter = Router();

scheduleBookingRouter.post('/parse-and-load', (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ data: [] });

  const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
  
  // fetch all properties to match against
  const properties = db.prepare('SELECT * FROM properties').all() as any[];

  const results = [];
  const seenMatches = new Set<string>();

  for (const line of lines) {
    // Basic phone detection: find 10 sequential digits ignoring non-digits
    // We try to pull out any US phone number formatting.
    const digitMatches = line.match(/(\+?1?\s*\(?[2-9]\d{2}\)?\s*[-.]?\s*\d{3}\s*[-.]?\s*\d{4})/);
    let extractedPhone = null;

    if (digitMatches) {
        const digits = digitMatches[1].replace(/\D/g, '');
        if (digits.length >= 10) {
            extractedPhone = '+1' + digits.slice(digits.length - 10);
        }
    } else {
        const digitsOnly = line.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
            extractedPhone = '+1' + digitsOnly.slice(digitsOnly.length - 10);
        }
    }

    if (!extractedPhone) continue;

    // Try finding property in the same line
    let matchedProp = null;
    const normalizeAddress = (addr: string) => {
      // lower case, replace common words, remove punctuation
      return addr.toLowerCase()
        .replace(/#|apt|apartment|floor|fl|ste|suite/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    // Create a normalized version of the line
    const normalizedLine = normalizeAddress(line);

    for (const p of properties) {
       // Match by address or name if they are sufficiently long
       const hasName = p.name && p.name.length > 3 && line.toLowerCase().includes(p.name.toLowerCase());
       let hasAddress = false;

       if (p.address && p.address.length > 5) {
          const normAddr = normalizeAddress(p.address);
          
          // Full normalized include:
          if (normalizedLine.includes(normAddr)) {
             hasAddress = true;
          } else {
             // Fallback: match first 3 tokens (e.g. "31", "linden", "ave")
             const addrTokens = normAddr.split(' ');
             if (addrTokens.length >= 2) {
               const coreTokens = addrTokens.slice(0, 3).join(' '); // "31 linden ave"
               if (coreTokens.length > 5 && normalizedLine.includes(coreTokens)) {
                 hasAddress = true;
               }
             }
          }
       }
       
       if (hasAddress || hasName) {
           matchedProp = p;
           break;
       }
    }

    const uniqueKey = `${extractedPhone}-${matchedProp ? matchedProp.id : 'unmatched'}`;
    if (seenMatches.has(uniqueKey)) continue;
    seenMatches.add(uniqueKey);

    // Load or create conversation to get the thread ID
    const conv = conversationService.findOrCreate(extractedPhone, 'sms');

    results.push({
       rawLine: line,
       phone: extractedPhone,
       property: matchedProp,
       conversation: conv
    });
  }

  res.json({ data: results });
});

scheduleBookingRouter.get('/messages/:conversationId', (req, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = messageService.listByConversation(req.params.conversationId, cursor, limit);
    res.json(result);
  } catch (err) {
    console.error('GET /schedule-booking/messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

scheduleBookingRouter.get('/templates/:propertyId', (req, res) => {
  try {
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.propertyId);
    const templates = db.prepare('SELECT * FROM templates ORDER BY created_at ASC').all();
    res.json({ property, templates });
  } catch (err) {
    console.error('GET /schedule-booking/templates error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

scheduleBookingRouter.post('/sync-messages', async (req, res) => {
  try {
     const { phone } = req.body;
     const allowedInboxNumber = 'PNAO2aXSml'; // From admin.ts mapping
     const { quoClient } = await import('../services/quo.client');
     
     console.log(`[SCHEDULE-BOOKING SYNC] Calling Quo listMessages for phone=${phone}`);
     const page = await quoClient.listMessages(allowedInboxNumber, [phone], { limit: 15 });
     
     let inserted = 0;
     const localConv = conversationService.findOrCreate(phone, 'sms');

     for (const remoteMsg of page.data || []) {
        if (!remoteMsg.id) continue;
        const isIncoming = remoteMsg.direction === 'incoming' || remoteMsg.direction === 'inbound';
        
        try {
            messageService.createFull({
              conversation_id: localConv.id,
              direction: isIncoming ? 'inbound' : 'outbound',
              body: (remoteMsg.body || remoteMsg.text || '').toString().slice(0, 2000), 
              status: remoteMsg.status === 'delivered' ? 'delivered' : 'sent',
              transport: 'quo_sync',
              external_message_id: remoteMsg.id,
              sender_number: isIncoming ? phone : allowedInboxNumber,
              recipient_number: isIncoming ? allowedInboxNumber : phone,
              created_at: remoteMsg.createdAt || new Date().toISOString(),
              error_message: remoteMsg.errorMessage
            });
            inserted++;
        } catch(e) {
            // Likely unique constraint error if it already exists, which is fine
        }
     }
     
     if (page.data && page.data.length > 0) {
        const first = page.data[0];
        conversationService.updateLastMessage(localConv.id, (first.body || first.text || '').toString().slice(0, 200), false, first.createdAt || new Date().toISOString());
     }
     
     res.json({ success: true, count: inserted });
  } catch (err) {
     console.error('POST /schedule-booking/sync-messages error:', err);
     res.status(500).json({ error: 'Failed to sync' });
  }
});

scheduleBookingRouter.post('/run-flow', async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('--- [SCHEDULE-BOOKING RUN-FLOW] ---');
    console.log('Triggering AnyClick with payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('-----------------------------------');

    // Call the external AnyClick Playwright automation standard endpoint
    // Using 127.0.0.1 instead of localhost to bypass Node's IPv6 resolution preference which causes ECONNREFUSED
    const response = await fetch('http://127.0.0.1:3001/flows/flow_1776996361867_nxr811/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Automation server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error('Error running flow:', err);
    res.status(500).json({ error: 'Failed to trigger flow', message: err.message });
  }
});

