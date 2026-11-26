import { useState } from 'react';
import { LanguagesIcon } from 'lucide-react';
import { FIRST_LANGUAGES, type GlossaryView } from '@shared/contracts/language';
import type { Question } from '@shared/domain/types';

import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/data';
import { GlossaryTerm, useFirstLanguage } from '@/features/language/Glossary';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every piece of text the student sees in a question, where its terms can appear. */
const questionText = (q: Question) =>
  [q.prompt, q.template, ...(q.options ?? []), ...(q.sequence ?? []), ...(q.pairs ?? []).flatMap(p => Object.values(p))]
    .filter((t): t is string => typeof t === 'string')
    .join('\n');

/**
 * The glossary terms that appear in a question. Opening them before the answer is checked is
 * language support, recorded by the server, and the answer then counts as supported.
 */
export function QuestionTerms({
  courseId,
  question,
  used,
  checked,
  disabled,
  onOpen,
}: {
  courseId: string;
  question: Question;
  used: boolean;
  checked: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const language = useFirstLanguage();
  const view = useApi<GlossaryView>(language ? `/v1/courses/${courseId}/glossary?language=${language}` : null);
  const [open, setOpen] = useState(false);
  if (!language || !view.data) return null;
  const text = questionText(question);
  const terms = view.data.entries.filter(
    e => e.gloss && e.term.length > 2 && new RegExp(`(^|\\W)${escape(e.term)}(\\W|$)`, 'i').test(text),
  );
  if (!terms.length) return null;
  const name = FIRST_LANGUAGES[language];
  if (!open && !used)
    return (
      <Button
        variant="ghost"
        className="self-start"
        disabled={disabled}
        onClick={() => {
          if (!checked) onOpen();
          setOpen(true);
        }}
      >
        <LanguagesIcon />
        Terms in {name}
      </Button>
    );
  return (
    <div className="flex flex-col gap-snug rounded-md border px-3 py-2.5">
      <p className="text-muted-foreground text-sm">
        {checked && !used
          ? `Terms in ${name}.`
          : `Terms in ${name}. This answer is recorded with language support. If it is right, Rawi will offer a check on this section without support later.`}
      </p>
      <ul className="flex flex-col gap-snug">
        {terms.map(e => (
          <li key={e.factId}>
            <GlossaryTerm entry={e} language={language} />
          </li>
        ))}
      </ul>
    </div>
  );
}
