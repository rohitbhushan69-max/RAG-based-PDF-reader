/** In-memory vector store scoped by session ID. */

const store = new Map();

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Store chunks and their embeddings for a session.
 * @param {string} sessionId
 * @param {{ id: number, text: string, metadata: object }[]} chunks
 * @param {number[][]} embeddings
 */
export function addDocuments(sessionId, chunks, embeddings) {
  if (!store.has(sessionId)) {
    store.set(sessionId, { chunks: [], embeddings: [] });
  }
  const session = store.get(sessionId);
  session.chunks.push(...chunks);
  session.embeddings.push(...embeddings);
}

/**
 * Search for top-K most relevant chunks.
 * @param {string} sessionId
 * @param {number[]} queryEmbedding
 * @param {number} topK
 * @returns {{ text: string, metadata: object, score: number }[]}
 */
export function search(sessionId, queryEmbedding, topK = 5) {
  const session = store.get(sessionId);
  if (!session || session.chunks.length === 0) return [];

  const scored = session.chunks.map((chunk, i) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, session.embeddings[i]),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Check if a session has any documents.
 */
export function hasDocuments(sessionId) {
  const session = store.get(sessionId);
  return session && session.chunks.length > 0;
}

/**
 * Clear all data for a session.
 */
export function clearSession(sessionId) {
  store.delete(sessionId);
}
