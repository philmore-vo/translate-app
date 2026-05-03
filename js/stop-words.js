/* ============================================
   EngiLink — Stop Words, Tokenizer & Phrasal Verb Detector
   ============================================ */

'use strict';

// ── Common English stop words ──
const STOP_WORDS = new Set([
  // Articles & determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  // Pronouns
  'i', 'me', 'my', 'myself', 'mine',
  'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'who', 'whom', 'whose', 'which', 'what',
  // Be / have / do
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  // Modals
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'need', 'dare', 'ought',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'for', 'because', 'although',
  'though', 'while', 'whereas', 'if', 'unless', 'until', 'since', 'as',
  'when', 'where', 'whether', 'either', 'neither', 'both',
  // Prepositions (also used for phrasal verb detection)
  'at', 'by', 'in', 'on', 'to', 'of', 'from', 'with', 'without',
  'about', 'above', 'across', 'after', 'against', 'along', 'among',
  'around', 'before', 'behind', 'below', 'beneath', 'beside', 'besides',
  'between', 'beyond', 'during', 'except', 'inside', 'into',
  'near', 'onto', 'outside', 'over', 'past', 'through',
  'throughout', 'toward', 'towards', 'under', 'underneath', 'upon',
  'within',
  // Phrasal verb particles (must be stop words to avoid standalone saving)
  'off', 'out', 'up', 'down', 'away', 'back', 'forward', 'together',
  // Adverbs & misc
  'not', 'no', 'nor', 'very', 'too', 'also', 'just', 'only',
  'here', 'there', 'then', 'now', 'again', 'once', 'twice',
  'already', 'always', 'never', 'ever', 'often', 'sometimes',
  'still', 'even', 'much', 'many', 'more', 'most', 'less', 'least',
  'own', 'same', 'other', 'another', 'such', 'rather', 'quite',
  'all', 'any', 'each', 'every', 'few', 'some', 'several',
  'than', 'how', 'why',
  // Contractions (after stripping apostrophes)
  't', 's', 're', 've', 'll', 'd', 'n', 'don', 'doesn', 'didn',
  'won', 'wouldn', 'couldn', 'shouldn', 'isn', 'aren', 'wasn', 'weren',
  'hasn', 'haven', 'hadn',
  // Common function words
  'get', 'got', 'getting', 'let', 'like',
  // Short / noise
  'etc', 'eg', 'ie', 'vs',
]);

// ── Prepositions commonly forming phrasal verbs ──
const PHRASAL_PREPOSITIONS = new Set([
  'about', 'across', 'after', 'along', 'around', 'at', 'away',
  'back', 'by', 'down', 'for', 'forward', 'from',
  'in', 'into', 'off', 'on', 'onto', 'out', 'over',
  'through', 'to', 'together', 'up', 'upon', 'with',
]);

// ── Common verbs known to form phrasal verbs ──
const PHRASAL_VERB_ROOTS = new Set([
  'ask', 'blow', 'break', 'bring', 'call', 'carry', 'check', 'clean',
  'clear', 'close', 'come', 'count', 'cut', 'do', 'draw', 'drop',
  'eat', 'end', 'fall', 'figure', 'fill', 'find', 'get', 'give',
  'go', 'grow', 'hand', 'hang', 'head', 'hold', 'hurry', 'keep',
  'kick', 'knock', 'lay', 'leave', 'let', 'line', 'live', 'lock',
  'look', 'make', 'move', 'open', 'pack', 'pass', 'pay', 'pick',
  'play', 'point', 'pull', 'push', 'put', 'reach', 'ring', 'rule',
  'run', 'send', 'set', 'settle', 'show', 'shut', 'sign', 'sit',
  'slow', 'sort', 'speed', 'stand', 'start', 'stay', 'step', 'stick',
  'stop', 'switch', 'take', 'talk', 'tear', 'think', 'throw', 'tie',
  'try', 'turn', 'use', 'wake', 'walk', 'warm', 'wash', 'watch',
  'wear', 'wind', 'wipe', 'work', 'write',
]);

