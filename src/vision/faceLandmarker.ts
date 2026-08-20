/**
 * The only file in the app that imports MediaPipe.
 *
 * ## Why the asset paths look like this
 *
 * MediaPipe normally wants a CDN base path, and its own docs hand you a
 * jsdelivr URL. That would be a third-party request on every use, which rule 3
 * forbids outright. So the wasm loader, the wasm binary and the model are all
 * imported with Vite's `?url`, which copies them into the build and hands back
 * a same-origin path. Nothing here ever talks to a remote host.
 *
 * Importing them rather than putting them in `public/` is deliberate too: the
 * Electron renderer builds with `publicDir: false` (so my real question bank
 * cannot end up inside a .dmg), and files imported this way are emitted by Vite
 * for both builds without any extra packaging step.
 *
 * ## Why the model is loaded lazily
 *
 * It is 3.6MB, and eye-contact training is off by default. The dynamic import
 * keeps MediaPipe's ~300KB of glue out of the main bundle until the moment
 * something actually asks for a face.
 */

import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import modelUrl from './face_landmarker.task?url';
import { extractGazeFeature, type GazeFeature, type LandmarkPoint } from './landmarks';

/** One shared instance. Loading it twice would mean two copies of the model in memory. */
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(): Promise<FaceLandmarker> {
  const { FaceLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');

  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };

  const options = {
    baseOptions: { modelAssetPath: modelUrl },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    // Blendshapes and the transformation matrix are both extra work per frame,
    // and landmarks.ts derives everything it needs from the mesh itself.
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  try {
    return await Landmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'GPU' },
    });
  } catch {
    // No WebGL, or a driver the GPU delegate does not like. CPU is slower but
    // this only runs ten times a second, so it is a perfectly good fallback.
    return Landmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

/**
 * Load the model, or return the copy already loading. Call it early — while the
 * question is being read, say — so the first recording does not wait on it.
 */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= createLandmarker().catch((error: unknown) => {
    // Do not cache a failure: a transient problem should be retryable.
    landmarkerPromise = null;
    throw error;
  });
  return landmarkerPromise;
}

/** True when this browser can run the tracker at all. */
export function isGazeTrackingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof WebAssembly !== 'undefined'
  );
}

/**
 * Analyse one video frame. Returns null when there is no usable face, which the
 * tracker books as untracked time rather than as a look-away.
 *
 * `timestampMs` must increase on every call — MediaPipe's VIDEO mode rejects a
 * timestamp that goes backwards.
 */
export function readFrame(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): GazeFeature | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

  const result = landmarker.detectForVideo(video, timestampMs);
  const points = result.faceLandmarks?.[0] as LandmarkPoint[] | undefined;
  if (!points) return null;

  return extractGazeFeature(points);
}
