/**
 * The main screen: pull the machine, then work through the four stages.
 *
 * This component owns the transitions between stages. It does not own the rules
 * about what a stage means — those live in src/game/flow.ts, and every write
 * goes through src/db/actions.ts so an illegal transition throws rather than
 * quietly showing the answer early.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GachaMachine, machineDurationMs, type MachinePhase } from '../components/GachaMachine';
import { GazeOverlay } from '../components/GazeOverlay';
import { QuestionCard } from '../components/QuestionCard';
import { RecordStage } from '../components/RecordStage';
import { RateStage } from '../components/RateStage';
import { RevealStage } from '../components/RevealStage';
import { Button, EmptyState } from '../components/ui';
import { stripAnswer } from '../game/flow';
import type { PointsBreakdown } from '../game/rewards';
import { drawAndOpenSession, filterEligible } from '../game/draw';
import {
  abandonSession,
  beginRecording,
  discardRecording,
  saveNote,
  saveRecording,
  submitRatingAndReveal,
} from '../db/actions';
import { db } from '../db/db';
import { useQuestion, useQuestions, useRecordingUrl, useSession, useSettings } from '../hooks/useAppData';
import { useGazeTracker } from '../hooks/useGazeTracker';
import { useRecorder } from '../hooks/useRecorder';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { Badge, SelfRating } from '../types';

export function DrawPage() {
  const questions = useQuestions();
  const settings = useSettings();
  const recorder = useRecorder();
  const reducedMotion = useReducedMotion();

  // Eye-contact training. Entirely optional: every call below is allowed to
  // fail, and none of them may stop the microphone from recording.
  const gazeEnabled = settings.gazeTrackingEnabled;
  const gaze = useGazeTracker({
    calibration: settings.gazeCalibration,
    sensitivity: settings.gazeSensitivity,
  });
  // Pulled out because the hook returns a fresh object each render, while these
  // are stable — depending on `gaze` itself would re-run the effects endlessly.
  const { closeCamera: closeGazeCamera, openCamera: openGazeCamera } = gaze;

  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [machinePhase, setMachinePhase] = useState<MachinePhase>('idle');
  const [viaPity, setViaPity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [points, setPoints] = useState<PointsBreakdown | null>(null);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);

  const session = useSession(sessionId);
  const question = useQuestion(session?.questionId);
  const recordingUrl = useRecordingUrl(sessionId);

  const openTimer = useRef<number | null>(null);
  const resumeAttempted = useRef(false);

  useEffect(() => {
    return () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    };
  }, []);

  /**
   * Resume an unfinished session after a reload, so a draw is never lost.
   * A session left mid-recording goes back to 'drawn': the audio did not survive
   * the reload, so neither should the claim to have recorded it.
   */
  useEffect(() => {
    if (resumeAttempted.current) return;
    resumeAttempted.current = true;

    void (async () => {
      const open = await db.sessions.filter((s) => s.stage !== 'revealed').last();
      if (!open?.id) return;
      if (open.stage === 'recording') await discardRecording(open.id);
      setSessionId(open.id);
      setMachinePhase('opened');
    })();
  }, []);

  /*
   * The camera is on for exactly two stages, and off for everything else.
   *
   * It opens at 'drawn' rather than at 'recording' so the permission prompt and
   * the model load happen while the question is being read, not in the middle
   * of an answer. It closes again at 'rating' — once the numbers are collected
   * there is no reason for the indicator light to still be on.
   */
  const stageForCamera = session?.stage;
  useEffect(() => {
    const wanted =
      gazeEnabled && (stageForCamera === 'drawn' || stageForCamera === 'recording');
    if (wanted) void openGazeCamera();
    else closeGazeCamera();
  }, [closeGazeCamera, gazeEnabled, openGazeCamera, stageForCamera]);

  const eligibleCount = questions ? filterEligible(questions, settings).length : 0;

  const handlePull = useCallback(async () => {
    setDrawError(null);
    setPoints(null);
    setNewBadges([]);
    setTooShort(false);
    recorder.reset();

    // Abandon an untouched previous draw rather than leaving it dangling.
    if (sessionId && session && session.stage === 'drawn') {
      await abandonSession(sessionId);
    }

    const result = await drawAndOpenSession();
    if (!result) {
      setDrawError(
        'No questions are eligible for the draw. Check the category filters in Settings.',
      );
      return;
    }

    setSessionId(result.sessionId);
    setViaPity(result.viaPity);
    setMachinePhase('drawing');

    openTimer.current = window.setTimeout(
      () => setMachinePhase('opened'),
      machineDurationMs(reducedMotion),
    );
  }, [recorder, reducedMotion, session, sessionId]);

  const handleStartRecording = useCallback(async () => {
    if (!sessionId) return;
    setTooShort(false);
    const started = await recorder.start();
    if (!started) return;

    // Tracking is started after the microphone and its result is ignored: a
    // camera that will not open is a missing feature, not a failed recording.
    if (gazeEnabled) void gaze.startTracking();
    await beginRecording(sessionId);
  }, [gaze, gazeEnabled, recorder, sessionId]);

  const handleStopRecording = useCallback(async () => {
    if (!sessionId || !question) return;
    setSaving(true);
    try {
      const result = await recorder.stop();
      // Stop the tracker even if the recording came back empty, so the camera
      // is not left accumulating into a session that no longer exists.
      const gazeSummary = gaze.stopTracking();
      if (!result) return;
      const accepted = await saveRecording({
        sessionId,
        questionId: question.id,
        blob: result.blob,
        mimeType: result.mimeType,
        durationSec: result.durationSec,
        gaze: gazeSummary ?? undefined,
      });
      setTooShort(!accepted);
    } finally {
      setSaving(false);
    }
  }, [gaze, question, recorder, sessionId]);

  const handleCancelRecording = useCallback(async () => {
    if (!sessionId) return;
    recorder.cancel();
    gaze.stopTracking();
    await discardRecording(sessionId);
  }, [gaze, recorder, sessionId]);

  const handleRate = useCallback(
    async (rating: SelfRating) => {
      if (!sessionId) return;
      setSubmitting(true);
      try {
        const result = await submitRatingAndReveal(sessionId, rating);
        setPoints(result.points);
        setNewBadges(result.newBadges);
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId],
  );

  const handleSaveNote = useCallback(
    (note: string) => {
      if (!sessionId) return;
      void saveNote(sessionId, note);
    },
    [sessionId],
  );

  // --- Rendering ---------------------------------------------------------

  if (questions && questions.length === 0) {
    return (
      <EmptyState
        illustration="capsule"
        title="No questions yet"
        body="The bank has not been imported. Add public/questions.seed.json, or keep questions.example.json in place, then reload."
      />
    );
  }

  const showMachine = machinePhase !== 'opened';
  const stage = session?.stage;

  const tracking = gazeEnabled && stage === 'recording';

  return (
    <div className="space-y-6">
      <GazeOverlay tracker={gaze} active={tracking} />

      <AnimatePresence mode="wait">
        {showMachine ? (
          <motion.div
            key="machine"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.25 }}
            className="pt-4"
          >
            <GachaMachine
              phase={machinePhase}
              rarity={question?.rarity}
              onPull={() => void handlePull()}
              disabled={!questions || eligibleCount === 0}
              caption={
                questions
                  ? `${eligibleCount} question${eligibleCount === 1 ? '' : 's'} in the pool`
                  : 'Loading the bank…'
              }
            />
            {drawError ? (
              <p className="mx-auto mt-6 max-w-md rounded-toy bg-cream-deep p-4 text-center text-sm text-ink-soft">
                {drawError}
              </p>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="question"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="space-y-6"
          >
            {question ? <QuestionCard question={stripAnswer(question)} viaPity={viaPity} /> : null}

            {/* Exactly one stage panel is live at a time. */}
            {question && (stage === 'drawn' || stage === 'recording') ? (
              <RecordStage
                recorder={recorder}
                timeTargetSec={question.timeTargetSec}
                onStart={() => void handleStartRecording()}
                onStop={() => void handleStopRecording()}
                onCancel={() => void handleCancelRecording()}
                saving={saving}
                tooShort={tooShort}
                gazeEnabled={gazeEnabled}
                gazeState={gaze.state}
                gazeMessage={gaze.message}
              />
            ) : null}

            {stage === 'rating' ? (
              <RateStage
                durationSec={session?.durationSec}
                recordingUrl={recordingUrl}
                onRate={(rating) => void handleRate(rating)}
                submitting={submitting}
              />
            ) : null}

            {question && session && stage === 'revealed' ? (
              <RevealStage
                question={question}
                session={session}
                points={points}
                newBadges={newBadges}
                recordingUrl={recordingUrl}
                onSaveNote={handleSaveNote}
                onDrawAgain={() => {
                  setMachinePhase('idle');
                  setSessionId(undefined);
                }}
              />
            ) : null}

            {stage !== 'revealed' ? (
              <div className="flex justify-center">
                <Button
                  tone="quiet"
                  onClick={() => {
                    void (async () => {
                      if (sessionId && stage === 'drawn') await abandonSession(sessionId);
                      recorder.cancel();
                      setSessionId(undefined);
                      setMachinePhase('idle');
                    })();
                  }}
                >
                  Put it back and draw something else
                </Button>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
