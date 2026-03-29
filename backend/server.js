import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ingestRouter from './routes/ingest.js';
import chatRouter from './routes/chat.js';
import { clearSession } from './services/vectorStore.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/ingest', ingestRouter);
app.use('/api/chat', chatRouter);

// Clear session endpoint
app.post('/api/session/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) clearSession(sessionId);
  res.json({ ok: true });
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
