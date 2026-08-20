/**
 * The eye-contact state machine, driven by made-up frames.
 *
 * No camera, no model, no browser: GazeSessionTracker takes numbers and a
 * clock, so the behaviour that actually matters — that a blink is not a glance,
 * that a flick of the eyes is not a glance, that a missing face is not a glance
 * — can be tested exactly rather than by squinting at a webcam.
 */

import { describe, expect, it } from 'vitest';
import { GAZE_CONFIG, NEUTRAL_GAZE_BASELINE } from '../game/config';
import {
  GazeCalibrator,
  GazeSessionTracker,
  deviationFor,
  directionFor,
  onCameraRatio,
} from './gazeTracker';
import type { GazeFeature } from './landmarks';

/** A frame of someone looking straight at the lens. */
function feature(overrides: Partial<GazeFeature> = {}): GazeFeature {
  return { irisX: 0.5, irisY: 0.5, headX: 0, headY: 0, eyeAspect: 0.3, ...overrides };
}

/** Eyes well off to one side — comfortably outside tolerance at any sensitivity. */
const LOOKING_ASIDE = feature({ irisX: 0.72 });
/** Eyelids closed. The iris also drops, which is exactly the trap being tested. */
const BLINKING = feature({ irisY: 0.85, eyeAspect: 0.05 });

/**
 * Pushes frames at the configured sample rate, keeping one clock across calls
 * so a test can describe a whole answer as a sequence of stretches.
 */
class Feeder {
  private nowMs = 0;

  constructor(readonly tracker: GazeSessionTracker) {
    // The first push only starts the clock, so get it out of the way here.
    tracker.push(feature(), 0);
  }

  feed(reading: GazeFeature | null, durationMs: number): this {
    const steps = Math.round(durationMs / GAZE_CONFIG.sampleIntervalMs);
    for (let i = 0; i < steps; i += 1) {
      this.nowMs += GAZE_CONFIG.sampleIntervalMs;
      this.tracker.push(reading, this.nowMs);
    }
    return this;
  }
}

function newTracker() {
  return new GazeSessionTracker(NEUTRAL_GAZE_BASELINE, 'normal');
}

describe('Holding eye contact', () => {
  it('reports a clean run as unbroken contact', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 10_000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(0);
    expect(summary.trackedSec).toBeCloseTo(10, 1);
    expect(summary.onCameraSec).toBeCloseTo(10, 1);
    expect(summary.longestHoldSec).toBeCloseTo(10, 1);
    expect(onCameraRatio(summary)).toBeCloseTo(1, 2);
  });

  it('does not count a flick of the eyes as a glance away', () => {
    // Shorter than driftToCountMs. Eyes do this constantly during speech and
    // counting it would make the number meaningless.
    const brief = GAZE_CONFIG.driftToCountMs - 200;

    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(LOOKING_ASIDE, brief).feed(feature(), 3000);

    expect(tracker.summary().glanceCount).toBe(0);
  });

  it('counts a sustained look away once, with when and which way', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(LOOKING_ASIDE, 1500).feed(feature(), 3000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(1);
    expect(summary.glances).toHaveLength(1);

    const [glance] = summary.glances;
    expect(glance.atSec).toBeGreaterThanOrEqual(3);
    expect(glance.atSec).toBeLessThan(3.3);
    expect(glance.durationSec).toBeGreaterThan(1.4);
    // irisX above the baseline means the eyes went towards the image's right,
    // which is the speaker's left. This is the assertion that catches a mirror
    // flip, so it is spelled out rather than snapshotted.
    expect(glance.direction).toBe('left');
  });

  it('keeps counting glances past the storage cap without storing them all', () => {
    const tracker = newTracker();
    const feeder = new Feeder(tracker);
    const total = GAZE_CONFIG.maxGlancesStored + 5;

    for (let i = 0; i < total; i += 1) {
      feeder.feed(feature(), 1000).feed(LOOKING_ASIDE, 1000);
    }
    feeder.feed(feature(), 1000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(total);
    expect(summary.glances).toHaveLength(GAZE_CONFIG.maxGlancesStored);
  });

  it('counts a look away that was still going when the recording stopped', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(LOOKING_ASIDE, 2000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(1);
    expect(summary.glances[0].durationSec).toBeGreaterThan(1.5);
  });

  it('gives the same answer when the summary is read twice', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(LOOKING_ASIDE, 2000);

    expect(tracker.summary()).toEqual(tracker.summary());
  });
});

