# Alex — Agentic RAG PDF Chat Assistant

Upload PDF documents and chat with **Alex**, an AI assistant powered by a **LangGraph agentic pipeline** that answers questions using hybrid retrieval (vector search + BM25 keyword search) with clarifying question capability. Built with React, Express, LangGraph, and Google Gemini.

## Agentic Architecture (LangGraph)

```
START → analyzeQuery
  ├── (ambiguous) → askClarification → END
  └── (clear)     → retrieve (vector + keyword parallel)
                       → fuseResults (Reciprocal Rank Fusion)
                          → generateResponse → END
```

### Agent Nodes

| Node | Purpose |
|---|---|
| `analyzeQuery` | LLM-powered intent classification — detects ambiguous queries |
| `askClarification` | Generates targeted clarifying questions when query is vague |
| `retrieve` | Parallel hybrid retrieval — semantic vector + BM25 keyword search |
| `fuseResults` | Reciprocal Rank Fusion (RRF) merges and re-ranks results |
| `generateResponse` | Grounded response generation with source citations |

## Project Structure

```
backend/
  services/       agent.js (LangGraph state graph), gemini.js (SDK wrapper),
                  vectorStore.js (in-memory vectors), keywordStore.js (BM25 index)
  routes/         ingest.js (upload + embed + index), chat.js (agentic chat)
  utils/          chunker.js (text splitting), logger.js (structured JSON logging)
frontend/
  src/components/ PdfUpload.jsx, ChatPanel.jsx (match-type badges, clarification UI)
  src/hooks/      useSession.js (session + state management)
```

## Features

- **Agentic RAG pipeline** with LangGraph state graph orchestration
- **Hybrid retrieval**: semantic vector search + BM25 keyword search
- **Reciprocal Rank Fusion** for optimal result merging
- **Clarifying questions**: agent asks for specifics when queries are ambiguous
- **Match type badges**: UI shows whether results came from semantic, keyword, or both
- Upload PDF documents (drag-and-drop or file picker)
- Text extraction, chunking (500 chars / 100 overlap), and embedding via Gemini
- In-memory session-scoped vector store + keyword index
- Chat powered by Gemini with multi-model fallback for rate limits
- Conversation history for multi-turn interactions
- Structured JSON logging with trace IDs for production observability
- Request timeouts and graceful degradation

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
| Orchestration | LangGraph (agentic state graph) |
| Frontend | React 18, Vite, Tailwind CSS v4, lucide-react, react-markdown |
| Backend | Node.js, Express, multer, pdf-parse |
| LLM | Google Gemini 2.5 Flash Lite (chat) + gemini-embedding-001 (embeddings) |
| Search | In-memory vector store (cosine) + BM25 keyword index + RRF fusion |
