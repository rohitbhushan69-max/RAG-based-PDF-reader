import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ingestRouter from './routes/ingest.js';
import chatRouter from './routes/chat.js';
import { clearSession } from './services/vectorStore.js';
import { clearIndex } from './services/keywordStore.js';
import { createLogger } from './utils/logger.js';

dotenv.config();

const log = createLogger('server');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/ingest', ingestRouter);
app.use('/api/chat', chatRouter);

// Clear session endpoint
app.post('/api/session/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) {
    clearSession(sessionId);
    clearIndex(sessionId);
    log.info('Session cleared', { sessionId: sessionId.slice(0, 8) });
  }
  res.json({ ok: true });
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  log.info(`Backend running on http://localhost:${PORT}`);
});