describe('Things that are not looking away', () => {
  it('does not treat a blink as a downward glance', () => {
    // A closing eyelid drags the iris centre down. Without the blink guard this
    // reads as a large look-down several times a minute.
    expect(deviationFor(BLINKING, NEUTRAL_GAZE_BASELINE, 'normal').magnitude).toBeGreaterThan(1);

    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(BLINKING, 900).feed(feature(), 3000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(0);
    // The blink still counts as time spent on the lens, because it was.
    expect(summary.onCameraSec).toBeCloseTo(summary.trackedSec, 1);
  });

  it('books a missing face as untracked time rather than as a glance', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 3000).feed(null, 2000).feed(feature(), 3000);

    const summary = tracker.summary();
    expect(summary.glanceCount).toBe(0);
    expect(summary.untrackedSec).toBeCloseTo(2, 1);
    expect(summary.trackedSec).toBeCloseTo(6, 1);
  });

  it('does not let a moment out of frame wipe a good stretch of contact', () => {
    const tracker = newTracker();
    new Feeder(tracker).feed(feature(), 4000).feed(null, 500).feed(feature(), 4000);

    // The hold spans the gap rather than restarting after it.
    expect(tracker.summary().longestHoldSec).toBeGreaterThan(8);
  });
});

describe('Sensitivity', () => {
  it('changes what counts as a drift without changing anything else', () => {
    const smallDrift = feature({ irisX: 0.5 + GAZE_CONFIG.tolerance.x * 1.1 });

    const strict = new GazeSessionTracker(NEUTRAL_GAZE_BASELINE, 'strict');
    new Feeder(strict).feed(feature(), 2000).feed(smallDrift, 1500).feed(feature(), 2000);
    expect(strict.summary().glanceCount).toBe(1);

    const relaxed = new GazeSessionTracker(NEUTRAL_GAZE_BASELINE, 'relaxed');
    new Feeder(relaxed).feed(feature(), 2000).feed(smallDrift, 1500).feed(feature(), 2000);
    expect(relaxed.summary().glanceCount).toBe(0);
  });
});

describe('Naming the direction', () => {
  // The camera is not mirrored, so image-right is the speaker's left. Getting
  // this backwards would send someone looking for a distraction on the wrong
  // side of their desk.
  it('reports image-right as the speaker’s left', () => {
    expect(directionFor({ x: 2, y: 0, magnitude: 2 })).toBe('left');
    expect(directionFor({ x: -2, y: 0, magnitude: 2 })).toBe('right');
  });

  it('reports a lower iris as looking down', () => {
    expect(directionFor({ x: 0, y: 2, magnitude: 2 })).toBe('down');
    expect(directionFor({ x: 0, y: -2, magnitude: 2 })).toBe('up');
  });

  it('picks whichever axis drifted further', () => {
    expect(directionFor({ x: 0.5, y: 3, magnitude: 3 })).toBe('down');
    expect(directionFor({ x: 3, y: 0.5, magnitude: 3 })).toBe('left');
  });
});

describe('Calibration', () => {
  const enough = GAZE_CONFIG.calibrationMinSamples + 5;

  it('takes the middle of a steady set of readings', () => {
    const calibrator = new GazeCalibrator();
    for (let i = 0; i < enough; i += 1) {
      calibrator.push(feature({ irisX: 0.44, irisY: 0.52, headX: 0.01, headY: -0.02 }));
    }

    const outcome = calibrator.finish();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.calibration.irisX).toBeCloseTo(0.44, 3);
    expect(outcome.calibration.headY).toBeCloseTo(-0.02, 3);
    expect(outcome.calibration.samples).toBe(enough);
  });

  it('ignores blinks rather than averaging them in', () => {
    const calibrator = new GazeCalibrator();
    for (let i = 0; i < enough; i += 1) calibrator.push(feature({ irisY: 0.5 }));
    for (let i = 0; i < 5; i += 1) calibrator.push(BLINKING);

    expect(calibrator.sampleCount).toBe(enough);
    const outcome = calibrator.finish();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.calibration.irisY).toBeCloseTo(0.5, 3);
  });

  it('refuses a baseline taken while the head was moving', () => {
    // A wrong baseline is worse than none: everything downstream is measured
    // from it, so a bad one quietly poisons every session that follows.
    const calibrator = new GazeCalibrator();
    for (let i = 0; i < enough; i += 1) {
      calibrator.push(feature({ irisX: i % 2 === 0 ? 0.3 : 0.7 }));
    }

    expect(calibrator.finish()).toEqual({ ok: false, reason: 'too-much-movement' });
  });

  it('refuses a baseline built from almost nothing', () => {
    const calibrator = new GazeCalibrator();
    calibrator.push(feature());
    calibrator.push(null);

    expect(calibrator.finish()).toEqual({ ok: false, reason: 'too-few-samples' });
  });
});
