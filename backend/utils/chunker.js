/**
 * Splits text into overlapping chunks for embedding.
 * @param {string} text - Raw text to split
 * @param {object} opts
 * @param {number} opts.chunkSize - Max characters per chunk (default 500)
 * @param {number} opts.overlap - Overlap between chunks (default 100)
 * @returns {{ id: number, text: string }[]}
 */
export function chunkText(text, { chunkSize = 500, overlap = 100 } = {}) {
  const chunks = [];
  let start = 0;
  let id = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n')
      );
      if (lastBreak > chunkSize * 0.3) {
        end = start + lastBreak + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push({ id: id++, text: chunk });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}
