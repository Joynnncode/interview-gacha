/**
 * Draw logic.
 *
 * The draw is a weighted random pick. Weight is built from four things:
 * how likely the question is in a real interview, whether I have ever seen it,
 * how I rated it last time, and how recently I answered it. Rarity barely
 * moves the needle on purpose — see DRAW_CONFIG.rarityWeight.
 *
 * A pity counter guarantees an SSR at least every DRAW_CONFIG.ssrPityThreshold
 * draws, so the highest-leverage questions cannot go missing for long.
 */

import { DRAW_CONFIG } from './config';
import type { Question, SelfRating, Session, Settings } from '../types';
import { db } from '../db/db';
import { eligibleCategories } from '../db/bank';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WeightedQuestion {
  question: Question;
  weight: number;
}

export interface DrawContext {
  /** Most recent self-rating per question id, for the rating multiplier. */
  lastRatingByQuestion: Map<string, SelfRating>;
  /** Draws since the last SSR was drawn. Feeds the pity counter. */
  drawsSinceSSR: number;
  /** Reference point for the recency window. Injected so this stays testable. */
  now: Date;
}

/** Questions allowed into the pool at all, before weighting. */
export function filterEligible(questions: Question[], settings: Settings | undefined): Question[] {
  const categories = eligibleCategories(settings);
  const skipNeedsInput = settings?.skipNeedsInput ?? false;

  return questions.filter((q) => {
    if (!categories.includes(q.category)) return false;
    if (skipNeedsInput && q.needsInput) return false;
    return true;
  });
}

/** The weight one question carries in the draw. Always > 0 so nothing is unreachable. */
export function weightFor(question: Question, context: DrawContext): number {
  let weight = DRAW_CONFIG.likelihoodWeight[question.likelihood] ?? 1;
  weight *= DRAW_CONFIG.rarityWeight[question.rarity] ?? 1;

  if (!question.discovered) {
    weight *= DRAW_CONFIG.undiscoveredMultiplier;
  }

  const lastRating = context.lastRatingByQuestion.get(question.id);
  if (lastRating) {
    weight *= DRAW_CONFIG.ratingMultiplier[lastRating];
  }

  if (question.lastAnsweredAt) {
    const daysAgo = (context.now.getTime() - new Date(question.lastAnsweredAt).getTime()) / MS_PER_DAY;
    if (daysAgo < DRAW_CONFIG.recencyWindowDays) {
      weight *= DRAW_CONFIG.recencyMultiplier;
    }
  }

  // Never return zero: a question with every penalty applied should still be
  // reachable, otherwise the collection can never be completed.
  return Math.max(weight, 0.01);
}

export function buildWeights(questions: Question[], context: DrawContext): WeightedQuestion[] {
  return questions.map((question) => ({ question, weight: weightFor(question, context) }));
}

/**
 * Pick one entry by weight. `random` is injectable so the draw can be tested
 * deterministically.
 */
export function pickWeighted(
  weighted: WeightedQuestion[],
  random: () => number = Math.random,
): Question | null {
  if (weighted.length === 0) return null;

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return weighted[0].question;

  let threshold = random() * total;
  for (const entry of weighted) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.question;
  }
  // Floating point can leave a sliver at the end.
  return weighted[weighted.length - 1].question;
}

export interface DrawResult {
  question: Question;
  /** true when the pity counter forced this draw rather than chance producing it. */
  viaPity: boolean;
}

/** Pure draw, given an already-filtered pool. Exported so it can be tested directly. */
export function drawFrom(
  pool: Question[],
  context: DrawContext,
  random: () => number = Math.random,
): DrawResult | null {
  if (pool.length === 0) return null;

  // Pity: once the counter is up, restrict the pool to SSR if any is available.
  if (context.drawsSinceSSR >= DRAW_CONFIG.ssrPityThreshold) {
    const ssrPool = pool.filter((q) => q.rarity === 'SSR');
    if (ssrPool.length > 0) {
      const question = pickWeighted(buildWeights(ssrPool, context), random);
      if (question) return { question, viaPity: true };
    }
  }

  const question = pickWeighted(buildWeights(pool, context), random);
  return question ? { question, viaPity: false } : null;
}

/** Read everything the weighting needs out of the database. */
export async function loadDrawContext(now: Date = new Date()): Promise<DrawContext> {
  const [sessions, questions] = await Promise.all([
    db.sessions.orderBy('startedAt').toArray(),
    db.questions.toArray(),
  ]);

  const rarityById = new Map(questions.map((q) => [q.id, q.rarity]));

  const lastRatingByQuestion = new Map<string, SelfRating>();
  for (const session of sessions) {
    if (session.selfRating) {
      // Sessions are in ascending date order, so later writes win.
      lastRatingByQuestion.set(session.questionId, session.selfRating);
    }
  }

  return {
    lastRatingByQuestion,
    drawsSinceSSR: countDrawsSinceSSR(sessions, rarityById),
    now,
  };
}

/**
 * How many draws have happened since the last SSR came up. Every session row is
 * one draw, so this needs no separate counter to drift out of sync.
 */
export function countDrawsSinceSSR(
  sessionsAscending: Session[],
  rarityById: Map<string, string>,
): number {
  let count = 0;
  for (let i = sessionsAscending.length - 1; i >= 0; i -= 1) {
    if (rarityById.get(sessionsAscending[i].questionId) === 'SSR') break;
    count += 1;
  }
  return count;
}

/**
 * Draw a question and open a session for it. The session is created at stage
 * 'drawn', which is what makes the draw show up in the pity counter even if the
 * attempt is later abandoned.
 */
export async function drawAndOpenSession(
  now: Date = new Date(),
): Promise<{ question: Question; sessionId: number; viaPity: boolean } | null> {
  const [allQuestions, settings] = await Promise.all([
    db.questions.toArray(),
    db.settings.get(1),
  ]);

  const pool = filterEligible(allQuestions, settings);
  const context = await loadDrawContext(now);
  const result = drawFrom(pool, context);
  if (!result) return null;

  const sessionId = await db.sessions.add({
    questionId: result.question.id,
    startedAt: now.toISOString(),
    stage: 'drawn',
  });

  // Mark it discovered so the collection fills in even if the attempt is abandoned.
  if (!result.question.discovered) {
    await db.questions.update(result.question.id, { discovered: true });
  }

  return { question: result.question, sessionId: sessionId as number, viaPity: result.viaPity };
}
