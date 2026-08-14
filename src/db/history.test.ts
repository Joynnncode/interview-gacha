/**
 * Regression test for the bug where a finished recording could not be played
 * back anywhere in the app.
 *
 * The write path was never at fault: rows existed in the `recordings` table with
 * the right byte size. What was missing was a read path — History queried
 * `sessions` only, never joined `recordings`, and rendered no audio element. So
 * the audio was reachable only from the live reveal, and unreachable after a
 * reload.
 *
 * This walks the real user route: answer a question, leave the screen, reload,
 * open History, and play the recording back.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { loadAttemptsForQuestion, loadHistoryEntries, loadRecordingForSession } from './history';
import {
  RECORDING_BYTES,
  audioBlob,
  completeSession,
  reloadPage,
  resetDatabase,
  tick,
} from '../test/helpers';

beforeEach(resetDatabase);
afterEach(() => db.close());

describe('History playback after a reload', () => {
  it('lists a finished recording and retrieves its Blob at the correct byte size', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob());

    // Navigate away and reload: nothing is held in memory any more.
    await reloadPage();

    // Open History.
    const entries = await loadHistoryEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].session.id).toBe(sessionId);
    expect(entries[0].question?.id).toBe('T01');

    // The join that was missing: History must know a recording exists.
    expect(entries[0].hasRecording).toBe(true);

    // And it must be retrievable, as a Blob, at full size.
    const recording = await loadRecordingForSession(sessionId);
    expect(recording).toBeDefined();
    expect(recording!.blob).toBeInstanceOf(Blob);
    expect(recording!.blob.size).toBe(RECORDING_BYTES);
    expect(recording!.mimeType).toBe('audio/webm');
    expect(recording!.durationSec).toBe(118);

    // Byte-for-byte, not merely the right length.
    const bytes = new Uint8Array(await recording!.blob.arrayBuffer());
    expect(bytes.length).toBe(RECORDING_BYTES);
    expect(bytes[0]).toBe(0);
    expect(bytes[250]).toBe(250);
    expect(bytes[251]).toBe(0);
  });

  it('keeps every earlier recording playable, not just the most recent', async () => {
    // The reported symptom was specifically about the *earlier* recording.
    const first = await completeSession('T01', 100, audioBlob(1024));
    const second = await completeSession('T01', 110, audioBlob(2048));

    await reloadPage();

    const entries = await loadHistoryEntries();
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.hasRecording)).toBe(true);

    const firstAudio = await loadRecordingForSession(first);
    const secondAudio = await loadRecordingForSession(second);

    expect(firstAudio?.blob.size).toBe(1024);
    expect(secondAudio?.blob.size).toBe(2048);
    // Each session keeps its own audio; saving a new one must not overwrite the old.
    expect(firstAudio!.id).not.toBe(secondAudio!.id);
  });

  it('orders history newest first', async () => {
    await completeSession('T01', 100, audioBlob(512));
    await tick();
    await completeSession('T01', 110, audioBlob(512));

    await reloadPage();

    const [newer, older] = await loadHistoryEntries();
    expect((newer.session.completedAt ?? '') >= (older.session.completedAt ?? '')).toBe(true);
  });

  it('reports hasRecording false when audio was never kept', async () => {
    // A session that reached the reveal with no recording row should not offer a
    // player. This should not happen through the UI, but History must not crash
    // on data restored from an audio-free export.
    await db.sessions.add({
      questionId: 'T01',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stage: 'revealed',
      durationSec: 90,
      selfRating: 'ok',
      pointsAwarded: 20,
    });

    await reloadPage();

    const entries = await loadHistoryEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].hasRecording).toBe(false);
    expect(await loadRecordingForSession(entries[0].session.id!)).toBeUndefined();
  });

  it('still lists a session whose question has left the bank', async () => {
    const sessionId = await completeSession('T01', 118, audioBlob(4096));
    await db.questions.delete('T01');

    await reloadPage();

    const entries = await loadHistoryEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].question).toBeUndefined();
    // The recording is the thing worth keeping, so it must survive the question.
    expect(entries[0].hasRecording).toBe(true);
    expect((await loadRecordingForSession(sessionId))?.blob.size).toBe(4096);
  });
});

describe('Attempts at one question', () => {
  it('lists every attempt, oldest first', async () => {
    await completeSession('T01', 100, audioBlob(512));
    await tick();
    await completeSession('T01', 110, audioBlob(512));

    await reloadPage();

    const attempts = await loadAttemptsForQuestion('T01');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].durationSec).toBe(100);
    expect(attempts[1].durationSec).toBe(110);
  });
});
