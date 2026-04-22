import express from 'express';
import cors from 'cors';
import { config } from './config';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import webhookRoutes from './routes/webhooks';
import adminRoutes from './routes/admin';
import { templatesRouter, propertiesRouter } from './routes/templates';

const app = express();

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Request logging ────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ── Routes ─────────────────────────────────────────────
app.use('/admin', adminRoutes);         // /admin/sync/quo/conversations, /admin/sync/quo/messages
app.use('/conversations', conversationRoutes);
app.use('/', messageRoutes);            // /conversations/:id/messages, /messages/send, /messages/:id/retry
app.use('/webhooks', webhookRoutes);    // /webhooks/quo/messages, /webhooks/status
app.use('/templates', templatesRouter);
app.use('/properties', propertiesRouter);

// ── Health check ───────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quosender-api', timestamp: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n🚀 QuoSender API running on http://localhost:${config.port}`);
  console.log(`   Sender adapter: ${config.senderAdapterUrl}\n`);
});

export default app;
