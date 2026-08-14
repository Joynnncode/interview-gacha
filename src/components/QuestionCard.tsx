/**
 * The question itself.
 *
 * Takes a SafeQuestion — the Question type with `beats`, `modelAnswer` and
 * `coach` removed — so it is impossible for this component to leak the answer
 * even by accident. That is a compile-time guarantee, not a convention.
 *
 * Question text is deliberately large: it gets read standing up, out loud.
 */

import type { SafeQuestion } from '../game/flow';
import { CategoryChip, Chip, RarityChip } from './ui';
import { formatDuration } from './ui';

export interface QuestionCardProps {
  question: SafeQuestion;
  /** Shown when the pity counter forced this draw. */
  viaPity?: boolean;
}

export function QuestionCard({ question, viaPity }: QuestionCardProps) {
  const isSSR = question.rarity === 'SSR';

  return (
    <article
      className={`relative overflow-hidden rounded-toy-lg bg-card p-8 shadow-lift ${
        isSSR ? 'ring-2 ring-gold' : 'ring-1 ring-ink/5'
      }`}
    >
      {/* SSR gets a rainbow band across the top. Everything else gets its category colour. */}
      <div
        className={`absolute inset-x-0 top-0 h-2 ${
          isSSR
            ? 'ssr-rainbow'
            : question.category === 'behavioral'
              ? 'bg-behavioural'
              : 'bg-tech'
        }`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <RarityChip rarity={question.rarity} />
        <CategoryChip category={question.category} />
        <Chip>{question.topic}</Chip>
        {viaPity ? <Chip>Guaranteed pull ✨</Chip> : null}
      </div>

      {/* The thing being read out loud. Big, friendly, high line-height. */}
      <h1 className="mt-6 text-3xl font-bold leading-snug tracking-tight text-ink md:text-4xl">
        {question.question}
      </h1>

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
        <div className="flex gap-2">
          <dt className="font-semibold text-ink">Aim for</dt>
          <dd>{formatDuration(question.timeTargetSec)} spoken</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-ink">Answered</dt>
          <dd>
            {question.timesAnswered
              ? `${question.timesAnswered} ${question.timesAnswered === 1 ? 'time' : 'times'} before`
              : 'first time'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-ink">Bank id</dt>
          <dd>{question.id}</dd>
        </div>
      </dl>

      {/* Honest flags about the question, not about the person answering it. */}
      {question.needsInput || question.companySpecific ? (
        <div className="mt-6 flex flex-wrap gap-2 rounded-toy bg-cream-deep/80 p-4 text-sm text-ink-soft">
          {question.companySpecific ? (
            <p className="w-full">
              <span className="font-semibold text-ink">Company-specific.</span> Answer it for a real
              target company rather than in the abstract.
            </p>
          ) : null}
          {question.needsInput ? (
            <p className="w-full">
              <span className="font-semibold text-ink">Has placeholders.</span> The reference answer
              still has details to fill in — say your own version out loud.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
