/**
 * The eye-contact state machine.
 *
 * Frames come in as GazeFeatures, numbers go out as a GazeSummary. Nothing in
 * here knows about React, a camera, or MediaPipe, which is why it can be tested
 * by pushing a made-up sequence of samples at it.
 *
 * Two things it is careful about, both learned from how eyes actually behave
 * while someone is talking:
 *
 *   - **Blinks are not glances.** A closing eyelid drags the iris centre
 *     downwards and would otherwise read as a large look-down several times a
 *     minute. Frames below the blink threshold hold the previous reading.
 *   - **Saccades are not glances.** Eyes flick constantly during speech. A
 *     drift has to persist for `driftToCountMs` before it counts, and contact
 *     has to be re-established for `returnToResetMs` before another one can.
 *
 * And one thing it must never do: influence points, the pet or badges. It
 * returns a summary and nothing else. See rule 7 in CLAUDE.md.
 */

import { GAZE_CONFIG, NEUTRAL_GAZE_BASELINE } from '../game/config';
import type { GazeCalibration, GazeDirection, GazeGlance, GazeSensitivity, GazeSummary } from '../types';
import type { GazeFeature } from './landmarks';

/** The four baselines, without the bookkeeping fields of a stored calibration. */
export type GazeBaseline = Pick<GazeCalibration, 'irisX' | 'irisY' | 'headX' | 'headY'>;

export interface GazeDeviation {
  /** Signed deviation along each axis, in tolerance units: 1 is exactly at the edge. */
  x: number;
  y: number;
  /** Elliptical distance from the baseline. Above 1 means off the lens. */
  magnitude: number;
}

export function baselineFrom(calibration: GazeCalibration | null | undefined): GazeBaseline {
  return calibration ?? NEUTRAL_GAZE_BASELINE;
}

/**
 * How far this frame is from "looking at the lens", scaled so that 1.0 is the
 * edge of tolerance regardless of which axis or which sensitivity setting.
 */
export function deviationFor(
  feature: GazeFeature,
  baseline: GazeBaseline,
  sensitivity: GazeSensitivity,
): GazeDeviation {
  const { weights, tolerance, sensitivityMultiplier } = GAZE_CONFIG;
  const multiplier = sensitivityMultiplier[sensitivity];

  const rawX =
    weights.iris * (feature.irisX - baseline.irisX) + weights.head * (feature.headX - baseline.headX);
  const rawY =
    weights.iris * (feature.irisY - baseline.irisY) + weights.head * (feature.headY - baseline.headY);

  const x = rawX / (tolerance.x * multiplier);
  const y = rawY / (tolerance.y * multiplier);

  return { x, y, magnitude: Math.hypot(x, y) };
}

/**
 * Name the direction from the speaker's point of view.
 *
 * The camera is not mirrored, so image-right is the speaker's left — this is
 * the single place that flip is applied. See the note in landmarks.ts.
 */
export function directionFor(deviation: GazeDeviation): GazeDirection {
  if (Math.abs(deviation.x) >= Math.abs(deviation.y)) {
    return deviation.x > 0 ? 'left' : 'right';
  }
  return deviation.y > 0 ? 'down' : 'up';
}

/** Fraction of tracked time spent on the lens, 0–1. Zero tracked time reads as 0. */
export function onCameraRatio(summary: GazeSummary): number {
  if (summary.trackedSec <= 0) return 0;
  return Math.min(summary.onCameraSec / summary.trackedSec, 1);
}

/** True when there is enough tracked time for the numbers to mean anything. */
export function isSummaryWorthShowing(summary: GazeSummary | undefined): summary is GazeSummary {
  return !!summary && summary.trackedSec >= GAZE_CONFIG.minTrackedSecToReport;
}

/**
 * What the caller hands in for one frame.
 * `feature` is null when no face was found — which is recorded as untracked
 * time rather than as a look-away, because a detection failure and a glance
 * away are not the same thing and only one of them is the user's fault.
 */
export type GazeReading = GazeFeature | null;

const EMPTY_SUMMARY: GazeSummary = {
  trackedSec: 0,
  onCameraSec: 0,
  untrackedSec: 0,
  glanceCount: 0,
  longestHoldSec: 0,
  glances: [],
};

/**
 * Accumulates one attempt's worth of frames.
 *
 * Timestamps are supplied by the caller (performance.now()) rather than read
 * here, so tests can drive it deterministically.
 */
export class GazeSessionTracker {
  private readonly baseline: GazeBaseline;
  private readonly sensitivity: GazeSensitivity;

  private startedAtMs: number | null = null;
  private lastAtMs: number | null = null;

  /** The debounced state — what the dot shows and what glances are counted from. */
  private inContact = true;
  /** When the instantaneous reading first disagreed with `inContact`. */
  private pendingSince: number | null = null;
  /** The deviation at the moment a drift began, kept to label its direction. */
  private pendingDeviation: GazeDeviation | null = null;
  /** Last non-blink instantaneous reading, held through blinks. */
  private lastOnCamera = true;
  /** Whether the last frame contained a face at all. */
  private lastFaceVisible = true;
  /** When the current, already-confirmed look-away began. */
  private driftStartedMs: number | null = null;
  private driftDirection: GazeDirection = 'down';

  private trackedMs = 0;
  private onCameraMs = 0;
  private untrackedMs = 0;
  private holdStartedMs: number | null = null;
  private longestHoldMs = 0;
  private glanceCount = 0;
  private readonly glances: GazeGlance[] = [];

  constructor(baseline: GazeBaseline, sensitivity: GazeSensitivity) {
    this.baseline = baseline;
    this.sensitivity = sensitivity;
  }

