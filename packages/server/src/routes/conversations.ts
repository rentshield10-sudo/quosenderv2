import { Router, Request, Response } from 'express';
import { conversationService } from '../services/conversation.service';

const router = Router();

/**
 * GET /conversations
 * Paginated inbox list, sorted by most recent message.
 * Query params: cursor (ISO timestamp), limit (number)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const cursor = (req.query.cursor && req.query.cursor !== 'null' && req.query.cursor !== 'undefined') ? req.query.cursor as string : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = conversationService.list(cursor, limit);
    res.json(result);
  } catch (err) {
    console.error('GET /conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /conversations/:id
 * Single conversation details.
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const conversation = conversationService.getById(req.params.id as string);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (err) {
    console.error('GET /conversations/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * POST /conversations/:id/read
 * Mark conversation as read (reset unread count).
 */
router.post('/:id/read', (req: Request, res: Response) => {
  try {
    const conversation = conversationService.markAsRead(req.params.id as string);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (err) {
    console.error('POST /conversations/:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
