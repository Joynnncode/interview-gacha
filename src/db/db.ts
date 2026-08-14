/**
 * IndexedDB schema, via Dexie.
 *
 * Everything in this app lives here and nowhere else. There is no backend, no
 * network call, no analytics. If you ever find yourself adding a fetch() to a
 * remote host in this project, that is a bug.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Badge, PetState, Question, Recording, Session, Settings } from '../types';

/** Singleton rows use a fixed primary key so they can be read without a query. */
export const SINGLETON_ID = 1;

export class InterviewGachaDB extends Dexie {
  /** The question bank. Keyed by the bank's own id ("B01", "T27"). */
  questions!: EntityTable<Question, 'id'>;
  /** One row per practice attempt. */
  sessions!: EntityTable<Session, 'id'>;
  /** Audio blobs, one per completed recording. */
  recordings!: EntityTable<Recording, 'id'>;
  /** Single row. */
  pet!: EntityTable<PetState, 'id'>;
  /** Badge definitions plus their earnedAt stamp. */
  badges!: EntityTable<Badge, 'id'>;
  /** Single row. */
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('interview-gacha');

    this.version(1).stores({
      // Only indexed fields are listed. Everything else is still stored.
      questions: 'id, category, topic, rarity, likelihood, discovered, lastAnsweredAt',
      sessions: '++id, questionId, startedAt, completedAt, stage, selfRating',
      recordings: '++id, sessionId, questionId, createdAt',
      pet: 'id',
      badges: 'id, earnedAt',
      settings: 'id',
    });
  }
}

export const db = new InterviewGachaDB();
