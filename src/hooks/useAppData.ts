/**
 * Reactive reads from IndexedDB, via useLiveQuery. No hand-rolled subscriptions.
 */

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SINGLETON_ID } from '../db/db';
import { loadHistoryEntries, type HistoryEntry } from '../db/history';
import { INITIAL_PET } from '../game/rewards';
import { DEFAULT_SETTINGS } from '../db/bank';
import type { Badge, PetState, Question, Session, Settings } from '../types';

export function useQuestions(): Question[] | undefined {
  return useLiveQuery(() => db.questions.toArray(), []);
}

export function useQuestion(id: string | undefined): Question | undefined {
  return useLiveQuery(() => (id ? db.questions.get(id) : undefined), [id]);
}

export function useSession(id: number | undefined): Session | undefined {
  return useLiveQuery(() => (typeof id === 'number' ? db.sessions.get(id) : undefined), [id]);
}

export function usePet(): PetState {
  return useLiveQuery(() => db.pet.get(SINGLETON_ID), [], undefined) ?? INITIAL_PET;
}

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get(SINGLETON_ID), [], undefined) ?? DEFAULT_SETTINGS;
}

export function useBadges(): Badge[] | undefined {
  return useLiveQuery(() => db.badges.toArray(), []);
}

/** Completed sessions, newest first. */
export function useCompletedSessions(limit?: number): Session[] | undefined {
  return useLiveQuery(async () => {
    const sessions = await db.sessions.where('stage').equals('revealed').toArray();
    sessions.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return typeof limit === 'number' ? sessions.slice(0, limit) : sessions;
  }, [limit]);
}

/** Completed sessions joined to their question and to whether audio exists. */
export function useHistoryEntries(limit?: number): HistoryEntry[] | undefined {
  return useLiveQuery(() => loadHistoryEntries(limit), [limit]);
}

/**
 * The audio for one session, as an object URL.
 *
 * The URL is created in an effect rather than during render, so each one is
 * revoked when the recording changes or the component unmounts. Creating it
 * inline would leak a URL on every render.
 *
 * The effect depends on the recording's numeric id, NOT on the record object.
 * useLiveQuery hands back a fresh object identity every time it re-runs — which
 * it does on any write to the recordings table — so depending on the object
 * revoked the URL that a playing <audio> element was still using, before the
 * replacement had been committed. Keying on the id means an unchanged recording
 * keeps the same URL for as long as the element needs it.
 */
export function useRecordingUrl(sessionId: number | undefined): string | undefined {
  const recordingId = useLiveQuery(async () => {
    if (typeof sessionId !== 'number') return undefined;
    const recording = await db.recordings.where('sessionId').equals(sessionId).first();
    return recording?.id;
  }, [sessionId]);

  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof recordingId !== 'number') {
      setUrl(undefined);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    void (async () => {
      const recording = await db.recordings.get(recordingId);
      if (cancelled || !recording) return;
      objectUrl = URL.createObjectURL(recording.blob);
      setUrl(objectUrl);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingId]);

  return url;
}
