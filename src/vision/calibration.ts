/**
 * Capturing the baseline: you, at this desk, looking at this lens.
 *
 * Everything the tracker measures is a deviation from these four numbers, so
 * absolute head angles never have to be trusted — and so a bad baseline is
 * worse than no baseline, because every session afterwards is measured from it.
 * That is why this refuses more than it accepts.
 */

import { GAZE_CONFIG } from '../game/config';
import type { GazeCalibration } from '../types';
import type { GazeFeature } from './landmarks';
import type { GazeReading } from './gazeTracker';

export type CalibrationOutcome =
  | { ok: true; calibration: GazeCalibration }
  | { ok: false; reason: 'too-few-samples' | 'too-much-movement' };

/**
 * Collects a couple of seconds of "look straight at the lens" and averages it.
 *
 * The median is used rather than the mean: one blink or one glance at the
 * countdown would drag a mean sideways, and a baseline that is wrong by a
 * little is worse than no baseline, because everything downstream is measured
 * from it.
 */
export class GazeCalibrator {
  private readonly samples: GazeFeature[] = [];

  push(reading: GazeReading): void {
    if (!reading) return;
    if (reading.eyeAspect < GAZE_CONFIG.blinkEyeAspect) return;
    this.samples.push(reading);
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  finish(now: Date = new Date()): CalibrationOutcome {
    if (this.samples.length < GAZE_CONFIG.calibrationMinSamples) {
      return { ok: false, reason: 'too-few-samples' };
    }

    const irisX = median(this.samples.map((s) => s.irisX));
    const irisY = median(this.samples.map((s) => s.irisY));
    const headX = median(this.samples.map((s) => s.headX));
    const headY = median(this.samples.map((s) => s.headY));

    // If the head was moving during calibration the baseline describes an
    // average of several poses and none of them accurately. Better to say so.
    const wobble = Math.max(
      meanAbsoluteDeviation(this.samples.map((s) => s.irisX), irisX),
      meanAbsoluteDeviation(this.samples.map((s) => s.irisY), irisY),
      meanAbsoluteDeviation(this.samples.map((s) => s.headX), headX),
      meanAbsoluteDeviation(this.samples.map((s) => s.headY), headY),
    );
    if (wobble > GAZE_CONFIG.calibrationMaxWobble) {
      return { ok: false, reason: 'too-much-movement' };
    }

    return {
      ok: true,
      calibration: {
        irisX,
        irisY,
        headX,
        headY,
        samples: this.samples.length,
        capturedAt: now.toISOString(),
      },
    };
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function meanAbsoluteDeviation(values: number[], centre: number): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + Math.abs(value - centre), 0) / values.length;
}
