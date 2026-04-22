-- QuoSender v2 — Seed Data (SQLite)

-- ── Contacts ───────────────────────────────────────────
INSERT OR IGNORE INTO contacts (id, phone_number, name) VALUES
  ('a1000000-0000-0000-0000-000000000001', '+15551234001', 'Alice Johnson'),
  ('a1000000-0000-0000-0000-000000000002', '+15551234002', 'Bob Martinez'),
  ('a1000000-0000-0000-0000-000000000003', '+15551234003', 'Carol Williams'),
  ('a1000000-0000-0000-0000-000000000004', '+15551234004', 'David Chen'),
  ('a1000000-0000-0000-0000-000000000005', '+15551234005', 'Eva Rossi');

-- ── Conversations ──────────────────────────────────────
INSERT OR IGNORE INTO conversations (id, contact_id, channel, unread_count, last_message_preview, last_message_at) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'sms', 2,
   'Hey, is the apartment on 5th Ave still available?', datetime('now', '-5 minutes')),
  ('c2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'sms', 0,
   'Thanks! I''ll be there at 3pm.', datetime('now', '-2 hours')),
  ('c2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'sms', 1,
   'Can I schedule a viewing for Saturday?', datetime('now', '-30 minutes')),
  ('c2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'sms', 0,
   'Got it, see you then!', datetime('now', '-1 day')),
  ('c2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'sms', 3,
   'Hi, I saw your listing on Zillow. Is it pet-friendly?', datetime('now', '-10 minutes'));

-- ── Messages ───────────────────────────────────────────

-- Conversation 1: Alice (2 unread inbound)
INSERT OR IGNORE INTO messages (id, conversation_id, direction, body, status, created_at) VALUES
  ('m3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'outbound',
   'Hi Alice! Thanks for reaching out about the Elm Street unit. It''s a 2BR/1BA at $1,800/mo. Would you like to schedule a tour?', 'sent', datetime('now', '-1 day')),
  ('m3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'inbound',
   'Yes! What times work this week?', 'delivered', datetime('now', '-23 hours')),
  ('m3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'outbound',
   'We have openings Wednesday at 2pm or Thursday at 10am. Which works better?', 'sent', datetime('now', '-22 hours')),
  ('m3000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'inbound',
   'Wednesday at 2pm is perfect.', 'delivered', datetime('now', '-20 hours')),
  ('m3000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'outbound',
   'Great, you''re confirmed for Wed 2pm at 142 Elm St. See you there!', 'sent', datetime('now', '-19 hours')),
  ('m3000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000001', 'inbound',
   'Actually, does the building have parking?', 'delivered', datetime('now', '-10 minutes')),
  ('m3000000-0000-0000-0000-000000000007', 'c2000000-0000-0000-0000-000000000001', 'inbound',
   'Hey, is the apartment on 5th Ave still available?', 'delivered', datetime('now', '-5 minutes'));

-- Conversation 2: Bob (all read)
INSERT OR IGNORE INTO messages (id, conversation_id, direction, body, status, created_at) VALUES
  ('m3000000-0000-0000-0000-000000000008', 'c2000000-0000-0000-0000-000000000002', 'inbound',
   'Hi, I''m interested in the studio on Oak Rd.', 'delivered', datetime('now', '-5 hours')),
  ('m3000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000002', 'outbound',
   'Hey Bob! That unit is $1,200/mo, available June 1. Want to see it?', 'sent', datetime('now', '-4 hours')),
  ('m3000000-0000-0000-0000-000000000010', 'c2000000-0000-0000-0000-000000000002', 'inbound',
   'Yes please! Tomorrow afternoon?', 'delivered', datetime('now', '-3 hours')),
  ('m3000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000002', 'outbound',
   'Sure — how about 3pm at 89 Oak Rd?', 'sent', datetime('now', '-150 minutes')),
  ('m3000000-0000-0000-0000-000000000012', 'c2000000-0000-0000-0000-000000000002', 'inbound',
   'Thanks! I''ll be there at 3pm.', 'delivered', datetime('now', '-2 hours'));

-- Conversation 3: Carol (1 unread)
INSERT OR IGNORE INTO messages (id, conversation_id, direction, body, status, created_at) VALUES
  ('m3000000-0000-0000-0000-000000000013', 'c2000000-0000-0000-0000-000000000003', 'inbound',
   'Hello, I found your listing for the 3BR house.', 'delivered', datetime('now', '-2 days')),
  ('m3000000-0000-0000-0000-000000000014', 'c2000000-0000-0000-0000-000000000003', 'outbound',
   'Hi Carol! Yes, the house at 25 Pine Ln is still available at $2,400/mo.', 'sent', datetime('now', '-47 hours')),
  ('m3000000-0000-0000-0000-000000000015', 'c2000000-0000-0000-0000-000000000003', 'inbound',
   'Can I schedule a viewing for Saturday?', 'delivered', datetime('now', '-30 minutes'));

-- Conversation 4: David (all read, includes a failed message for retry testing)
INSERT OR IGNORE INTO messages (id, conversation_id, direction, body, status, created_at) VALUES
  ('m3000000-0000-0000-0000-000000000016', 'c2000000-0000-0000-0000-000000000004', 'outbound',
   'Hi David, following up on your inquiry about 55 Maple Dr.', 'sent', datetime('now', '-3 days')),
  ('m3000000-0000-0000-0000-000000000017', 'c2000000-0000-0000-0000-000000000004', 'inbound',
   'Oh great, is it still available?', 'delivered', datetime('now', '-70 hours')),
  ('m3000000-0000-0000-0000-000000000018', 'c2000000-0000-0000-0000-000000000004', 'outbound',
   'It is! $1,650/mo. I can show it tomorrow.', 'failed', datetime('now', '-68 hours')),
  ('m3000000-0000-0000-0000-000000000019', 'c2000000-0000-0000-0000-000000000004', 'outbound',
   'It is! $1,650/mo. I can show it tomorrow.', 'sent', datetime('now', '-67 hours')),
  ('m3000000-0000-0000-0000-000000000020', 'c2000000-0000-0000-0000-000000000004', 'inbound',
   'Got it, see you then!', 'delivered', datetime('now', '-1 day'));

-- Conversation 5: Eva (3 unread)
INSERT OR IGNORE INTO messages (id, conversation_id, direction, body, status, created_at) VALUES
  ('m3000000-0000-0000-0000-000000000021', 'c2000000-0000-0000-0000-000000000005', 'inbound',
   'Hi, I saw your listing on Zillow. Is it pet-friendly?', 'delivered', datetime('now', '-10 minutes')),
  ('m3000000-0000-0000-0000-000000000022', 'c2000000-0000-0000-0000-000000000005', 'inbound',
   'I have a small dog, about 20 lbs.', 'delivered', datetime('now', '-9 minutes')),
  ('m3000000-0000-0000-0000-000000000023', 'c2000000-0000-0000-0000-000000000005', 'inbound',
   'Also, what''s the move-in cost?', 'delivered', datetime('now', '-8 minutes'));
