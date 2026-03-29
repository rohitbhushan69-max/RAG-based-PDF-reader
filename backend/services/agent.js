/**
 * LangGraph Agentic RAG Pipeline
 *
 * State graph:
 *   START → analyzeQuery
 *     ├── (needs clarification) → askClarification → END
 *     └── (ready) → retrieve (vector + keyword parallel) → fuseResults → routeAfterFusion
 *                        ├── (needs external knowledge) → webSearch → generateResponse → END
 *                        └── (sufficient context)       → generateResponse → END
 *
 * Features:
 *   - Intent classification with conversation-aware analysis
 *   - Hybrid retrieval: semantic vector search + BM25 keyword search
 *   - Reciprocal Rank Fusion (RRF) for result merging
 *   - Clarifying question generation for ambiguous queries
 *   - Web search via Gemini Google Search grounding for external knowledge
 *   - LLM-smart response generation: combines document context + external knowledge
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
  needsExternalSearch:Annotation({ reducer: (_, v) => v !== undefined ? v : _, default: () => false }),
  clarifyReason:      Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),

  // Retrieval results
  vectorResults:      Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  keywordResults:     Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  fusedResults:       Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),

  // Web search
  webSearchContext:   Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),
  webSearchUsed:      Annotation({ reducer: (_, v) => v !== undefined ? v : _, default: () => false }),

  // Agent decision log — accumulates steps as the graph executes
  agentTrace:         Annotation({ reducer: (prev, v) => [...(prev || []), ...(v || [])], default: () => [] }),

  // Output
  response:           Annotation({ reducer: (_, v) => v ?? _, default: () => '' }),
  sources:            Annotation({ reducer: (_, v) => v ?? _, default: () => [] }),
  responseType:       Annotation({ reducer: (_, v) => v ?? _, default: () => 'answer' }),
});

// ─── Node: Analyze Query ────────────────────────────────────────────────────

async function analyzeQuery(state) {
  const { query, history, traceId } = state;
  log.info('Analyzing query intent', { traceId, queryPreview: query.slice(0, 80) });

  const analysisPrompt = `You are a query analyzer for a document Q&A system. Analyze the user's question and determine:
1. If it is clear enough to search, or needs clarification.
2. If answering requires external knowledge beyond what a document would contain.

Consider the conversation history — a follow-up like "tell me more" is clear if history provides context.

Respond with ONLY valid JSON (no markdown fences):
{
  "intent": "question" | "greeting" | "follow_up",
  "needsClarification": true | false,
  "needsExternalSearch": true | false,
  "clarifyReason": "explanation of what is unclear (empty string if clear)"
}

needsClarification=true ONLY when:
- Query is extremely vague with NO history context
- Query references something truly ambiguous that cannot be resolved

needsExternalSearch=true when the query requires knowledge NOT typically found in the document itself, such as:
- Identifying medical conditions from medicine/drug names in a prescription
- Explaining what specific medicines are used for or their side effects
- Looking up technical terms, abbreviations, or codes mentioned in documents
- Connecting document data to real-world context (e.g., company background, regulatory info)
- Any question where the document provides raw data but the user needs interpretation using external knowledge

needsExternalSearch=false when:
- The answer can be fully derived from the document text (summaries, specific facts, quotes)
- Simple factual lookups from the document content`;

  const historyContext = history.length > 0
    ? `\nRecent conversation:\n${history.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}`
    : '\nNo prior conversation.';

  try {
    const result = await chatCompletion(analysisPrompt, [], `${historyContext}\n\nUser query: "${query}"`);
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      log.info('Query analyzed', {
        traceId,
        intent: analysis.intent,
        needsClarification: analysis.needsClarification,
        needsExternalSearch: analysis.needsExternalSearch,
      });
      return {
        intent: analysis.intent || 'question',
        needsClarification: analysis.needsClarification === true,
        needsExternalSearch: analysis.needsExternalSearch === true,
        clarifyReason: analysis.clarifyReason || '',
        agentTrace: [{ node: 'analyzeQuery', ts: Date.now(), intent: analysis.intent, needsClarification: analysis.needsClarification, needsExternalSearch: analysis.needsExternalSearch }],
      };
    }
  } catch (err) {
    log.warn('Query analysis failed, defaulting to retrieval', { traceId, error: err.message });
  }

  return { intent: 'question', needsClarification: false, needsExternalSearch: false, clarifyReason: '', agentTrace: [{ node: 'analyzeQuery', ts: Date.now(), intent: 'question', fallback: true }] };
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

    const result = await chatCompletion(prompt, validHistory, query);
    return { response: result.text, responseType: 'clarification', sources: [], agentTrace: [{ node: 'askClarification', ts: Date.now(), reason: clarifyReason }] };
  } catch (err) {
    log.error('Clarification generation failed', { traceId, error: err.message });
    return {
      response: "Could you be more specific? That'll help me search the documents more effectively.",
      responseType: 'clarification',
      sources: [],
      agentTrace: [{ node: 'askClarification', ts: Date.now(), fallback: true }],
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

  return {
    vectorResults,
    keywordResults,
    agentTrace: [{ node: 'retrieve', ts: Date.now(), vectorCount: vectorResults.length, keywordCount: keywordResults.length }],
  };
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
    page: r.metadata?.page || null,
    score: Math.round(r.fusedScore * 10000) / 10000,
    vectorRank: r.vectorRank,
    keywordRank: r.keywordRank,
    matchType: r.vectorRank && r.keywordRank ? 'both' : r.vectorRank ? 'semantic' : 'keyword',
  }));

  log.info('Fusion complete', { traceId, fusedCount: fusedResults.length });
  return { fusedResults, sources, agentTrace: [{ node: 'fuseResults', ts: Date.now(), fusedCount: fusedResults.length, bothCount: sources.filter(s => s.matchType === 'both').length }] };
}

// ─── Node: Web Search via Gemini Google Search Grounding ────────────────────

async function webSearch(state) {
  const { query, fusedResults, traceId } = state;
  log.info('Performing web search for external knowledge', { traceId });

  // Build a focused search query using document context + user question
  const docSnippets = fusedResults
    .slice(0, 3)
    .map(r => r.text.slice(0, 300))
    .join('\n');

  const searchPrompt = `You are a research assistant. The user has a document and is asking a question that requires external knowledge to answer properly.

Document excerpts:
${docSnippets}

User question: "${query}"

Based on the document content and the user's question, provide a thorough, factual research summary. Include:
- What specific items/terms from the document mean (e.g., medicine names → conditions, technical terms → definitions)
- Relevant context that helps interpret the document
- Any important details the user should know

Be factual and comprehensive. Cite your reasoning.`;

  try {
    const result = await chatCompletion(searchPrompt, [], query, { googleSearch: true });
    log.info('Web search complete', {
      traceId,
      hasGrounding: !!result.groundingMetadata,
      contextLength: result.text.length,
    });
    return {
      webSearchContext: result.text,
      webSearchUsed: true,
      agentTrace: [{ node: 'webSearch', ts: Date.now(), success: true, hasGrounding: !!result.groundingMetadata }],
    };
  } catch (err) {
    log.warn('Web search failed, continuing without external context', { traceId, error: err.message });
    return { webSearchContext: '', webSearchUsed: false, agentTrace: [{ node: 'webSearch', ts: Date.now(), success: false }] };
  }
}

// ─── Node: Generate Response ────────────────────────────────────────────────

async function generateResponse(state) {
  const { query, history, fusedResults, webSearchContext, webSearchUsed, traceId } = state;
  log.info('Generating response', { traceId, contextChunks: fusedResults.length, webSearchUsed });

  const context = fusedResults
    .map((r, i) => `[Source ${i + 1} — ${r.metadata?.filename}, Chunk ${r.metadata?.chunkIndex}${r.metadata?.page ? `, Page ${r.metadata.page}` : ''}]\n${r.text}`)
    .join('\n\n');

  const webSection = webSearchUsed && webSearchContext
    ? `\n\n--- EXTERNAL KNOWLEDGE (from web search) ---\n${webSearchContext}\n--- END EXTERNAL KNOWLEDGE ---`
    : '';

  // Detect medical content for domain-specific instructions
  const allText = fusedResults.map(r => r.text).join(' ').toLowerCase();
  const medicalSignals = ['prescription', 'dosage', 'mg', 'tablet', 'capsule', 'diagnosis',
    'patient', 'dr.', 'doctor', 'rx', 'medication', 'pharmaceutical', 'clinical',
    'symptom', 'treatment', 'medicine', 'hospital', 'medical', 'healthcare'];
  const medicalHits = medicalSignals.filter(s => allText.includes(s)).length;
  const isMedical = medicalHits >= 2;

  const medicalInstructions = isMedical ? `
MEDICAL DOMAIN GUIDELINES:
- When you identify medicines/drugs, explain what condition they typically treat, their drug class, and common usage.
- Flag any potential drug interactions if multiple medications are mentioned.
- If dosages are listed, note whether they appear to be standard adult dosages.
- Always include a disclaimer: "This is AI-generated analysis for informational purposes only. Consult a healthcare professional for medical advice."
- Use precise medical terminology but also provide plain-language explanations.
` : '';

  const systemPrompt = `You are Alex, a precise, knowledgeable, and helpful AI assistant for document analysis.

APPROACH:
1. Use the DOCUMENT CONTEXT as your primary source of truth — cite it with [Source N].
2. When the document contains items that need interpretation (e.g., medicine names, technical terms, codes, abbreviations), use your knowledge${webSearchUsed ? ' and the provided external research' : ''} to explain what they mean.
3. You are allowed and encouraged to apply your knowledge to INTERPRET document content — e.g., identifying medical conditions from prescribed medicines, explaining financial terms, decoding technical jargon.
4. Clearly distinguish between what the document states vs. what you infer from external knowledge.
5. Be concise, professional, and well-structured. Use bullet points or numbered lists when appropriate.
6. For follow-up questions, use conversation history for context continuity.
7. If you genuinely cannot determine an answer, say so honestly.
${medicalInstructions}
--- DOCUMENT CONTEXT ---
${context}
--- END DOCUMENT CONTEXT ---${webSection}`;

  const cleanHistory = history.filter(m => m.role === 'user' || m.role === 'assistant');
  const firstUserIdx = cleanHistory.findIndex(m => m.role === 'user');
  const validHistory = firstUserIdx >= 0 ? cleanHistory.slice(firstUserIdx) : [];

  try {
    const result = await chatCompletion(systemPrompt, validHistory, query);
    log.info('Response generated', { traceId, responseLength: result.text.length });
    return { response: result.text, responseType: webSearchUsed ? 'answer_with_search' : 'answer', agentTrace: [{ node: 'generateResponse', ts: Date.now(), webSearchUsed, contextChunks: fusedResults.length, medicalMode: isMedical }] };
  } catch (err) {
    log.error('Response generation failed', { traceId, error: err.message });
    return {
      response: "I encountered an error generating a response. Please try again.",
      responseType: 'answer',
      agentTrace: [{ node: 'generateResponse', ts: Date.now(), error: true }],
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

function routeAfterFusion(state) {
  if (state.needsExternalSearch) {
    log.info('Routing to web search (external knowledge needed)', { traceId: state.traceId });
    return 'webSearch';
  }
  log.info('Routing directly to generate (sufficient context)', { traceId: state.traceId });
  return 'generateResponse';
}

// ─── Graph Construction ─────────────────────────────────────────────────────

function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('analyzeQuery', analyzeQuery)
    .addNode('askClarification', askClarification)
    .addNode('retrieve', retrieve)
    .addNode('fuseResults', fuseResults)
    .addNode('webSearch', webSearch)
    .addNode('generateResponse', generateResponse)
    .addEdge(START, 'analyzeQuery')
    .addConditionalEdges('analyzeQuery', routeAfterAnalysis, {
      askClarification: 'askClarification',
      retrieve: 'retrieve',
    })
    .addEdge('askClarification', END)
    .addEdge('retrieve', 'fuseResults')
    .addConditionalEdges('fuseResults', routeAfterFusion, {
      webSearch: 'webSearch',
      generateResponse: 'generateResponse',
    })
    .addEdge('webSearch', 'generateResponse')
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
