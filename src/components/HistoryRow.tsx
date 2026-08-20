/**
 * One past session in the history list: what you answered, the recording, and
 * the note.
 *
 * Its own file because it owns three small pieces of local state — playing,
 * editing a note, confirming a delete — and folding those into HistoryPage would
 * push that file past the size where it stays readable.
 */

import { useState } from 'react';
import { deleteRecordingForSession, saveNote } from '../db/actions';
import type { HistoryEntry } from '../db/history';
import { RATING_COPY } from '../game/flow';
import { useRecordingUrl } from '../hooks/useAppData';
import { PetSpinner } from './PetSpinner';
import { GazeLine } from './GazeReport';
import { Button, RarityChip, formatDate, formatDuration } from './ui';

export function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { session, question, hasRecording } = entry;
  const sessionId = session.id;

  return (
    <div className="rounded-toy bg-cream-deep/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {question ? <RarityChip rarity={question.rarity} /> : null}
        <span className="text-xs text-ink-soft">{formatDate(session.completedAt)}</span>
        <span className="text-xs text-ink-soft">· {formatDuration(session.durationSec)}</span>
        {session.selfRating ? (
          <span className="text-xs text-ink-soft">
            · called it {RATING_COPY[session.selfRating].label.toLowerCase()}
          </span>
        ) : null}
        {/*
          Eye contact survives deleting the audio, the same way the rating and
          the note do: the practice happened whether or not the file is still
          on disk.
        */}
        <GazeLine summary={session.gaze} />
        {typeof session.pointsAwarded === 'number' ? (
          <span className="ml-auto rounded-full bg-gold/40 px-3 py-0.5 text-xs font-bold text-ink">
            +{session.pointsAwarded}
          </span>
        ) : null}
      </div>

      <p className="mt-2 font-semibold leading-snug text-ink">
        {question?.question ?? `Question ${session.questionId} (no longer in the bank)`}
      </p>

      {typeof sessionId === 'number' ? (
        <>
          <RecordingSection sessionId={sessionId} hasRecording={hasRecording} />
          <NoteSection sessionId={sessionId} note={session.note} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording: play it back, or delete the audio
// ---------------------------------------------------------------------------

function RecordingSection({
  sessionId,
  hasRecording,
}: {
  sessionId: number;
  hasRecording: boolean;
}) {
  // Playback is opt-in, so opening History does not create an object URL for
  // every recording you have ever made.
  const [playing, setPlaying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!hasRecording) {
    return <p className="mt-3 text-xs text-ink-faint">No recording kept for this one.</p>;
  }

  if (confirmingDelete) {
    return (
      <div className="mt-3 rounded-toy bg-cream-deep p-4">
        <p className="text-sm font-semibold text-ink">Delete just the audio for this one?</p>
        <p className="mt-1 text-sm text-ink-soft">
          The session stays in your history, and so do the points, the rating and the note. Only the
          audio goes — and that is the one thing here that cannot be got back.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setDeleting(true);
              void deleteRecordingForSession(sessionId).finally(() => {
                setDeleting(false);
                setConfirmingDelete(false);
                setPlaying(false);
              });
            }}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete the audio'}
          </Button>
          <Button tone="quiet" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
            Keep it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {playing ? <RecordingPlayer sessionId={sessionId} /> : null}
      <div className={`flex flex-wrap items-center gap-2 ${playing ? 'mt-2' : ''}`}>
        {playing ? (
          <Button tone="quiet" onClick={() => setPlaying(false)}>
            Hide player
          </Button>
        ) : (
          <Button onClick={() => setPlaying(true)}>🎧 Listen back</Button>
        )}
        <Button tone="quiet" onClick={() => setConfirmingDelete(true)}>
          Delete audio
        </Button>
      </div>
    </div>
  );
}

/** Loads one recording's audio and plays it. Mounted only once asked for. */
function RecordingPlayer({ sessionId }: { sessionId: number }) {
  const url = useRecordingUrl(sessionId);

  if (!url) {
    return (
      <div className="flex justify-start">
        <PetSpinner size="sm" label="Fetching the recording…" />
      </div>
    );
  }

  return (
    <audio controls src={url} className="w-full">
      Your browser cannot play this recording.
    </audio>
  );
}

// ---------------------------------------------------------------------------
// Note: add, edit, or clear it
// ---------------------------------------------------------------------------

function NoteSection({ sessionId, note }: { sessionId: number; note: string | undefined }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    // Start from what is stored, so cancelling and reopening never shows a stale draft.
    setDraft(note ?? '');
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="mt-3 rounded-toy bg-card/80 p-4">
        <label htmlFor={`note-${sessionId}`} className="text-sm font-semibold text-ink">
          Note to yourself
        </label>
        <p className="mt-0.5 text-xs text-ink-soft">
          Worth rewriting later — you usually know what mattered better a week afterwards. Clearing
          it and saving removes it.
        </p>
        <textarea
          id={`note-${sessionId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-toy bg-cream-deep/70 p-3 text-base text-ink placeholder:text-ink-faint"
          placeholder="Missed the third beat entirely — start with the number next time."
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setSaving(true);
              void saveNote(sessionId, draft).finally(() => {
                setSaving(false);
                setEditing(false);
              });
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save note'}
          </Button>
          <Button tone="quiet" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="mt-3">
        <Button tone="quiet" onClick={startEditing}>
          ✏️ Add a note
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-toy bg-card/80 p-3">
      <p className="text-sm text-ink-soft">{note}</p>
      <div className="mt-2">
        <Button tone="quiet" onClick={startEditing}>
          ✏️ Edit note
        </Button>
      </div>
    </div>
  );
}