// Words that signal a sentence rather than a lexical phrase when they lead a 2-4 word input
const SENTENCE_STARTERS = new Set([
  'i', 'we', 'you', 'he', 'she', 'it', 'they', 'who', 'what',
  'the', 'a', 'an', 'this', 'that', 'there', 'here',
  'my', 'your', 'his', 'her', 'our', 'their',
]);

// Small verb lexicon used only to avoid saving obvious short sentences as phrases.
const SENTENCE_VERBS = new Set([
  'be', 'am', 'is', 'are', 'was', 'were',
  'have', 'has', 'had',
  'do', 'does', 'did',
  'fail', 'fails', 'failed',
  'love', 'loves', 'loved',
  'examine', 'examines', 'examined',
  'work', 'works', 'worked',
  'run', 'runs', 'ran',
  'walk', 'walks', 'walked',
  'make', 'makes', 'made',
  'take', 'takes', 'took',
  'go', 'goes', 'went',
  'come', 'comes', 'came',
  'use', 'uses', 'used',
  'need', 'needs', 'needed',
  'want', 'wants', 'wanted',
  'see', 'sees', 'saw',
  'say', 'says', 'said',
  'think', 'thinks', 'thought',
  'create', 'creates', 'created',
  'build', 'builds', 'built',
  'show', 'shows', 'showed',
  'happen', 'happens', 'happened',
]);

function cleanToken(token) {
  return String(token || '').toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
}

function looksLikeSentenceVerb(token, index) {
  if (index === 0 || !token) return false;
  if (SENTENCE_VERBS.has(token)) return true;
  if (/ed$/.test(token)) return true;
  if (/ies$/.test(token)) return SENTENCE_VERBS.has(token.replace(/ies$/, 'y'));
  if (/es$/.test(token)) return SENTENCE_VERBS.has(token.replace(/es$/, '')) || SENTENCE_VERBS.has(token.replace(/es$/, 'e'));
  if (/s$/.test(token) && !/(ss|ous|ics)$/.test(token)) {
    return SENTENCE_VERBS.has(token.replace(/s$/, ''));
  }
  return false;
}

/**
 * Classify input text into one of three categories.
 * - singleWord: 1 word
 * - lexicalPhrase: 2-4 words that look like a compound term / phrasal verb
 * - longText: 5+ words, or 2-4 words that look like a sentence
 *
 * A 2-4 word input is treated as a sentence (longText) if:
 *   - It ends with sentence punctuation (. ? !)
 *   - It starts with a pronoun, article, or demonstrative
 * @param {string} text
 * @returns {'singleWord' | 'lexicalPhrase' | 'longText'}
 */
function classifyInput(text) {
  const trimmed = (text || '').trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return 'singleWord';
  if (words.length >= 5) return 'longText';

  // 2-4 words: distinguish phrase from short sentence
  // Sentence-ending punctuation → sentence
  if (/[.?!]\s*$/.test(trimmed)) return 'longText';
  // Starts with pronoun / article / demonstrative → sentence
  const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
  if (SENTENCE_STARTERS.has(firstWord)) return 'longText';
  if (detectPhrasalVerbs(trimmed).length > 0) return 'lexicalPhrase';

  const tokens = words.map(cleanToken).filter(Boolean);
  if (tokens.length >= 3 && /ly$/.test(tokens[tokens.length - 1])) return 'longText';
  if (tokens.some((token, index) => looksLikeSentenceVerb(token, index))) return 'longText';

  return 'lexicalPhrase';
}

/**
 * Tokenize text into individual words for vocabulary extraction.
 * - Splits on whitespace/punctuation
 * - Removes possessives ('s, ')
 * - Lowercases
 * - Filters stop words and words < 3 chars
 * - Deduplicates
 * - Normalizes common verb inflections to known roots, so "uses" maps to "use"
 *   and "looking at" maps to "look".
 *
 * @param {string} text
 * @returns {{ words: string[], phrasalVerbs: Array<{verb: string, preposition: string, phrase: string}> }}
 */
