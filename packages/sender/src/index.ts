import express from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = parseInt(process.env.SENDER_PORT || '4001', 10);

app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

/**
 * POST /internal/send
 * 
 * The local sender adapter endpoint.
 * This is a TRANSPORT adapter only — it receives a payload and
 * simulates (or actually performs) the send operation.
 * 
 * In production, this would call the actual SMS/messaging API (e.g., Quo, Twilio).
 * For now, it simulates a successful send with a small delay.
 * 
 * Body: { messageId, flowId, to, body }
 * Response: { success: true, externalId: string } or { success: false, error: string }
 */
app.post('/internal/send', async (req, res) => {
  const { messageId, flowId, to, body } = req.body;

  if (!messageId || !to || !body) {
    return res.status(400).json({
      success: false,
      error: 'messageId, to, and body are required',
    });
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
    return res.json({
      success: false,
      error: 'Simulated delivery failure',
    });
  }

  const externalId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`   ✅ SENT → ${externalId}\n`);

  res.json({
    success: true,
    externalId,
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quosender-sender', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n📡 QuoSender Sender Adapter running on http://localhost:${PORT}`);
  console.log(`   Endpoint: POST /internal/send\n`);
});
