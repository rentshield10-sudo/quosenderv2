import express from 'express';
import cors from 'cors';
import next from 'next';
import path from 'path';
import { config } from './config';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import webhookRoutes from './routes/webhooks';
import adminRoutes from './routes/admin';
import { templatesRouter, propertiesRouter } from './routes/templates';

const dev = process.env.NODE_ENV !== 'production';
const webDir = path.resolve(__dirname, '../../web');
const nextApp = next({ dev, dir: webDir });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const app = express();

  // ── Middleware ──────────────────────────────────────────
  app.use(cors());
  app.use(express.json());

  // ── Request logging ────────────────────────────────────
  app.use((req, _res, nxt) => {
    if (req.url.startsWith('/api')) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    }
    nxt();
  });

  // ── Routes (Prefixed with /api) ────────────────────────
  const apiRouter = express.Router();
  apiRouter.use('/admin', adminRoutes);         // /api/admin/sync/quo/conversations, /api/admin/sync/quo/messages
  apiRouter.use('/conversations', conversationRoutes);
  apiRouter.use('/', messageRoutes);            // /api/conversations/:id/messages, /api/messages/send, /api/messages/:id/retry
  apiRouter.use('/webhooks', webhookRoutes);    // /api/webhooks/quo/messages, /api/webhooks/status
  apiRouter.use('/templates', templatesRouter);
  apiRouter.use('/properties', propertiesRouter);

  // ── Health check ───────────────────────────────────────
  apiRouter.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'quosender-unified', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  // ── Next.js Fallback ───────────────────────────────────
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  // ── Start ──────────────────────────────────────────────
  app.listen(config.port, () => {
    console.log(`\n🚀 QuoSender Unified Server running on http://localhost:${config.port}`);
  });
});
