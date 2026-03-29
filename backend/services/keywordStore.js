/**
 * BM25 keyword search engine with session-scoped indexes.
 * Implements Okapi BM25 ranking with proper tokenization, stopword removal,
 * and inverted index for fast retrieval.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('keyword-store');
const indexes = new Map();

// BM25 parameters (standard defaults)
const K1 = 1.5;
const B = 0.75;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or',
  'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'to', 'was', 'will', 'with', 'from', 'has', 'have', 'had',
  'its', 'our', 'we', 'you', 'your', 'can', 'do', 'does', 'did',
  'would', 'could', 'should', 'may', 'might', 'shall', 'been', 'being',
  'he', 'she', 'him', 'her', 'his', 'who', 'which', 'what', 'when',
  'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'any', 'about', 'above', 'after', 'again',
  'also', 'am', 'because', 'before', 'between', 'down', 'during',
  'just', 'my', 'now', 'only', 'out', 'own', 'same', 'so', 'than',
  'too', 'up', 'very', 'were', 'while',
]);

/**
 * Tokenize text: lowercase, strip non-alphanumeric, remove stopwords + short tokens.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Add document chunks to the BM25 index for a session.
 * @param {string} sessionId
 * @param {{ id: number, text: string, metadata: object }[]} chunks
 */
export function addToIndex(sessionId, chunks) {
  if (!indexes.has(sessionId)) {
    indexes.set(sessionId, {
      chunks: [],
      docTermFreqs: [],
      docLengths: [],
      avgDocLength: 0,
      docFreqs: new Map(),
      totalDocs: 0,
    });
  }

  const idx = indexes.get(sessionId);

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const termFreq = new Map();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Update document frequencies (how many docs contain each term)
    for (const term of termFreq.keys()) {
      idx.docFreqs.set(term, (idx.docFreqs.get(term) || 0) + 1);
    }

    idx.chunks.push(chunk);
    idx.docTermFreqs.push(termFreq);
    idx.docLengths.push(tokens.length);
    idx.totalDocs++;
  }

  // Recalculate average document length
  idx.avgDocLength = idx.docLengths.reduce((a, b) => a + b, 0) / idx.totalDocs;

  log.info('Keyword index updated', {
    sessionId: sessionId.slice(0, 8),
    newChunks: chunks.length,
    totalDocs: idx.totalDocs,
  });
}

/**
 * BM25 keyword search for a session.
 * @param {string} sessionId
 * @param {string} query
 * @param {number} topK
 * @returns {{ text: string, metadata: object, score: number }[]}
 */
export function searchKeyword(sessionId, query, topK = 10) {
  const idx = indexes.get(sessionId);
  if (!idx || idx.totalDocs === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scores = new Array(idx.totalDocs).fill(0);
  const N = idx.totalDocs;

  for (const term of queryTerms) {
    const df = idx.docFreqs.get(term) || 0;
    if (df === 0) continue;

    // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    for (let i = 0; i < N; i++) {
      const tf = idx.docTermFreqs[i].get(term) || 0;
      if (tf === 0) continue;

      const dl = idx.docLengths[i];
      const numerator = tf * (K1 + 1);
      const denominator = tf + K1 * (1 - B + B * (dl / idx.avgDocLength));
      scores[i] += idf * (numerator / denominator);
    }
  }

  return scores
    .map((score, i) => ({ ...idx.chunks[i], score }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Check if a session has keyword index data.
 */
export function hasIndex(sessionId) {
  const idx = indexes.get(sessionId);
  return idx && idx.totalDocs > 0;
}

/**
 * Clear the keyword index for a session.
 */
export function clearIndex(sessionId) {
  indexes.delete(sessionId);
}
