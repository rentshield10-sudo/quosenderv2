import { Router } from 'express';
import { db } from '../db/database';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';

export const scheduleBookingRouter = Router();

scheduleBookingRouter.post('/parse-and-load', async (req, res) => {
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
        // Try even more aggressive phone extraction (look for any 10-11 digits)
        const digitsOnly = line.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
            extractedPhone = '+1' + digitsOnly.slice(digitsOnly.length - 10);
        }
    }

    if (!extractedPhone) continue;

    // Try finding property in the same line
    let matchedProp = null;
    const normalize = (val: string) => {
      if (!val) return '';
      return val.toLowerCase()
        .replace(/#|apt|apartment|floor|fl|ste|suite|floor|st|ave|rd|blvd|lane|ln|drive|dr|court|ct|street|avenue|road|boulevard/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Remove phone number from line to avoid matching digits in address
    let lineForMatching = line;
    if (digitMatches) {
        lineForMatching = line.replace(digitMatches[1], ' ');
    }
    
    const normLine = normalize(lineForMatching);
    console.log(`[PARSE-DEBUG] Row: "${line}"`);
    console.log(`[PARSE-DEBUG] Normalized Line: "${normLine}"`);
    console.log(`[PARSE-DEBUG] Total Properties to match: ${properties.length}`);

    for (const p of properties) {
       let hasAddress = false;

       // 1. Try exact name match (normalized)
       const normName = normalize(p.name);
       if (normName && normName.length > 4) {
          if (normLine.includes(normName)) {
             console.log(`[PARSE-DEBUG] ✅ Match found via NAME: "${p.name}" (normalized: "${normName}")`);
             matchedProp = p;
             break;
          }
       }

       // 2. Try partial address match
       if (p.address && p.address.length > 5) {
          const normAddr = normalize(p.address);
          
          // Full normalized include:
          if (normLine.includes(normAddr)) {
             console.log(`[PARSE-DEBUG] ✅ Match found via FULL ADDRESS: "${p.address}" (normalized: "${normAddr}")`);
             hasAddress = true;
          } else {
             // Fallback: match first 2 tokens (usually number + street name)
             const addrTokens = normAddr.split(' ');
             if (addrTokens.length >= 2) {
               const coreTokens = addrTokens.slice(0, 2).join(' '); 
               if (coreTokens.length > 4 && normLine.includes(coreTokens)) {
                 console.log(`[PARSE-DEBUG] ✅ Match found via CORE TOKENS: "${coreTokens}"`);
                 hasAddress = true;
               }
             }

             // Fallback 2: Token overlap (match at least 2 significant tokens)
             if (!hasAddress && addrTokens.length >= 2) {
                const lineTokens = new Set(normLine.split(' '));
                let matches = 0;
                let matchedWords = [];
                for (const t of addrTokens.slice(0, 4)) {
                   if (t.length > 2 && lineTokens.has(t)) {
                      matches++;
                      matchedWords.push(t);
                   }
                }
                if (matches >= 2) {
                   console.log(`[PARSE-DEBUG] ✅ Match found via TOKEN OVERLAP (${matches} words: ${matchedWords.join(', ')}): "${p.address}"`);
                   hasAddress = true;
                }
             }
          }
       }
       
       if (hasAddress) {
           matchedProp = p;
           break;
       }
    }

    if (!matchedProp) {
        console.log(`[PARSE-DEBUG] ❌ SEARCHING HISTORY fallback for: ${extractedPhone}`);
        // Fallback: Check local message history for this phone number to find a property
        try {
           const history = db.prepare(`
             SELECT m.body FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             JOIN contacts ct ON ct.id = c.contact_id
             WHERE ct.phone_number = ?
             ORDER BY m.created_at DESC LIMIT 15
           `).all(extractedPhone) as { body: string }[];
           
           for (const msg of history) {
              if (matchedProp) break;
              const normMsg = normalize(msg.body);
              for (const p of properties) {
                 const nAddr = normalize(p.address);
                 const nName = normalize(p.name);
                 if ((nAddr.length > 5 && normMsg.includes(nAddr)) || (nName.length > 5 && normMsg.includes(nName))) {
                    console.log(`[PARSE-DEBUG] 🎯 SUCCESS: Matched via message history: ${p.name}`);
                    matchedProp = p;
                    break;
                 }
              }
           }
        } catch(e) {}
    }

    if (!matchedProp) {
        console.log(`[PARSE-DEBUG] ❌ PERMANENT FAILURE: No property matched for row: "${line}"`);
    }

    // Deduplication has been completely removed to strictly follow the raw input list

    // Load or create conversation to get the thread ID
    const conv = conversationService.findOrCreate(extractedPhone, 'sms');

    results.push({
       rawLine: line,
       phone: extractedPhone,
       property: matchedProp,
       conversation: conv
    });
  }

  // Strictly sync from Quo live before returning to avoid cache
    const uniquePhones = Array.from(new Set<string>(results.map(r => r.phone)));
    if (uniquePhones.length > 0) {
        try {
            const { quoClient } = await import('../services/quo.client');
            const allowedInboxNumber = 'PNAO2aXSml';

            const chunkSize = 10;
            for (let i = 0; i < uniquePhones.length; i += chunkSize) {
                const chunk = uniquePhones.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (phone) => {
                    try {
                        const page = await quoClient.listMessages(allowedInboxNumber, [phone], { limit: 1 });
                        if (page.data && page.data.length > 0) {
                            const first = page.data[0];
                            const previewText = (first.body || first.text || '').toString().slice(0, 200);
                            const localConv = conversationService.findOrCreate(phone, 'sms');
                            conversationService.updateLastMessage(localConv.id, previewText, false, first.createdAt || new Date().toISOString());
                            
                            // Reflect LIVE update instantly into the result array
                            for (const r of results) {
                                if (r.phone === phone) {
                                    r.conversation.last_message_preview = previewText;
                                }
                            }
                        }
                    } catch (e) {}
                }));
            }
        } catch (e) {
            console.error('Bulk Quo load error', e);
        }
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
        const previewText = (first.body || first.text || '').toString().slice(0, 200);
        conversationService.updateLastMessage(localConv.id, previewText, false, first.createdAt || new Date().toISOString());
        res.json({ success: true, count: inserted, preview: previewText });
     } else {
        res.json({ success: true, count: inserted });
     }
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
    const outboundPayload = payload.inputs ? payload : { inputs: payload };
    
    const response = await fetch('http://127.0.0.1:3001/flows/flow_1776996361867_nxr811/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(outboundPayload) 
    });
    
    if (!response.ok) {
      throw new Error(`Automation server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    res.json({
      success: true,
      receivedPayload: payload,
      automationResult: data
    });
  } catch (err: any) {
    console.error('Error running flow:', err);
    res.status(500).json({ error: 'Failed to trigger flow', message: err.message });
  }
});

