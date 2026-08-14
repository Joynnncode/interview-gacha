/**
 * One-click export and import of everything.
 *
 * This is the escape hatch: because there is no backend, a browser clearing its
 * IndexedDB is the only way to lose data, and this file is the answer to that.
 * It must keep working — treat it as a feature, not a utility.
 *
 * Recordings are stored as Blobs in the database. JSON cannot hold a Blob, so
 * export base64-encodes them on the way out and import decodes straight back to
 * a Blob on the way in. Nothing in the running app ever holds audio as base64.
 */

import { db, SINGLETON_ID } from './db';
import { INITIAL_PET, initialBadges } from '../game/rewards';
import { DEFAULT_SETTINGS } from './bank';
import type { ExportBundle, ExportedRecording } from '../types';

const EXPORT_FORMAT = 'interview-gacha-export' as const;
const EXPORT_VERSION = 1 as const;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked so a long recording cannot blow the argument limit on String.fromCharCode.
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export interface ExportOptions {
  /** Audio makes the file large, so it is opt-in. The JSON is complete without it. */
  includeAudio: boolean;
}

export async function buildExportBundle(options: ExportOptions): Promise<ExportBundle> {
  const [questions, sessions, pet, badges, settings] = await Promise.all([
    db.questions.toArray(),
    db.sessions.toArray(),
    db.pet.get(SINGLETON_ID),
    db.badges.toArray(),
    db.settings.get(SINGLETON_ID),
  ]);

  const bundle: ExportBundle = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    questions,
    sessions,
    pet: pet ?? null,
    badges,
    settings: settings ?? null,
  };

  if (options.includeAudio) {
    const recordings = await db.recordings.toArray();
    const exported: ExportedRecording[] = [];
    for (const recording of recordings) {
      exported.push({
        sessionId: recording.sessionId,
        questionId: recording.questionId,
        mimeType: recording.mimeType,
        durationSec: recording.durationSec,
        createdAt: recording.createdAt,
        base64: await blobToBase64(recording.blob),
      });
    }
    bundle.recordings = exported;
  }

  return bundle;
}

/** Filename with an English-convention date, e.g. interview-gacha-14-Aug-2026.json */
export function exportFilename(now: Date = new Date()): string {
  const day = String(now.getDate()).padStart(2, '0');
  const month = now.toLocaleString('en-GB', { month: 'short' });
  return `interview-gacha-${day}-${month}-${now.getFullYear()}.json`;
}

/** Build the bundle and hand it to the browser as a download. */
export async function downloadExport(options: ExportOptions): Promise<void> {
  const bundle = await buildExportBundle(options);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exportFilename();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportResult {
  questions: number;
  sessions: number;
  recordings: number;
  badges: number;
}

function isExportBundle(value: unknown): value is ExportBundle {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ExportBundle>;
  return (
    candidate.format === EXPORT_FORMAT &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.sessions)
  );
}

/**
 * Replace everything with the contents of an export file.
 *
 * This is destructive by design — it is a restore, not a merge, because merging
 * two divergent histories of the same single-user game would produce nonsense.
 * The caller is responsible for confirming with the user first.
 */
export async function importBundle(json: string): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(json);
  if (!isExportBundle(parsed)) {
    throw new Error('That file is not an Interview Gacha export.');
  }

  const bundle = parsed;

  await db.transaction(
    'rw',
    [db.questions, db.sessions, db.recordings, db.pet, db.badges, db.settings],
    async () => {
      await Promise.all([
        db.questions.clear(),
        db.sessions.clear(),
        db.recordings.clear(),
        db.pet.clear(),
        db.badges.clear(),
        db.settings.clear(),
      ]);

      await db.questions.bulkPut(bundle.questions);
      await db.sessions.bulkPut(bundle.sessions);
      await db.pet.put(bundle.pet ?? INITIAL_PET);
      await db.badges.bulkPut(bundle.badges?.length ? bundle.badges : initialBadges());
      await db.settings.put(bundle.settings ?? DEFAULT_SETTINGS);

      for (const recording of bundle.recordings ?? []) {
        await db.recordings.add({
          sessionId: recording.sessionId,
          questionId: recording.questionId,
          blob: base64ToBlob(recording.base64, recording.mimeType),
          mimeType: recording.mimeType,
          durationSec: recording.durationSec,
          createdAt: recording.createdAt,
        });
      }
    },
  );

  return {
    questions: bundle.questions.length,
    sessions: bundle.sessions.length,
    recordings: bundle.recordings?.length ?? 0,
    badges: bundle.badges?.length ?? 0,
  };
}
