import { Router } from 'express';
import { embedQuery, chatCompletion } from '../services/gemini.js';
import { search, hasDocuments } from '../services/vectorStore.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { sessionId, message, history = [] } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    if (!hasDocuments(sessionId)) {
      return res.status(400).json({ error: 'No documents uploaded for this session. Please upload a PDF first.' });
    }

    // Embed the user's query
    const queryEmbedding = await embedQuery(message);

    // Search for relevant chunks
    const results = search(sessionId, queryEmbedding, 5);

    // Build context from retrieved chunks
    const context = results
      .map((r, i) => `[Source ${i + 1} — ${r.metadata.filename}, Chunk ${r.metadata.chunkIndex}]\n${r.text}`)
      .join('\n\n');

    const systemPrompt = `You are Alex, a helpful and precise AI assistant. You answer questions based ONLY on the provided document context. If the context does not contain enough information to answer, say so honestly. Always be concise and professional.

When citing information, reference the source number (e.g., [Source 1]).

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`;

    // Get chat completion — filter history so it starts with a user message
    const cleanHistory = history.filter((m) => m.role === 'user' || m.role === 'assistant');
    // Find the first user message and slice from there
    const firstUserIdx = cleanHistory.findIndex((m) => m.role === 'user');
    const validHistory = firstUserIdx >= 0 ? cleanHistory.slice(firstUserIdx) : [];

    const reply = await chatCompletion(systemPrompt, validHistory, message);

    const sources = results.map((r) => ({
      text: r.text.slice(0, 200) + (r.text.length > 200 ? '…' : ''),
      filename: r.metadata.filename,
      chunkIndex: r.metadata.chunkIndex,
      score: Math.round(r.score * 100) / 100,
    }));

    res.json({ reply, sources });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate response' });
  }
});

export default router;
