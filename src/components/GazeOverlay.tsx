/**
 * The two pieces of camera furniture that sit outside the page flow: the video
 * element the tracker reads from, and the dot it drives.
 *
 * Extracted from DrawPage so the explanation of why the video is rendered like
 * this stays next to the video itself, rather than in the middle of a component
 * that is about the answering flow.
 */

import { GazeDot } from './GazeDot';
import type { UseGazeTracker } from '../hooks/useGazeTracker';

export interface GazeOverlayProps {
  tracker: UseGazeTracker;
  /** True only while a recording is in progress with tracking switched on. */
  active: boolean;
}

export function GazeOverlay({ tracker, active }: GazeOverlayProps) {
  return (
    <>
      {/*
        Rendered at all times rather than conditionally, so the ref exists
        before the camera is ever asked for and mounting it is never a race.

        Visually hidden, not `display: none`: a hidden video element can have
        its frame delivery throttled or stopped by the browser, and a tracker
        that silently receives no frames is worse than one that fails loudly.
        Nothing is ever drawn from it to a canvas and nothing is recorded off
        it — MediaPipe reads each frame and it is dropped.
      */}
      <video
        ref={tracker.videoRef}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        muted
        playsInline
        aria-hidden="true"
      />

      <GazeDot visible={active} onCamera={tracker.onCamera} faceVisible={tracker.faceVisible} />
    </>
  );
}
