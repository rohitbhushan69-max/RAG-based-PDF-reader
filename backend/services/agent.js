/**
 * LangGraph Agentic RAG Pipeline
 *
 * State graph:
 *   START → analyzeQuery
 *     ├── (needs clarification) → askClarification → END
 *     └── (ready) → retrieve (vector + keyword parallel) → fuseResults → generateResponse → END
 *
 * Features:
 *   - Intent classification with conversation-aware analysis
 *   - Hybrid retrieval: semantic vector search + BM25 keyword search
 *   - Reciprocal Rank Fusion (RRF) for result merging
 *   - Clarifying question generation for ambiguous queries
 *   - Grounded response generation with source citations
 *   - Structured logging with trace IDs
 *   - Graceful degradation on partial failures
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { embedQuery, chatCompletion } from './gemini.js';
import { search as vectorSearch } from './vectorStore.js';
import { searchKeyword } from './keywordStore.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('agent');

// ─── State Definition ───────────────────────────────────────────────────────

const AgentState = Annotation.Root({
  // Inputs
  sessionId:          Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),
  query:              Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),
  history:            Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  traceId:            Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),

  // Query analysis
  intent:             Annotation({ reducer: (_, v) => v ?? _, default: () => 'question' }),
  needsClarification: Annotation({ reducer: (_, v) => v !== undefined ? v : _, default: () => false }),
  clarifyReason:      Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),

  // Retrieval results
  vectorResults:      Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  keywordResults:     Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  fusedResults:       Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),

  // Output
  response:           Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),
  sources:            Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  responseType:       Annotation({ reducer: (_, v) => v ?? _, default: () => 'answer' }),
});

// ─── Node: Analyze Query ────────────────────────────────────────────────────

async function analyzeQuery(state) {
  const { query, history, traceId } = state;
  log.info('Analyzing query intent', { traceId, queryPreview: query.slice(0, 80) });

  const analysisPrompt = `You are a query analyzer for a document Q&A system. Analyze the user's question and determine if it is clear enough to search for information, or if clarification is needed.

Consider the conversation history — a follow-up like "tell me more" is clear if history provides context.

Respond with ONLY valid JSON (no markdown fences):
{
  "intent": "question" | "greeting" | "follow_up",
  "needsClarification": true | false,
  "clarifyReason": "explanation of what is unclear (empty string if clear)"
}

ONLY set needsClarification=true when:
- Query is extremely vague with NO history context (e.g., "tell me stuff")
- Query references something truly ambiguous that cannot be resolved from history
- Query asks about multiple completely unrelated topics simultaneously

Set needsClarification=false when:
- Query is specific enough to search (e.g., "what is the revenue?")
- Query is a follow-up that history makes clear
- Query asks for a summary or overview
- Query is a greeting or acknowledgment`;

  const historyContext = history.length > 0
    ? `\nRecent conversation:\n${history.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}`
    : '\nNo prior conversation.';

  try {
    const result = await chatCompletion(analysisPrompt, [], `${historyContext}\n\nUser query: "${query}"`);
    const jsonMatch = result.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      log.info('Query analyzed', {
        traceId,
        intent: analysis.intent,
        needsClarification: analysis.needsClarification,
      });
      return {
        intent: analysis.intent || 'question',
        needsClarification: analysis.needsClarification === true,
        clarifyReason: analysis.clarifyReason || '',
      };
    }
  } catch (err) {
    log.warn('Query analysis failed, defaulting to retrieval', { traceId, error: err.message });
  }

  // Default: assume query is clear and proceed
  return { intent: 'question', needsClarification: false, clarifyReason: '' };
}

// ─── Node: Ask Clarification ────────────────────────────────────────────────

async function askClarification(state) {
  const { query, clarifyReason, history, traceId } = state;
  log.info('Generating clarifying question', { traceId, reason: clarifyReason });

  const prompt = `You are Alex, a helpful PDF Q&A assistant. The user asked a question that needs clarification before you can search the documents effectively.

User's question: "${query}"
Reason clarification is needed: ${clarifyReason}

Generate a brief, friendly clarifying question. Be specific about what information you need. Keep it to 1-2 sentences. Do NOT apologize excessively.`;

  try {
    const cleanHistory = history.slice(-4).filter(m => m.role === 'user' || m.role === 'assistant');
    const firstUserIdx = cleanHistory.findIndex(m => m.role === 'user');
    const validHistory = firstUserIdx >= 0 ? cleanHistory.slice(firstUserIdx) : [];

    const response = await chatCompletion(prompt, validHistory, query);
    return { response, responseType: 'clarification', sources: [] };
  } catch (err) {
    log.error('Clarification generation failed', { traceId, error: err.message });
    return {
      response: "Could you be more specific? That'll help me search the documents more effectively.",
      responseType: 'clarification',
      sources: [],
    };
  }
}

// ─── Node: Hybrid Retrieval (Vector + Keyword in parallel) ──────────────────

async function retrieve(state) {
  const { sessionId, query, traceId } = state;
  log.info('Starting hybrid retrieval', { traceId });

  const [vectorResults, keywordResults] = await Promise.all([
    // Semantic vector search
    (async () => {
      try {
        const queryEmbedding = await embedQuery(query);
        const results = vectorSearch(sessionId, queryEmbedding, 10);
        log.info('Vector search complete', { traceId, count: results.length });
        return results;
      } catch (err) {
        log.warn('Vector search failed, degrading gracefully', { traceId, error: err.message });
        return [];
      }
    })(),
    // BM25 keyword search
    (async () => {
      try {
        const results = searchKeyword(sessionId, query, 10);
        log.info('Keyword search complete', { traceId, count: results.length });
        return results;
      } catch (err) {
        log.warn('Keyword search failed, degrading gracefully', { traceId, error: err.message });
        return [];
      }
    })(),
  ]);

  return { vectorResults, keywordResults };
}

// ─── Node: Reciprocal Rank Fusion ───────────────────────────────────────────

async function fuseResults(state) {
  const { vectorResults, keywordResults, traceId } = state;
  log.info('Fusing results with RRF', {
    traceId,
    vectorCount: vectorResults.length,
    keywordCount: keywordResults.length,
  });

  const RRF_K = 60; // Standard RRF constant
  const scoreMap = new Map();

  // Score vector results by rank
  vectorResults.forEach((result, rank) => {
    const key = `${result.metadata?.filename}::${result.metadata?.chunkIndex}`;
    const existing = scoreMap.get(key) || { score: 0, chunk: result, vectorRank: null, keywordRank: null };
    existing.score += 1 / (RRF_K + rank + 1);
    existing.vectorRank = rank + 1;
    scoreMap.set(key, existing);
  });

  // Score keyword results by rank
  keywordResults.forEach((result, rank) => {
    const key = `${result.metadata?.filename}::${result.metadata?.chunkIndex}`;
    const existing = scoreMap.get(key) || { score: 0, chunk: result, vectorRank: null, keywordRank: null };
    existing.score += 1 / (RRF_K + rank + 1);
    existing.keywordRank = rank + 1;
    scoreMap.set(key, existing);
  });

  // Sort by fused score, take top results
  const fused = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  const fusedResults = fused.map(f => ({
    ...f.chunk,
    fusedScore: f.score,
    vectorRank: f.vectorRank,
    keywordRank: f.keywordRank,
  }));

  const sources = fusedResults.map(r => ({
    text: r.text.slice(0, 200) + (r.text.length > 200 ? '…' : ''),
    filename: r.metadata?.filename,
    chunkIndex: r.metadata?.chunkIndex,
    score: Math.round(r.fusedScore * 10000) / 10000,
    vectorRank: r.vectorRank,
    keywordRank: r.keywordRank,
    matchType: r.vectorRank && r.keywordRank ? 'both' : r.vectorRank ? 'semantic' : 'keyword',
  }));

  log.info('Fusion complete', { traceId, fusedCount: fusedResults.length });
  return { fusedResults, sources };
}

// ─── Node: Generate Response ────────────────────────────────────────────────

async function generateResponse(state) {
  const { query, history, fusedResults, traceId } = state;
  log.info('Generating grounded response', { traceId, contextChunks: fusedResults.length });

  const context = fusedResults
    .map((r, i) => `[Source ${i + 1} — ${r.metadata?.filename}, Chunk ${r.metadata?.chunkIndex}]\n${r.text}`)
    .join('\n\n');

  const systemPrompt = `You are Alex, a precise and helpful AI assistant for document analysis. You answer questions based ONLY on the provided document context.

RULES:
1. ONLY use information from the provided sources — never fabricate facts.
2. Cite sources inline: e.g., "According to [Source 1], …"
3. If the context is insufficient to fully answer, state that clearly and share what you CAN determine.
4. Be concise, professional, and well-structured. Use bullet points or numbered lists when appropriate.
5. For follow-up questions, use conversation history for context continuity.

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`;

  // Clean history: ensure first message is from user
  const cleanHistory = history.filter(m => m.role === 'user' || m.role === 'assistant');
  const firstUserIdx = cleanHistory.findIndex(m => m.role === 'user');
  const validHistory = firstUserIdx >= 0 ? cleanHistory.slice(firstUserIdx) : [];

  try {
    const response = await chatCompletion(systemPrompt, validHistory, query);
    log.info('Response generated', { traceId, responseLength: response.length });
    return { response, responseType: 'answer' };
  } catch (err) {
    log.error('Response generation failed', { traceId, error: err.message });
    return {
      response: "I encountered an error generating a response. Please try again.",
      responseType: 'answer',
    };
  }
}

// ─── Routing Logic ──────────────────────────────────────────────────────────

function routeAfterAnalysis(state) {
  if (state.needsClarification) {
    log.info('Routing to clarification', { traceId: state.traceId });
    return 'askClarification';
  }
  log.info('Routing to retrieval', { traceId: state.traceId });
  return 'retrieve';
}

// ─── Graph Construction ─────────────────────────────────────────────────────

function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('analyzeQuery', analyzeQuery)
    .addNode('askClarification', askClarification)
    .addNode('retrieve', retrieve)
    .addNode('fuseResults', fuseResults)
    .addNode('generateResponse', generateResponse)
    .addEdge(START, 'analyzeQuery')
    .addConditionalEdges('analyzeQuery', routeAfterAnalysis, {
      askClarification: 'askClarification',
      retrieve: 'retrieve',
    })
    .addEdge('askClarification', END)
    .addEdge('retrieve', 'fuseResults')
    .addEdge('fuseResults', 'generateResponse')
    .addEdge('generateResponse', END);

  return graph.compile();
}

// Lazily compiled singleton
let compiledGraph = null;

export function getAgent() {
  if (!compiledGraph) {
    compiledGraph = buildAgentGraph();
    log.info('Agent graph compiled');
  }
  return compiledGraph;
}

export { AgentState };
