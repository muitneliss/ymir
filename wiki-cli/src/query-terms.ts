/**
 * Query-term extraction for the read side.
 *
 * `wiki query` shells out to `qmd search`, which is pure BM25 keyword matching.
 * The CLI's whole purpose is to be called by an LLM, which naturally passes a
 * user's question verbatim — and a question is mostly stopwords. Measured on a
 * 19-page wiki, the question form alone destroys retrieval:
 *
 *   "When did Melanie paint a sunrise?"            -> 0 hits
 *   "melanie paint sunrise"                        -> 1 hit
 *   "When did Caroline go to the LGBTQ support group?" -> 3 hits
 *   "caroline go lgbtq support group"              -> 10 hits
 *
 * Stripping function words before handing the query to BM25 recovers those
 * matches without adding embeddings or a local LLM, which the wiki's design
 * deliberately avoids.
 */

/**
 * English function words plus the interrogatives that open most questions.
 * Deliberately conservative: only words that carry no retrieval signal. Domain
 * nouns are never included, so no wiki content term can be removed.
 */
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
  "down", "during", "each", "few", "for", "from", "further", "had", "has",
  "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
  "likely", "me", "might", "more", "most", "must", "my", "myself", "no", "nor",
  "not", "now", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shall", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
  "what", "when", "where", "whether", "which", "while", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
]);

/**
 * Reduce a natural-language query to its content terms.
 *
 * Returns the ORIGINAL query unchanged when extraction would leave nothing —
 * a query made entirely of function words (or of characters this tokeniser
 * drops, e.g. non-Latin scripts) must still search for what the caller typed
 * rather than silently searching for nothing.
 */
export function extractTerms(query: string): string {
  const terms = query
    .toLowerCase()
    // Keep alphanumerics; apostrophes split so "caroline's" -> "caroline".
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  return terms.length > 0 ? terms.join(" ") : query;
}
