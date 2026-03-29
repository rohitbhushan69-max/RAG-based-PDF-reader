import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { chunkText } from '../utils/chunker.js';
import { generateEmbeddings } from '../services/gemini.js';
import { addDocuments } from '../services/vectorStore.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

router.post('/', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const sessionId = req.body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Extract text from PDF
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'PDF appears to be empty or unreadable' });
    }

    // Chunk the text
    const rawChunks = chunkText(text);
    const chunks = rawChunks.map((c) => ({
      ...c,
      metadata: {
        filename: req.file.originalname,
        chunkIndex: c.id,
        sessionId,
      },
    }));

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks.map((c) => c.text));

    // Store in vector store
    addDocuments(sessionId, chunks, embeddings);

    res.json({
      sessionId,
      filename: req.file.originalname,
      pages: pdfData.numpages,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: err.message || 'Failed to process PDF' });
  }
});

export default router;
