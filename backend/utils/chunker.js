/**
 * Splits text into overlapping chunks for embedding.
 * Tracks approximate page numbers using page break markers.
 * @param {string} text - Raw text to split
 * @param {object} opts
 * @param {number} opts.chunkSize - Max characters per chunk (default 500)
 * @param {number} opts.overlap - Overlap between chunks (default 100)
 * @param {number} opts.totalPages - Total pages in document (for page estimation)
 * @returns {{ id: number, text: string, page: number }[]}
 */
export function chunkText(text, { chunkSize = 500, overlap = 100, totalPages = 1 } = {}) {
  const chunks = [];
  let start = 0;
  let id = 0;

  // Estimate page boundaries — pdf-parse separates pages with multiple newlines
  const textLength = text.length;
  const avgPageLen = totalPages > 1 ? textLength / totalPages : textLength;

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
      // Estimate which page this chunk starts on
      const page = Math.min(Math.floor(start / avgPageLen) + 1, totalPages);
      chunks.push({ id: id++, text: chunk, page });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}
