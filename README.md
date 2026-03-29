# Alex — RAG-based PDF Chat Assistant

Upload PDF documents and chat with **Alex**, an AI assistant that answers questions using the content of your PDFs. Built with React, Express, and Google Gemini.

## Architecture

```
backend/          Express API — PDF ingestion, Gemini embeddings, vector search, chat
  routes/         ingest.js (upload + embed), chat.js (RAG chat)
  services/       gemini.js (Gemini SDK wrapper), vectorStore.js (in-memory vectors)
  utils/          chunker.js (text splitting)
frontend/         React + Vite + Tailwind CSS — minimalist "Alex" chat UI
  src/components/ PdfUpload.jsx, ChatPanel.jsx
  src/hooks/      useSession.js (session + state management)
```

## Features

- Upload PDF documents (drag-and-drop or file picker)
- Text extraction, chunking (500 chars / 100 overlap), and embedding via Gemini `text-embedding-004`
- In-memory session-scoped vector store with cosine similarity search
- Chat powered by Gemini `2.0 Flash` with retrieved context and source citations
- Conversation history for multi-turn interactions
- Minimalist, responsive UI with the "Alex" chatbot persona

## Setup

1. Get a free [Google AI Studio API key](https://aistudio.google.com/apikey).

2. Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=4000
```

3. Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

4. Start both servers (in separate terminals):

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

5. Open the Vite URL (default: http://localhost:5173) and start chatting with Alex.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS v4, lucide-react, react-markdown |
| Backend | Node.js, Express, multer, pdf-parse |
| LLM | Google Gemini 2.0 Flash (chat) + text-embedding-004 (embeddings) |
| Vector DB | In-memory cosine similarity (session-scoped) |
