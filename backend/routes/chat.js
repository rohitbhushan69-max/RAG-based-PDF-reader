import { Router } from 'express';
import crypto from 'crypto';
import { getAgent } from '../services/agent.js';
import { hasDocuments } from '../services/vectorStore.js';
import { createLogger } from '../utils/logger.js';

const router = Router();
const log = createLogger('chat-route');

const AGENT_TIMEOUT_MS = 45_000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Agent timed out')), ms)),
  ]);
}

router.post('/', async (req, res) => {
  const traceId = crypto.randomUUID().slice(0, 8);

  try {
    const { sessionId, message, history = [] } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    if (!hasDocuments(sessionId)) {
      return res.status(400).json({ error: 'No documents uploaded for this session. Please upload a PDF first.' });
    }

    log.info('Chat request received', {
      traceId,
      sessionId: sessionId.slice(0, 8),
      queryLength: message.length,
    });

    const agent = getAgent();
    const result = await withTimeout(
      agent.invoke({
        sessionId,
        query: message,
        history,
        traceId,
      }),
      AGENT_TIMEOUT_MS,
    );

    log.info('Agent completed', {
      traceId,
      responseType: result.responseType,
      sourceCount: result.sources?.length || 0,
    });

    res.json({
      reply: result.response,
      sources: result.sources || [],
      type: result.responseType, // 'answer' | 'clarification'
    });
  } catch (err) {
    log.error('Chat error', { traceId, error: err.message });
    res.status(500).json({ error: err.message || 'Failed to generate response' });
  }
});

export default router;
