/**
 * Managing a past session from History: deleting the audio, and editing the note.
 *
 * The delicate one is deleting audio. It has to free the disk space and nothing
 * else — the session, the points, the rating, the note, the statistics and the
 * unlocked reference answer all have to survive, because the practice happened
 * whether or not the file is still there.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, SINGLETON_ID } from './db';
import { deleteRecordingForSession, saveNote } from './actions';
import { loadHistoryEntries, loadRecordingForSession } from './history';
import { isAnswerUnlocked } from '../game/flow';
import { audioBlob, completeSession, reloadPage, resetDatabase } from '../test/helpers';

beforeEach(resetDatabase);
afterEach(() => db.close());

describe('Deleting the audio for one session', () => {
  it('removes the recording but keeps the session, the points and the note', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob());
    await saveNote(sessionId, 'Started with the number this time.');

    const pointsBefore = (await db.sessions.get(sessionId))?.pointsAwarded;
    expect(pointsBefore).toBeGreaterThan(0);

    expect(await deleteRecordingForSession(sessionId)).toBe(1);

    await reloadPage();

    // The audio is gone.
    expect(await loadRecordingForSession(sessionId)).toBeUndefined();
    expect(await db.recordings.count()).toBe(0);

    // Everything else is not.
    const entries = await loadHistoryEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].hasRecording).toBe(false);

    const after = entries[0].session;
    expect(after.id).toBe(sessionId);
    expect(after.pointsAwarded).toBe(pointsBefore);
    expect(after.selfRating).toBe('shaky');
    expect(after.note).toBe('Started with the number this time.');
    // "Time spoken" is computed from the session, so the practice still counts.
    expect(after.durationSec).toBe(118);
  });

  it('never retracts points, and never re-locks the reference answer', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob());
    const petPointsBefore = (await db.pet.get(SINGLETON_ID))?.totalPoints ?? 0;
    expect(petPointsBefore).toBeGreaterThan(0);

    await deleteRecordingForSession(sessionId);
    await reloadPage();

    // Rule 7: nothing in this app subtracts points.
    expect((await db.pet.get(SINGLETON_ID))?.totalPoints).toBe(petPointsBefore);

    // The answer was earned by recording it, which happened. Freeing disk space
    // must not take the reference answer back away.
    expect(isAnswerUnlocked(await db.sessions.get(sessionId))).toBe(true);

    // And the question keeps its answered count.
    expect((await db.questions.get('T01'))?.timesAnswered).toBe(1);
  });

  it('only deletes the audio it was asked to delete', async () => {
    const keep = await completeSession('T01', 100, audioBlob(1024));
    const remove = await completeSession('T01', 110, audioBlob(2048));

    await deleteRecordingForSession(remove);
    await reloadPage();

    const byId = new Map((await loadHistoryEntries()).map((entry) => [entry.session.id, entry]));

    expect(byId.get(keep)?.hasRecording).toBe(true);
    expect(byId.get(remove)?.hasRecording).toBe(false);
    expect((await loadRecordingForSession(keep))?.blob.size).toBe(1024);
    expect(await db.recordings.count()).toBe(1);
  });

  it('is harmless when there is no audio to delete', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(512));
    await deleteRecordingForSession(sessionId);

    // Deleting twice must not throw, and must not report a phantom deletion.
    expect(await deleteRecordingForSession(sessionId)).toBe(0);
    expect((await loadHistoryEntries())[0].hasRecording).toBe(false);
  });
});

describe('Editing the note on a past session', () => {
  it('saves, rewrites and clears a note, surviving a reload each time', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(512));

    await saveNote(sessionId, 'First thoughts, written in a hurry.');
    await reloadPage();
    expect((await db.sessions.get(sessionId))?.note).toBe('First thoughts, written in a hurry.');

    // Rewriting it a week later is the point of making it editable.
    await saveNote(sessionId, 'Actually the problem was the opening sentence.');
    await reloadPage();
    expect((await db.sessions.get(sessionId))?.note).toBe(
      'Actually the problem was the opening sentence.',
    );

    // Clearing it removes the field rather than storing an empty string, so
    // `session.note` stays a reliable "is there a note" check.
    await saveNote(sessionId, '   ');
    await reloadPage();
    expect((await db.sessions.get(sessionId))?.note).toBeUndefined();
  });

  it('trims surrounding whitespace', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(512));
    await saveNote(sessionId, '  slow down on the third beat  ');
    expect((await db.sessions.get(sessionId))?.note).toBe('slow down on the third beat');
  });

  it('keeps the note and the audio independent of each other', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(4096));

    await saveNote(sessionId, 'Keep this note.');
    await deleteRecordingForSession(sessionId);
    await reloadPage();

    // Deleting audio leaves the note alone...
    expect((await db.sessions.get(sessionId))?.note).toBe('Keep this note.');

    // ...and a note can still be added to a session with no audio left.
    await saveNote(sessionId, 'Edited after the audio was gone.');
    await reloadPage();
    const entry = (await loadHistoryEntries())[0];
    expect(entry.session.note).toBe('Edited after the audio was gone.');
    expect(entry.hasRecording).toBe(false);
  });

  it('leaves other sessions untouched', async () => {
    const first = await completeSession('T01', 100, audioBlob(512));
    const second = await completeSession('T01', 110, audioBlob(512));

    await saveNote(first, 'Only on the first one.');
    await reloadPage();

    expect((await db.sessions.get(first))?.note).toBe('Only on the first one.');
    expect((await db.sessions.get(second))?.note).toBeUndefined();
  });
});
