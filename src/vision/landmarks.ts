/**
 * Turning face landmarks into four numbers.
 *
 * This file is deliberately free of any MediaPipe import: it takes a plain
 * array of normalised points and does arithmetic. That keeps the interesting
 * part testable without a browser, a camera or a 3.6MB model.
 *
 * ## Which way is left?
 *
 * The camera is not mirrored. It faces you, so your left hand appears on the
 * RIGHT of the image. Therefore when you look at the left edge of your screen,
 * your irises move toward the right of the image and `irisX` goes UP.
 *
 * That inversion is easy to flip by accident, so it lives here once:
 * `directionFor()` below is the only place image space is translated back into
 * the speaker's point of view. Nothing else should reason about it.
 */

/** One landmark as MediaPipe reports it: normalised to 0–1 of the frame. */
export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

/**
 * The landmark indices used, from the 478-point face mesh (468 face + 10 iris).
 *
 * "First" and "second" eye rather than left and right on purpose — see the
 * note at the top of the file about how confusing left is here. Corners are
 * named by where they sit in the IMAGE, so the same ratio maths works on both.
 */
export const LANDMARKS = {
  firstEye: {
    cornerLeft: 33,
    cornerRight: 133,
    lidUpper: 159,
    lidLower: 145,
    irisCentre: 468,
  },
  secondEye: {
    cornerLeft: 362,
    cornerRight: 263,
    lidUpper: 386,
    lidLower: 374,
    irisCentre: 473,
  },
  noseTip: 1,
  cheekLeft: 234,
  cheekRight: 454,
  foreheadTop: 10,
  chin: 152,
} as const;

/** The lowest landmark count that still contains the iris points. */
export const REQUIRED_LANDMARK_COUNT = 478;

/**
 * One frame reduced to what the tracker actually needs.
 *
 * All four values are scale-invariant — divided through by the size of the eye
 * or of the face — so leaning towards the screen does not read as a glance.
 */
export interface GazeFeature {
  /** Iris position across the eye opening, 0 = image-left, 1 = image-right. */
  irisX: number;
  /** Iris position down the eye opening, 0 = at the upper lid, 1 = at the lower. */
  irisY: number;
  /** Nose offset from the cheek midpoint, in face widths. Grows with head turn. */
  headX: number;
  /** Nose offset from the forehead–chin midpoint, in face heights. Grows with nod. */
  headY: number;
  /** Eye aspect ratio, averaged. Small means the eyes are shut. */
  eyeAspect: number;
}

function distance(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Where `value` sits between `from` and `to`. Returns null if they coincide. */
function ratio(value: number, from: number, to: number): number | null {
  const span = to - from;
  if (Math.abs(span) < 1e-6) return null;
  return (value - from) / span;
}

/** The five indices that describe one eye. Both eyes use the same shape. */
interface EyeIndices {
  cornerLeft: number;
  cornerRight: number;
  lidUpper: number;
  lidLower: number;
  irisCentre: number;
}

interface EyeReading {
  irisX: number;
  irisY: number;
  aspect: number;
}

function readEye(points: readonly LandmarkPoint[], eye: EyeIndices): EyeReading | null {
  const left = points[eye.cornerLeft];
  const right = points[eye.cornerRight];
  const upper = points[eye.lidUpper];
  const lower = points[eye.lidLower];
  const iris = points[eye.irisCentre];
  if (!left || !right || !upper || !lower || !iris) return null;

  const width = right.x - left.x;
  const irisX = ratio(iris.x, left.x, right.x);
  const irisY = ratio(iris.y, upper.y, lower.y);
  if (irisX === null || irisY === null) return null;

  // Openness measured against eye width, so it is independent of how far away
  // the face is. A wide-open eye is around 0.3; a blink collapses towards 0.
  const aspect = Math.abs(width) < 1e-6 ? 0 : Math.abs(lower.y - upper.y) / Math.abs(width);

  return { irisX, irisY, aspect };
}

/**
 * Reduce one frame's landmarks to a GazeFeature, or null if the mesh is not
 * usable — too few points, or a degenerate face with zero width.
 */
export function extractGazeFeature(points: readonly LandmarkPoint[]): GazeFeature | null {
  if (points.length < REQUIRED_LANDMARK_COUNT) return null;

  const first = readEye(points, LANDMARKS.firstEye);
  const second = readEye(points, LANDMARKS.secondEye);
  if (!first || !second) return null;

  const nose = points[LANDMARKS.noseTip];
  const cheekLeft = points[LANDMARKS.cheekLeft];
  const cheekRight = points[LANDMARKS.cheekRight];
  const forehead = points[LANDMARKS.foreheadTop];
  const chin = points[LANDMARKS.chin];
  if (!nose || !cheekLeft || !cheekRight || !forehead || !chin) return null;

  const faceWidth = distance(cheekLeft, cheekRight);
  const faceHeight = distance(forehead, chin);
  if (faceWidth < 1e-6 || faceHeight < 1e-6) return null;

  // Turning the head slides the nose tip away from the midpoint of the two
  // cheeks, in the direction of the turn. Dividing by face size makes it a
  // pure angle proxy rather than a distance-from-camera proxy.
  const headX = (nose.x - (cheekLeft.x + cheekRight.x) / 2) / faceWidth;
  const headY = (nose.y - (forehead.y + chin.y) / 2) / faceHeight;

  return {
    irisX: (first.irisX + second.irisX) / 2,
    irisY: (first.irisY + second.irisY) / 2,
    headX,
    headY,
    eyeAspect: (first.aspect + second.aspect) / 2,
  };
}
