/**
 * Eye contact is information, never a score.
 *
 * The tracker is the one part of this app that could plausibly turn into a
 * punishment: it produces a number that looks like a grade, sitting next to a
 * points system. Rule 7 says the reward is for finishing a recording, full
 * stop. These tests pin that down at the database level, where it would
 * actually break, rather than trusting a comment not to be edited.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, SINGLETON_ID } from './db';
import { deleteRecordingForSession, discardRecording } from './actions';
import { loadHistoryEntries } from './history';
import { audioBlob, completeSession, gazeSummary, reloadPage, resetDatabase } from '../test/helpers';

beforeEach(resetDatabase);
afterEach(() => db.close());

describe('Eye contact and the reward system', () => {
  it('pays exactly the same points for terrible eye contact as for perfect', async () => {
    const bad = await completeSession('T01', 118, audioBlob(), 'shaky', gazeSummary());

    const badPoints = (await db.sessions.get(bad))?.pointsAwarded;
    const petAfterBad = await db.pet.get(SINGLETON_ID);

    await resetDatabase();
    const good = await completeSession(
      'T01',
      118,
      audioBlob(),
      'shaky',
      gazeSummary({ onCameraSec: 100, glanceCount: 0, longestHoldSec: 100, glances: [] }),
    );

    expect((await db.sessions.get(good))?.pointsAwarded).toBe(badPoints);
    expect((await db.pet.get(SINGLETON_ID))?.totalPoints).toBe(petAfterBad?.totalPoints);
  });

  it('pays the same again when there is no camera at all', async () => {
    const withCamera = await completeSession('T01', 118, audioBlob(), 'shaky', gazeSummary());
    const points = (await db.sessions.get(withCamera))?.pointsAwarded;

    await resetDatabase();
    const withoutCamera = await completeSession('T01', 118, audioBlob(), 'shaky');

    expect((await db.sessions.get(withoutCamera))?.gaze).toBeUndefined();
    expect((await db.sessions.get(withoutCamera))?.pointsAwarded).toBe(points);
  });
});

describe('Storing the numbers', () => {
  it('keeps the summary across a reload, and stores no video', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(), 'ok', gazeSummary());
    await reloadPage();

    const session = await db.sessions.get(sessionId);
    expect(session?.gaze?.glanceCount).toBe(24);
    expect(session?.gaze?.glances[0].direction).toBe('down');

    // The only Blob anywhere is the audio. If a video ever starts being stored,
    // this is the test that should fail.
    const recordings = await db.recordings.toArray();
    expect(recordings).toHaveLength(1);
    expect(recordings[0].mimeType.startsWith('audio/')).toBe(true);
  });

  it('survives deleting the audio, like the rating and the note do', async () => {
    // The practice happened whether or not the file is still on disk, and how
    // your eyes behaved during it is part of that practice.
    const sessionId = await completeSession('T01', 118, audioBlob(), 'ok', gazeSummary());
    await deleteRecordingForSession(sessionId);
    await reloadPage();

    const entries = await loadHistoryEntries();
    expect(entries[0].hasRecording).toBe(false);
    expect(entries[0].session.gaze?.glanceCount).toBe(24);
  });

  it('is thrown away with a discarded attempt', async () => {
    // A discarded recording leaves nothing behind, so it must not leave the
    // eye-contact numbers behind either — they would describe audio that the
    // session no longer claims to have.
    const sessionId = (await db.sessions.add({
      questionId: 'T01',
      startedAt: new Date().toISOString(),
      stage: 'drawn',
    })) as number;

    await db.sessions.update(sessionId, { stage: 'recording', gaze: gazeSummary() });
    await discardRecording(sessionId);

    const session = await db.sessions.get(sessionId);
    expect(session?.stage).toBe('drawn');
    expect(session?.gaze).toBeUndefined();
  });
});