function extractVocabulary(text) {
  if (!text || typeof text !== 'string') return { words: [], phrasalVerbs: [] };

  // 1. Detect phrasal verbs BEFORE filtering (prepositions are stop words)
  const phrasalVerbs = detectPhrasalVerbs(text);
  const phrasalRoots = new Set(phrasalVerbs.map((pv) => pv.verb));

  // 2. Tokenize
  const regex = /[\p{L}][\p{L}\p{N}'_-]*/gu;
  const matches = text.match(regex) || [];

  const seen = new Set();
  const words = [];

  for (const raw of matches) {
    // Remove trailing possessives: word's → word, workers' → workers
    let word = raw.replace(/'s$/i, '').replace(/'$/i, '');
    word = word.toLowerCase().trim();
    const root = matchVerbRoot(word);
    if (root) {
      word = root;
    }

    // Skip empty, too short, all digits, stop words, already seen
    if (!word || word.length < 3) continue;
    if (/^\d+$/.test(word)) continue;
    if (STOP_WORDS.has(word) && !phrasalRoots.has(word)) continue;
    if (seen.has(word)) continue;

    seen.add(word);
    words.push(word);
  }

  return { words, phrasalVerbs };
}

/**
 * Try to match an inflected word to a known phrasal verb root.
 * Only used for phrasal verb detection — not for general vocabulary extraction.
 * @param {string} word
 * @returns {string|null} The matched root, or null.
 */
function matchVerbRoot(word) {
  if (PHRASAL_VERB_ROOTS.has(word)) return word;
  // Common inflection patterns: looked→look, takes→take, coming→come, carried→carry
  const suffixes = [
    { pattern: /ed$/, replacements: ['', 'e'] },       // looked→look, closed→close
    { pattern: /ing$/, replacements: ['', 'e'] },       // looking→look, coming→come
    { pattern: /ied$/, replacements: ['y'] },            // carried→carry
    { pattern: /ying$/, replacements: ['y', 'ie'] },     // tying→tie
    { pattern: /s$/, replacements: [''] },               // takes→take, comes→come
    { pattern: /es$/, replacements: ['', 'e'] },         // pushes→push, closes→close
  ];
  for (const { pattern, replacements } of suffixes) {
    if (pattern.test(word)) {
      const stem = word.replace(pattern, '');
      for (const r of replacements) {
        const candidate = stem + r;
        if (candidate.length >= 2 && PHRASAL_VERB_ROOTS.has(candidate)) return candidate;
      }
    }
  }
  // Handle doubled consonant: stopped→stop, getting→get, running→run
  if (/(.)\1(ed|ing)$/.test(word)) {
    const candidate = word.replace(/(.)\1(ed|ing)$/, '$1');
    if (PHRASAL_VERB_ROOTS.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Detect phrasal verb patterns in the original text.
 * Scans for: known_verb (or inflected form) + preposition sequences.
 * Runs on raw text BEFORE stop word filtering.
 *
 * @param {string} text
 * @returns {Array<{verb: string, preposition: string, phrase: string}>}
 */
function detectPhrasalVerbs(text) {
  if (!text || typeof text !== 'string') return [];

  // Tokenize into ordered word list
  const regex = /[\p{L}][\p{L}\p{N}'_-]*/gu;
  const tokens = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase().replace(/'s$/i, '').replace(/'$/i, ''));
  }

  const results = [];
  const seen = new Set();

  for (let i = 0; i < tokens.length - 1; i++) {
    const word = tokens[i];
    const next = tokens[i + 1];
    const root = matchVerbRoot(word);

    if (root && PHRASAL_PREPOSITIONS.has(next)) {
      const phrase = `${root} ${next}`;
      if (!seen.has(phrase)) {
        seen.add(phrase);
        results.push({ verb: root, preposition: next, phrase });
      }
    }
  }

  return results;
}

/**
 * Check if a word is a stop word.
 * @param {string} word
 * @returns {boolean}
 */
function isStopWord(word) {
  return STOP_WORDS.has((word || '').toLowerCase().trim());
}

module.exports = {
  STOP_WORDS,
  PHRASAL_PREPOSITIONS,
  PHRASAL_VERB_ROOTS,
  classifyInput,
  extractVocabulary,
  detectPhrasalVerbs,
  matchVerbRoot,
  isStopWord,
};
