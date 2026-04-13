/**
 * Content moderation for AI-generated review responses.
 *
 * Combines a strict lexical blocklist with an optional pluggable moderation
 * service (shaped after OpenAI's moderations endpoint). The service is
 * injectable so tests never hit the network.
 *
 * A result shape of `{ flagged, categories, reason }` is returned so callers
 * can log/surface why content was rejected without leaking raw provider data.
 */

// Conservative, non-exhaustive lexical blocklist. We deliberately keep it
// small and focused on content categories that would be clearly inappropriate
// in a business-owner reply to a customer review (slurs, threats, explicit
// refund/legal promises the system prompt forbids, etc.).
//
// Matches are word-boundary, case-insensitive. Keep entries lowercased.
const BLOCKED_TERMS = Object.freeze([
  // Profanity / slurs (representative placeholders — extend per policy)
  'fuck',
  'shit',
  'bitch',
  'asshole',
  // Threats / harassment
  'kill yourself',
  'i will sue',
  "we'll sue",
  // Promises the SYSTEM_PROMPT explicitly forbids
  'guaranteed refund',
  'full refund guaranteed',
  // PII leakage signals
  'ssn:',
  'social security number',
]);

function buildBlocklistRegex(terms) {
  // Escape regex metacharacters and build a single alternation with
  // word boundaries where it makes sense. Multi-word phrases fall back to
  // a simple case-insensitive substring match inside the alternation.
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:${escaped.join('|')})`, 'i');
}

const BLOCKLIST_REGEX = buildBlocklistRegex(BLOCKED_TERMS);

export function lexicalCheck(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return { flagged: false, categories: [], reason: null };
  }
  const match = content.match(BLOCKLIST_REGEX);
  if (match) {
    return {
      flagged: true,
      categories: ['lexical_blocklist'],
      // Intentionally do not echo the matched term back to callers/logs.
      reason: 'Content matched lexical blocklist',
    };
  }
  return { flagged: false, categories: [], reason: null };
}

/**
 * Moderate AI-generated content before persistence.
 *
 * @param {string} content
 * @param {object} [deps]
 * @param {object} [deps.moderationClient] - Optional client with a
 *   `moderations.create({ input })` method (OpenAI-compatible shape). If not
 *   provided, only the lexical check runs.
 * @returns {Promise<{flagged: boolean, categories: string[], reason: string|null}>}
 */
export async function moderateContent(content, deps = {}) {
  const lex = lexicalCheck(content);
  if (lex.flagged) return lex;

  const { moderationClient } = deps;
  if (!moderationClient?.moderations?.create) {
    return { flagged: false, categories: [], reason: null };
  }

  let result;
  try {
    result = await moderationClient.moderations.create({ input: content });
  } catch {
    // Fail closed: if the moderation service errors, treat as flagged so we
    // never silently persist unchecked content.
    return {
      flagged: true,
      categories: ['moderation_service_error'],
      reason: 'Moderation service unavailable',
    };
  }

  const first = result?.results?.[0];
  if (first?.flagged) {
    const categories = first.categories
      ? Object.entries(first.categories)
          .filter(([, v]) => v === true)
          .map(([k]) => k)
      : ['unspecified'];
    return {
      flagged: true,
      categories,
      reason: 'Flagged by moderation service',
    };
  }

  return { flagged: false, categories: [], reason: null };
}

export class ModerationError extends Error {
  constructor(result) {
    super(result.reason || 'Content failed moderation');
    this.name = 'ModerationError';
    this.categories = result.categories ?? [];
  }
}
