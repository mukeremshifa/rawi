const CITATION = /(\s?)\[\[([^\]\s]{1,200})\]\]/g;

export type Grounding = 'materials' | 'mixed' | 'general' | 'insufficient' | 'translated';
export type EvidenceVerdict = 'sufficient' | 'partial' | 'absent' | 'conversational';

const STOP = new Set(
  'this that with from have they their them were what when which while would could should about there these those also into than then your some such more most only other because been being does just like make made many much must over very will after before again between through during under where who whom whose'.split(
    ' ',
  ),
);
const words = (text: string) => [
  ...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter(w => !STOP.has(w))),
];
/** A crude stem, so `enforced` finds `enforcement`. Enough to compare a sentence with a passage. */
const stem = (word: string) => (word.length > 6 ? word.slice(0, Math.max(5, word.length - 3)) : word);
/** Share of a sentence's content words that a passage mentions. */
export function support(sentence: string, passage: string) {
  const own = words(sentence.replace(CITATION, ' '));
  if (!own.length) return 1;
  const text = passage.toLowerCase();
  return own.filter(w => text.includes(stem(w))).length / own.length;
}

/** The Latin-script words of a sentence, which is what a reply in Arabic quotes from English passages. */
const latinWords = (sentence: string) =>
  (sentence.replace(CITATION, ' ').match(/[A-Za-z][A-Za-z'-]*/g) ?? []).join(' ');

/** A citation stands when its sentence shares at least this much with the cited passage. */
const CITED_SUPPORT = 0.25;
/** A sentence counts as resting on the materials when a passage covers this much of it. */
const SENTENCE_SUPPORT = 0.4;

/** Rawi's own sentences use no em dashes, and some models write them whatever they are told. A comma stands in. */
export const plainDashes = (text: string) => text.replace(/\s*\u2014\s*/g, ', ');

/**
 * Checks a finished reply against the passages it was given. Citations to unknown passages are
 * removed, and so are citations whose sentence the passage does not support. Grounding is
 * worked out here from the retrieval verdict and how many of the reply's statements the
 * passages cover. The model is never asked for it.
 *
 * A reply written in another language than its passages cannot be compared word by word. Its
 * citations are checked only against the words it quotes in the passages' language, a sentence
 * that quotes nothing keeps a citation to a real passage, and its grounding says it is a
 * translation of the cited passages rather than claiming they cover it.
 */
export function finishTutorText(
  raw: string,
  passages: { id: string; text: string }[],
  verdict: EvidenceVerdict,
  crossLanguage = false,
) {
  // Older prompts asked for a trailer after the reply. Anything from it onwards is dropped.
  const at = raw.lastIndexOf('@@meta');
  const body = plainDashes(at >= 0 ? raw.slice(0, at) : raw).trim();
  const byId = new Map(passages.map(p => [p.id, p.text]));
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim());
  const citations: string[] = [];
  let dropped = 0,
    unsupported = 0;
  const kept = sentences.map(sentence =>
    sentence.replace(CITATION, (_match, space: string, id: string) => {
      const passage = byId.get(id);
      if (passage === undefined) {
        dropped++;
        return '';
      }
      const compared = crossLanguage ? latinWords(sentence) : sentence;
      if (compared.trim() && support(compared, passage) < CITED_SUPPORT) {
        unsupported++;
        return '';
      }
      if (!citations.includes(id)) citations.push(id);
      return `${space}[[${id}]]`;
    }),
  );
  let text = body;
  // Rebuild in place so the reply keeps its own line breaks.
  // A function replacement, so `$$` in a formula is kept as written and never read as a pattern.
  sentences.forEach((s, i) => {
    text = text.replace(s, () => kept[i]!);
  });

  // Statements are sentences of six words or more that are not questions to the student.
  const statements = sentences.filter(s => !s.trim().endsWith('?') && s.split(/\s+/).length >= 6);
  const covered = statements.filter(s => passages.some(p => support(s, p.text) >= SENTENCE_SUPPORT)).length;
  const share = statements.length ? covered / statements.length : 0;
  const grounding: Grounding | undefined =
    verdict === 'absent'
      ? 'insufficient'
      : verdict === 'conversational'
        ? undefined
        : crossLanguage
          ? 'translated'
          : share >= 0.7 && verdict === 'sufficient'
            ? 'materials'
            : share >= 0.3 || verdict === 'partial'
              ? 'mixed'
              : 'general';
  return { text: text.trim(), citations, dropped, unsupported, grounding, supportedShare: share };
}