  /** The debounced answer to "are they looking at me right now?". */
  get onCamera(): boolean {
    return this.inContact;
  }

  /** Whether the most recent frame had a face in it, so the UI can say so. */
  get faceVisible(): boolean {
    return this.lastFaceVisible;
  }

  push(reading: GazeReading, atMs: number): void {
    if (this.startedAtMs === null) {
      this.startedAtMs = atMs;
      this.lastAtMs = atMs;
      this.holdStartedMs = atMs;
      return;
    }

    // Clamp the step. A backgrounded tab stops firing the sampler, and without
    // this the gap would be booked as many seconds of whatever state we were in.
    const maxStepMs = GAZE_CONFIG.sampleIntervalMs * 4;
    const dtMs = Math.min(Math.max(atMs - (this.lastAtMs ?? atMs), 0), maxStepMs);
    this.lastAtMs = atMs;

    if (!reading) {
      this.lastFaceVisible = false;
      this.untrackedMs += dtMs;
      // A face that has gone missing cannot be judged, so the debounce clock is
      // reset rather than advanced. The current hold survives: stepping out of
      // frame for a moment should not wipe a good stretch of eye contact.
      this.pendingSince = null;
      this.pendingDeviation = null;
      return;
    }

    this.lastFaceVisible = true;
    this.trackedMs += dtMs;

    const blinking = reading.eyeAspect < GAZE_CONFIG.blinkEyeAspect;
    const deviation = deviationFor(reading, this.baseline, this.sensitivity);
    // Through a blink, hold the last real reading rather than believing the
    // eyelid. `deviation` is still computed so the direction label stays fresh.
    const onCameraNow = blinking ? this.lastOnCamera : deviation.magnitude <= 1;
    if (!blinking) this.lastOnCamera = onCameraNow;

    // The percentage uses the instantaneous reading — it is meant to be an
    // honest fraction of time, not a count of debounced events.
    if (onCameraNow) this.onCameraMs += dtMs;

    if (onCameraNow === this.inContact) {
      this.pendingSince = null;
      this.pendingDeviation = null;
      return;
    }

    if (this.pendingSince === null) {
      this.pendingSince = atMs;
      this.pendingDeviation = deviation;
    }

    const heldMs = atMs - this.pendingSince;

    if (this.inContact && heldMs >= GAZE_CONFIG.driftToCountMs) {
      // Confirmed look-away. It is dated from when the drift started, not from
      // now, so the timeline points at the moment it actually happened.
      this.closeHold(this.pendingSince);
      this.inContact = false;
      this.driftStartedMs = this.pendingSince;
      this.driftDirection = directionFor(this.pendingDeviation ?? deviation);
      this.pendingSince = null;
      this.pendingDeviation = null;
      return;
    }

    if (!this.inContact && heldMs >= GAZE_CONFIG.returnToResetMs) {
      this.recordGlance(this.pendingSince);
      this.inContact = true;
      this.holdStartedMs = this.pendingSince;
      this.pendingSince = null;
      this.pendingDeviation = null;
    }
  }

  private closeHold(endedAtMs: number): void {
    if (this.holdStartedMs === null) return;
    this.longestHoldMs = Math.max(this.longestHoldMs, endedAtMs - this.holdStartedMs);
    this.holdStartedMs = null;
  }

  private recordGlance(endedAtMs: number): void {
    if (this.driftStartedMs === null || this.startedAtMs === null) return;

    this.glanceCount += 1;
    // glanceCount keeps counting past the cap; only the timeline is truncated,
    // so one very long answer cannot grow a session row without bound.
    if (this.glances.length < GAZE_CONFIG.maxGlancesStored) {
      this.glances.push({
        atSec: round((this.driftStartedMs - this.startedAtMs) / 1000),
        durationSec: round((endedAtMs - this.driftStartedMs) / 1000),
        direction: this.driftDirection,
      });
    }
    this.driftStartedMs = null;
  }

  /**
   * Close the books and hand back the numbers.
   *
   * Deliberately does not mutate: an unfinished glance or hold is closed
   * against the last frame seen in a local copy, so calling this twice gives
   * the same answer twice. The mutating version quietly appended a second,
   * zero-length glance on every extra call.
   */
  summary(): GazeSummary {
    if (this.startedAtMs === null || this.lastAtMs === null) return { ...EMPTY_SUMMARY };

    const endedAtMs = this.lastAtMs;
    const glances = [...this.glances];
    let glanceCount = this.glanceCount;
    let longestHoldMs = this.longestHoldMs;

    if (this.inContact) {
      if (this.holdStartedMs !== null) {
        longestHoldMs = Math.max(longestHoldMs, endedAtMs - this.holdStartedMs);
      }
    } else if (this.driftStartedMs !== null) {
      // A glance still open at the end still happened, so it is counted rather
      // than dropped for the sake of a tidy state machine.
      glanceCount += 1;
      if (glances.length < GAZE_CONFIG.maxGlancesStored) {
        glances.push({
          atSec: round((this.driftStartedMs - this.startedAtMs) / 1000),
          durationSec: round((endedAtMs - this.driftStartedMs) / 1000),
          direction: this.driftDirection,
        });
      }
    }

    return {
      trackedSec: round(this.trackedMs / 1000),
      onCameraSec: round(this.onCameraMs / 1000),
      untrackedSec: round(this.untrackedMs / 1000),
      glanceCount,
      longestHoldSec: round(longestHoldMs / 1000),
      glances,
    };
  }
}

function round(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

// Calibration is the other half of the same idea, so it is re-exported here
// and callers do not have to know which file holds which half.
export { GazeCalibrator, type CalibrationOutcome } from './calibration';
