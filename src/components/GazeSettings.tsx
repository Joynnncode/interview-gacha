/**
 * The eye-contact training panel in Settings.
 *
 * Lives in its own file rather than inside SettingsPage because it owns a
 * camera, a countdown and a small state machine, and SettingsPage was already
 * close to the 300-line split point.
 *
 * Calibration is the only reason this panel needs a preview. Everything the
 * tracker measures is a deviation from "you, at this desk, looking at this
 * lens", so that baseline has to be captured somewhere — and it is much easier
 * to hold still for two seconds when you can see yourself doing it.
 */

import { useEffect, useState } from 'react';
import { GAZE_CONFIG } from '../game/config';
import { updateSettings } from '../db/actions';
import { useGazeTracker } from '../hooks/useGazeTracker';
import { Button, Card, SectionHeading, formatDate } from './ui';
import type { GazeSensitivity, Settings } from '../types';

/** A moment to stop fidgeting after clicking the button, before sampling starts. */
const READY_COUNTDOWN_MS = 2000;

const SENSITIVITY_COPY: Record<GazeSensitivity, { label: string; hint: string }> = {
  relaxed: { label: 'Relaxed', hint: 'Only clear look-aways count.' },
  normal: { label: 'Normal', hint: 'A good default for a laptop at arm’s length.' },
  strict: { label: 'Strict', hint: 'Small drifts count too. Useful once the habit is going.' },
};

type CalibrationPhase = 'idle' | 'ready' | 'sampling' | 'done';

export function GazeSettings({ settings }: { settings: Settings }) {
  const gaze = useGazeTracker({
    calibration: settings.gazeCalibration,
    sensitivity: settings.gazeSensitivity,
  });
  const { closeCamera, openCamera } = gaze;

  const [phase, setPhase] = useState<CalibrationPhase>('idle');
  const [result, setResult] = useState<string | null>(null);

  const enabled = settings.gazeTrackingEnabled;

  // The preview is only worth having while the panel is being used. Turning the
  // feature off closes the camera immediately rather than at the next navigation.
  useEffect(() => {
    if (!enabled) {
      closeCamera();
      setPhase('idle');
    }
  }, [closeCamera, enabled]);

  useEffect(() => closeCamera, [closeCamera]);

  const runCalibration = async () => {
    setResult(null);
    setPhase('ready');

    if (!(await openCamera())) {
      setPhase('idle');
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, READY_COUNTDOWN_MS));
    setPhase('sampling');

    const outcome = await gaze.calibrate();
    setPhase('done');

    if (outcome.ok) {
      await updateSettings({ gazeCalibration: outcome.calibration });
      setResult(`Calibrated from ${outcome.calibration.samples} readings. You are set.`);
    } else if (outcome.reason === 'too-much-movement') {
      setResult('Your head moved around during that one. Try again and hold as still as you can.');
    } else {
      setResult('Not enough of your face was visible. Move into frame and try again.');
    }
  };

  const busy = phase === 'ready' || phase === 'sampling';

  return (
    <Card>
      <SectionHeading hint="Practise holding the lens instead of letting your eyes wander.">
        Eye contact
      </SectionHeading>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => void updateSettings({ gazeTrackingEnabled: event.target.checked })}
          className="mt-0.5 h-5 w-5 rounded-md accent-peach"
        />
        <span>
          Track eye contact while I record
          <span className="block text-xs text-ink-soft">
            Puts a small dot at the top of the screen, next to the lens, and counts how often your
            eyes drift away from it.
          </span>
        </span>
      </label>

      <p className="mt-4 rounded-toy bg-cream-deep p-4 text-sm text-ink-soft">
        <strong className="text-ink">No video is recorded.</strong> Each frame is measured and thrown
        away in the same instant — what gets stored is a handful of numbers per answer. Nothing is
        uploaded, and eye contact never affects points, your pet or badges.
      </p>

      <p className="mt-3 text-xs text-ink-soft">
        The dot sits at the top of the app window, so it lines up with the lens best when the window
        is near the top of the screen. Calibration keeps the measurements right either way — the
        position only affects how good a cue the dot is.
      </p>

      {enabled ? (
        <>
          <hr className="my-6 border-cream-deep" />

          <h3 className="font-bold text-ink">How fussy it should be</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(SENSITIVITY_COPY) as GazeSensitivity[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void updateSettings({ gazeSensitivity: value })}
                className={`toy-press rounded-full px-4 py-1.5 text-sm font-semibold ${
                  settings.gazeSensitivity === value
                    ? 'bg-peach text-white shadow-soft'
                    : 'bg-cream-deep text-ink-soft hover:text-ink'
                }`}
              >
                {SENSITIVITY_COPY[value].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {SENSITIVITY_COPY[settings.gazeSensitivity].hint}
          </p>

          <hr className="my-6 border-cream-deep" />

          <h3 className="font-bold text-ink">Calibration</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {settings.gazeCalibration
              ? `Last calibrated ${formatDate(settings.gazeCalibration.capturedAt)}. Redo this if you move the camera or change where you sit.`
              : 'Not calibrated yet. It works without this, but a two-second calibration makes it noticeably more accurate.'}
          </p>

          <div className="mt-4 flex flex-wrap items-start gap-5">
            {/*
              Mirrored for display only. People expect a mirror when they see
              themselves; the tracker reads the raw, unmirrored frames, which is
              why landmarks.ts has that long note about which way left is.
            */}
            <video
              ref={gaze.videoRef}
              className="h-36 w-48 -scale-x-100 rounded-toy bg-cream-deep object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />

            <div className="flex-1">
              <Button tone="primary" onClick={() => void runCalibration()} disabled={busy}>
                {busy ? 'Hold still…' : settings.gazeCalibration ? 'Recalibrate' : 'Calibrate'}
              </Button>

              <p className="mt-3 text-sm text-ink-soft">
                {phase === 'ready'
                  ? 'Sit how you normally sit, then look straight at the lens.'
                  : phase === 'sampling'
                    ? 'Keep looking at the lens…'
                    : 'Look straight into the lens for a couple of seconds when you press the button.'}
              </p>

              {busy ? (
                <div className="mt-3 h-2 w-full max-w-56 overflow-hidden rounded-full bg-cream-deep">
                  <div
                    className="h-full rounded-full bg-tech transition-[width] ease-linear"
                    style={{
                      width: phase === 'sampling' ? '100%' : '25%',
                      transitionDuration: `${
                        phase === 'sampling' ? GAZE_CONFIG.calibrationMs : READY_COUNTDOWN_MS
                      }ms`,
                    }}
                  />
                </div>
              ) : null}

              {result ? <p className="mt-3 text-sm font-semibold text-ink">{result}</p> : null}
              {gaze.message ? <p className="mt-3 text-sm text-ink-soft">{gaze.message}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}
