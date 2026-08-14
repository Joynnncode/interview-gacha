/**
 * Loading the question bank.
 *
 * On first run the app imports questions.seed.json — my real bank, which is
 * gitignored. On a fresh clone that file does not exist, so we fall back to
 * questions.example.json, which is fictional and committed. Neither file is
 * fetched from anywhere but this app's own origin.
 */

import { db, SINGLETON_ID } from './db';
import type { Category, Question, QuestionBankFile, Settings } from '../types';

const SEED_URL = '/questions.seed.json';
const EXAMPLE_URL = '/questions.example.json';

export const DEFAULT_SETTINGS: Settings = {
  id: SINGLETON_ID,
  reducedMotion: null,
  drawCategories: ['behavioral', 'tech'],
  skipNeedsInput: false,
};

/**
 * Fetch and parse a bank file from the app's own public/ directory.
 * Returns null if the file is absent or not a valid bank, so the caller can
 * fall through to the next candidate.
 */
async function tryLoadBankFile(url: string): Promise<QuestionBankFile | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    // A missing file under Vite dev server can come back as index.html with a
    // 200, so parsing has to be the real check rather than the status code.
    const data: unknown = await response.json();
    if (!isQuestionBankFile(data)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Structural check, so a malformed file fails loudly here rather than deep in the UI. */
function isQuestionBankFile(value: unknown): value is QuestionBankFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<QuestionBankFile>;
  if (!Array.isArray(candidate.questions) || candidate.questions.length === 0) return false;
  return candidate.questions.every(
    (q) =>
      typeof q?.id === 'string' &&
      typeof q?.question === 'string' &&
      (q?.category === 'behavioral' || q?.category === 'tech'),
  );
}

/** Fill in the app-managed fields a freshly imported question does not have. */
function withAppDefaults(question: Question): Question {
  return {
    ...question,
    // Normalise the optional bank fields so the rest of the app can rely on them.
    tags: question.tags ?? [],
    beats: question.beats ?? [],
    timeTargetSec: question.timeTargetSec ?? 60,
    discovered: false,
    timesAnswered: 0,
  };
}

export interface BankImportResult {
  source: 'seed' | 'example';
  imported: number;
  /** Questions already in the database that the file did not contain. */
  kept: number;
}

/**
 * Import the bank on first run. Idempotent: if questions already exist this
 * does nothing, so a reload never clobbers progress.
 */
export async function ensureBankImported(): Promise<BankImportResult | null> {
  const existing = await db.questions.count();
  const settings = await db.settings.get(SINGLETON_ID);

  if (!settings) {
    await db.settings.put(DEFAULT_SETTINGS);
  }

  if (existing > 0) return null;

  const seed = await tryLoadBankFile(SEED_URL);
  const bank = seed ?? (await tryLoadBankFile(EXAMPLE_URL));

  if (!bank) {
    throw new Error(
      'No question bank found. Add public/questions.seed.json, or keep public/questions.example.json in place.',
    );
  }

  const source: 'seed' | 'example' = seed ? 'seed' : 'example';
  const questions = bank.questions.map(withAppDefaults);

  await db.questions.bulkPut(questions);
  await db.settings.put({
    ...(settings ?? DEFAULT_SETTINGS),
    bankImportedAt: new Date().toISOString(),
    bankSource: source,
  });

  return { source, imported: questions.length, kept: 0 };
}

/**
 * Re-read the bank file and merge it over what is already stored, preserving
 * per-question progress. Used by the question management screen after I edit
 * the seed file by hand.
 */
export async function refreshBankFromFile(): Promise<BankImportResult> {
  const seed = await tryLoadBankFile(SEED_URL);
  const bank = seed ?? (await tryLoadBankFile(EXAMPLE_URL));
  if (!bank) throw new Error('No question bank file available to refresh from.');

  const source: 'seed' | 'example' = seed ? 'seed' : 'example';
  const stored = await db.questions.toArray();
  const storedById = new Map(stored.map((q) => [q.id, q]));
  const incomingIds = new Set(bank.questions.map((q) => q.id));

  const merged = bank.questions.map((incoming) => {
    const previous = storedById.get(incoming.id);
    return {
      ...withAppDefaults(incoming),
      // Progress belongs to the app, not to the file.
      discovered: previous?.discovered ?? false,
      timesAnswered: previous?.timesAnswered ?? 0,
      lastAnsweredAt: previous?.lastAnsweredAt,
    };
  });

  await db.questions.bulkPut(merged);

  const settings = (await db.settings.get(SINGLETON_ID)) ?? DEFAULT_SETTINGS;
  await db.settings.put({ ...settings, bankSource: source });

  return {
    source,
    imported: merged.length,
    kept: stored.filter((q) => !incomingIds.has(q.id)).length,
  };
}

/** Categories currently eligible for the draw, defaulting to both. */
export function eligibleCategories(settings: Settings | undefined): Category[] {
  const categories = settings?.drawCategories;
  if (!categories || categories.length === 0) return ['behavioral', 'tech'];
  return categories;
}
