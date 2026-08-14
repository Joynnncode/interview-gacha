/**
 * All type definitions for Interview Gacha.
 *
 * Two things worth knowing before editing this file:
 *
 * 1. `beats`, `modelAnswer` and `coach` are spoiler fields. They live on the
 *    Question record, but nothing may render them until the session has a
 *    recording AND a self-rating. See `isAnswerUnlocked` in src/game/flow.ts —
 *    that function is the single gate.
 * 2. Recordings are stored as Blobs, never base64. Export converts on the way
 *    out only if the user asks for audio to be included.
 */

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

/** Behavioural questions are warm pink, tech questions are mint green. */
export type Category = 'behavioral' | 'tech';

/** How likely this question is in a real interview. Drives draw weight. */
export type Likelihood = 'high' | 'medium' | 'low';

/** Gacha tier. SSR is the highest-leverage material and doubles points. */
export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export interface Question {
  /** Stable human-readable id from the bank, e.g. "B01", "T27". */
  id: string;
  category: Category;
  /** Grouping shown in the collection, e.g. "Behavioural STAR", "SQL". */
  topic: string;
  question: string;
  likelihood: Likelihood;
  rarity: Rarity;
  /** How long the spoken answer should be. Shown as a soft target, never enforced. */
  timeTargetSec: number;

  // --- Spoiler fields. Never render before the answer is unlocked. ---
  /** The structure to memorise. This is the thing being learned, not a script. */
  beats: string[];
  /** Reference answer. */
  modelAnswer: string;
  /** The trap in the question, and what the interviewer is really testing. */
  coach: string;
  // ------------------------------------------------------------------

  /** true = must be rewritten for each target company before it is worth practising. */
  companySpecific: boolean;
  /** true = still has <placeholders> that need real details filling in. */
  needsInput: boolean;
  tags: string[];

  /** Set by the app, not the bank: true once this question has been drawn at least once. */
  discovered?: boolean;
  /** Set by the app: how many completed sessions this question has. */
  timesAnswered?: number;
  /** Set by the app: ISO date of the most recent completed session. */
  lastAnsweredAt?: string;
}

/** Shape of public/questions.seed.json and public/questions.example.json. */
export interface QuestionBankFile {
  meta: {
    owner?: string;
    version?: string;
    generatedAt?: string;
    note?: string;
    schema?: Record<string, string>;
  };
  questions: Question[];
}

// ---------------------------------------------------------------------------
// The answering flow
// ---------------------------------------------------------------------------

/**
 * The four-stage answering flow, modelled as an explicit state machine rather
 * than a pile of booleans. Transitions live in src/game/flow.ts.
 *
 *   drawn      question visible, nothing else
 *   recording  microphone live
 *   rating     recording exists, user picks a self-rating
 *   revealed   beats / modelAnswer / coach unlocked, points awarded
 *
 * The order is deliberate and must not be reshuffled to make the flow feel
 * smoother: rating happens BEFORE the answer is revealed, so the rating is
 * honest rather than anchored to the reference answer.
 */
export type FlowStage = 'drawn' | 'recording' | 'rating' | 'revealed';

/**
 * How the attempt felt, chosen by the user before seeing the reference answer.
 * A low rating never costs points and never triggers negative copy — it only
 * schedules the question to come round again sooner.
 */
export type SelfRating = 'shaky' | 'ok' | 'solid';

/** One practice attempt at one question. */
export interface Session {
  /** Dexie auto-increment primary key. */
  id?: number;
  questionId: string;
  /** ISO timestamp of when the question was drawn. */
  startedAt: string;
  /** ISO timestamp of when the flow reached `revealed`. Absent if abandoned. */
  completedAt?: string;
  stage: FlowStage;
  /** Length of the recording in seconds. */
  durationSec?: number;
  selfRating?: SelfRating;
  /** Points awarded for completing this session. Never negative. */
  pointsAwarded?: number;
  /** Free-text note the user can add after the reveal. */
  note?: string;
}

/** An audio recording, stored as a Blob. Kept in its own table so sessions stay light. */
export interface Recording {
  id?: number;
  sessionId: number;
  questionId: string;
  /** The audio itself. Blob, never a base64 string. */
  blob: Blob;
  mimeType: string;
  durationSec: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * Pet growth stages. The pet droops when unvisited but never dies and never
 * disappears — `stage` only ever moves forward, `mood` is what reacts.
 */
export type PetStage = 'egg' | 'hatchling' | 'fledgling' | 'companion' | 'sage';

/** How the pet looks right now. Cosmetic only; never used to guilt the user. */
export type PetMood = 'sleepy' | 'content' | 'bright' | 'delighted';

export interface PetState {
  /** Singleton row. Always 1. */
  id?: number;
  name: string;
  stage: PetStage;
  mood: PetMood;
  /** Total points earned, all time. Only ever increases. */
  totalPoints: number;
  /** Consecutive days with at least one completed session. */
  streakDays: number;
  /** Longest streak ever reached. Kept so a broken streak still leaves a record. */
  bestStreakDays: number;
  /** ISO date (YYYY-MM-DD) of the last day with a completed session. */
  lastActiveDate?: string;
}

export interface Badge {
  /** Stable id from the badge config, e.g. "first-draw". */
  id: string;
  name: string;
  description: string;
  /** Emoji shown on the badge face. */
  icon: string;
  /** ISO timestamp. Absent means not yet earned. */
  earnedAt?: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  /** Singleton row. Always 1. */
  id?: number;
  /** Honours prefers-reduced-motion by default; this is the manual override. */
  reducedMotion: boolean | null;
  /** Which categories are eligible for the draw. Both on by default. */
  drawCategories: Category[];
  /** true = questions with needsInput are excluded from the draw. */
  skipNeedsInput: boolean;
  /** Whether the seed bank has been imported yet. */
  bankImportedAt?: string;
  /** Which file the bank came from, so the UI can say so honestly. */
  bankSource?: 'seed' | 'example' | 'import';
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/**
 * One-click export of everything. Audio is optional because including it makes
 * the file very large; the JSON is always complete without it.
 */
export interface ExportBundle {
  format: 'interview-gacha-export';
  version: 1;
  exportedAt: string;
  questions: Question[];
  sessions: Session[];
  pet: PetState | null;
  badges: Badge[];
  settings: Settings | null;
  /** Present only when the user chose to include audio. */
  recordings?: ExportedRecording[];
}

/** A recording inside an export bundle. Base64 here only because JSON cannot hold a Blob. */
export interface ExportedRecording {
  sessionId: number;
  questionId: string;
  mimeType: string;
  durationSec: number;
  createdAt: string;
  /** base64-encoded audio. Converted straight back to a Blob on import. */
  base64: string;
}
