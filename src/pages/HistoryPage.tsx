/**
 * History and a few honest numbers.
 *
 * The stats deliberately count sessions and minutes spoken, not scores. There is
 * no line chart of "quality over time" because self-ratings are not a
 * measurement, and plotting them would turn a warm-up into an assessment.
 */

import { useMemo } from 'react';
import { Card, EmptyState, SectionHeading, formatDuration } from '../components/ui';
import { HistoryRow } from '../components/HistoryRow';
import { PetSpinner } from '../components/PetSpinner';
import { RATING_COPY } from '../game/flow';
import { useHistoryEntries } from '../hooks/useAppData';
import type { SelfRating, Session } from '../types';

export function HistoryPage() {
  const entries = useHistoryEntries();

  const sessions = useMemo(() => (entries ?? []).map((entry) => entry.session), [entries]);
  const stats = useMemo(() => summarise(sessions), [sessions]);

  if (!entries) {
    return (
      <div className="py-10">
        <PetSpinner label="Fetching your history…" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        illustration="microphone"
        title="Nothing recorded yet"
        body="Once you have answered a question out loud, it will show up here with the recording attached."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading hint="Everything here counts practice done, not practice scored.">
          Your numbers
        </SectionHeading>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Sessions recorded" value={String(stats.total)} />
          <Stat label="Time spoken" value={formatDuration(stats.totalSeconds)} />
          <Stat label="Different questions" value={String(stats.uniqueQuestions)} />
          <Stat label="Points banked" value={String(stats.points)} />
        </dl>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(['shaky', 'ok', 'solid'] as SelfRating[]).map((rating) => (
            <div key={rating} className="rounded-toy bg-cream-deep/70 p-4">
              <p className="text-sm text-ink-soft">{RATING_COPY[rating].label}</p>
              <p className="mt-1 text-2xl font-bold text-ink">{stats.byRating[rating]}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading hint="Newest first. Play a recording back, edit a note, or delete audio you no longer need.">
          Session history
        </SectionHeading>
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.session.id}>
              <HistoryRow entry={entry} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-toy bg-cream-deep/70 p-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-ink">{value}</dd>
    </div>
  );
}

interface Summary {
  total: number;
  totalSeconds: number;
  uniqueQuestions: number;
  points: number;
  byRating: Record<SelfRating, number>;
}

function summarise(sessions: Session[]): Summary {
  const byRating: Record<SelfRating, number> = { shaky: 0, ok: 0, solid: 0 };
  let totalSeconds = 0;
  let points = 0;

  for (const session of sessions) {
    totalSeconds += session.durationSec ?? 0;
    points += session.pointsAwarded ?? 0;
    if (session.selfRating) byRating[session.selfRating] += 1;
  }

  return {
    total: sessions.length,
    totalSeconds,
    uniqueQuestions: new Set(sessions.map((s) => s.questionId)).size,
    points,
    byRating,
  };
}
