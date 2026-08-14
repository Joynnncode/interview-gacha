/**
 * The collection: pet, badges, and every question as a card that fills in once
 * it has been drawn.
 *
 * Undrawn questions show their rarity and category but not their text — that is
 * the collecting motive. Nothing here shows a model answer.
 */

import { useMemo, useState } from 'react';
import { PetPanel } from '../components/PetPanel';
import { Card, CategoryChip, Chip, EmptyState, RarityChip, SectionHeading, formatDate } from '../components/ui';
import { useBadges, usePet, useQuestions } from '../hooks/useAppData';
import type { Category, Question, Rarity } from '../types';

const RARITY_ORDER: Rarity[] = ['SSR', 'SR', 'R', 'N'];

type Filter = 'all' | Category | 'answered' | 'unanswered';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'behavioral', label: 'Behavioural' },
  { id: 'tech', label: 'Tech' },
  { id: 'answered', label: 'Answered' },
  { id: 'unanswered', label: 'Still to do' },
];

export function CollectionPage() {
  const questions = useQuestions();
  const badges = useBadges();
  const pet = usePet();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (!questions) return [];
    const matches = questions.filter((question) => {
      switch (filter) {
        case 'behavioral':
        case 'tech':
          return question.category === filter;
        case 'answered':
          return (question.timesAnswered ?? 0) > 0;
        case 'unanswered':
          return (question.timesAnswered ?? 0) === 0;
        default:
          return true;
      }
    });

    // Rarest first, then by bank id so the order is stable between renders.
    return matches.sort((a, b) => {
      const rarityGap = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      return rarityGap !== 0 ? rarityGap : a.id.localeCompare(b.id);
    });
  }, [filter, questions]);

  const answeredCount = questions?.filter((q) => (q.timesAnswered ?? 0) > 0).length ?? 0;
  const earnedBadges = badges?.filter((b) => b.earnedAt) ?? [];

  return (
    <div className="space-y-6">
      <PetPanel pet={pet} />

      <Card>
        <SectionHeading hint={`${earnedBadges.length} of ${badges?.length ?? 0} earned`}>
          Badges
        </SectionHeading>
        {badges && badges.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => {
              const earned = Boolean(badge.earnedAt);
              return (
                <li
                  key={badge.id}
                  className={`flex items-start gap-3 rounded-toy p-4 ${
                    earned ? 'bg-gold/25' : 'bg-cream-deep/70'
                  }`}
                >
                  <span
                    className={`text-2xl ${earned ? '' : 'opacity-30 grayscale'}`}
                    aria-hidden="true"
                  >
                    {badge.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink">{badge.name}</span>
                    <span className="block text-xs leading-relaxed text-ink-soft">
                      {badge.description}
                    </span>
                    {earned ? (
                      <span className="mt-1 block text-xs text-ink-faint">
                        {formatDate(badge.earnedAt)}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            illustration="rosette"
            title="Badges appear here"
            body="They all come from turning up and recording, never from rating yourself highly."
          />
        )}
      </Card>

      <Card>
        <SectionHeading
          hint={`${answeredCount} of ${questions?.length ?? 0} questions answered at least once`}
        >
          Question collection
        </SectionHeading>

        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`toy-press rounded-full px-4 py-1.5 text-sm font-semibold ${
                filter === option.id
                  ? 'bg-peach text-white shadow-soft'
                  : 'bg-cream-deep text-ink-soft hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            illustration="lookingGlass"
            title="Nothing in this filter"
            body="Try a different filter, or go and pull the machine."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {filtered.map((question) => (
              <li key={question.id}>
                <QuestionTile question={question} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * One question in the collection.
 *
 * An undiscovered question shows its shape but not its text. This is a spoiler
 * decision as much as a game one: seeing the question in a list is a small
 * version of seeing the answer early.
 */
function QuestionTile({ question }: { question: Question }) {
  const answered = (question.timesAnswered ?? 0) > 0;
  const discovered = Boolean(question.discovered);
  const isSSR = question.rarity === 'SSR';

  return (
    <div
      className={`toy-press toy-press-soft h-full rounded-toy p-4 ${
        answered ? 'bg-cream-deep/60' : 'bg-cream-deep/30'
      } ${isSSR && answered ? 'ring-2 ring-gold/70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RarityChip rarity={question.rarity} />
        <CategoryChip category={question.category} />
      </div>

      {discovered ? (
        <p className={`mt-3 font-semibold leading-snug ${answered ? 'text-ink' : 'text-ink-soft'}`}>
          {question.question}
        </p>
      ) : (
        <p className="mt-3 font-semibold leading-snug text-ink-faint">
          Not drawn yet — {question.topic}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <Chip>{question.topic}</Chip>
        {answered ? (
          <span>
            {question.timesAnswered}× · last {formatDate(question.lastAnsweredAt)}
          </span>
        ) : (
          <span>Not answered yet</span>
        )}
      </div>
    </div>
  );
}
