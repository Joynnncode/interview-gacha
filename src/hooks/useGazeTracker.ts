/**
 * The camera side of eye-contact training.
 *
 * Mirrors useRecorder in shape and in attitude: it owns a device, it knows
 * nothing about the game, and it hands back numbers for the caller to interpret.
 *
 * Three things worth knowing before editing:
 *
 * 1. **No frame is ever kept.** Each one is handed to MediaPipe, reduced to
 *    four numbers, and dropped. There is no canvas, no Blob, no recorder on
 *    this stream. That is the privacy position and it is also why this is
 *    cheap enough to run alongside an audio recording.
 * 2. **The camera is optional at every step.** Denied permission, no camera, a
 *    browser that cannot do WebAssembly — all of them leave `state` in a
 *    non-fatal place and must never stop the microphone from recording.
 * 3. **The `<video>` element belongs to the caller.** DrawPage renders it
 *    visually hidden; SettingsPage renders it as a preview for calibration.
 *    Attach `videoRef` to it either way.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { GAZE_CONFIG } from '../game/config';
import {
  GazeCalibrator,
  GazeSessionTracker,
  baselineFrom,
  type CalibrationOutcome,
} from '../vision/gazeTracker';
import { isGazeTrackingSupported, loadFaceLandmarker, readFrame } from '../vision/faceLandmarker';
import { desktopBridge } from '../desktop';
import type { GazeCalibration, GazeSensitivity, GazeSummary } from '../types';

export type GazeTrackerState =
  | 'idle'
  | 'loading'
  | 'requesting'
  | 'ready'
  | 'tracking'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface UseGazeTracker {
  state: GazeTrackerState;
  /** Human-readable explanation for 'denied', 'unsupported' and 'error'. */
  message: string | null;
  /** Attach this to a rendered <video>. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Debounced: true while the gaze is on the lens. Drives the dot. */
  onCamera: boolean;
  /** False when no face can be found at all, e.g. out of frame. */
  faceVisible: boolean;
  /** Fetch the model without touching the camera. Safe to call repeatedly. */
  warmUp: () => Promise<boolean>;
  /** Ask for the camera and start the preview. Resolves true if it came up. */
  openCamera: () => Promise<boolean>;
  /** Release the camera. The indicator light should go out immediately. */
  closeCamera: () => void;
  /** Begin accumulating a summary. Opens the camera first if it is not already on. */
  startTracking: () => Promise<boolean>;
  /** Stop accumulating and hand back the numbers, or null if nothing was tracked. */
  stopTracking: () => GazeSummary | null;
  /** Hold still and look at the lens for GAZE_CONFIG.calibrationMs. */
  calibrate: () => Promise<CalibrationOutcome>;
}

export interface UseGazeTrackerOptions {
  /** Baseline from Settings. Null falls back to a neutral, centred assumption. */
  calibration: GazeCalibration | null;
  sensitivity: GazeSensitivity;
}

/** Low resolution on purpose: the face mesh does not need more, and this is cheaper. */
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
  },
  audio: false,
};

export function useGazeTracker({ calibration, sensitivity }: UseGazeTrackerOptions): UseGazeTracker {
  const [state, setState] = useState<GazeTrackerState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [onCamera, setOnCamera] = useState(true);
  const [faceVisible, setFaceVisible] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const trackerRef = useRef<GazeSessionTracker | null>(null);
  const calibratorRef = useRef<GazeCalibrator | null>(null);
  const loopRef = useRef<number | null>(null);

  // Kept in refs so the sampling loop always reads the current settings without
  // being torn down and restarted every time Settings changes.
  const calibrationRef = useRef(calibration);
  const sensitivityRef = useRef(sensitivity);
  calibrationRef.current = calibration;
  sensitivityRef.current = sensitivity;

  const stopLoop = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const closeCamera = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    trackerRef.current = null;
    calibratorRef.current = null;
    setState((current) =>
      current === 'denied' || current === 'unsupported' || current === 'error' ? current : 'idle',
    );
  }, [stopLoop]);

  useEffect(() => closeCamera, [closeCamera]);

  const warmUp = useCallback(async (): Promise<boolean> => {
    if (landmarkerRef.current) return true;
    if (!isGazeTrackingSupported()) {
      setState('unsupported');
      setMessage('This browser cannot do eye-contact tracking. Recording still works normally.');
      return false;
    }

    setState((current) => (current === 'idle' ? 'loading' : current));
    try {
      landmarkerRef.current = await loadFaceLandmarker();
      setState((current) => (current === 'loading' ? 'idle' : current));
      return true;
    } catch {
      setState('error');
      setMessage('The face model could not be loaded. Recording still works normally.');
      return false;
    }
  }, []);

  /**
   * The sampling loop. One interval, ten times a second, doing exactly one
   * thing: read a frame, push the four numbers into whichever collector is
   * running, and throw the frame away.
   */
  const startLoop = useCallback(() => {
    stopLoop();
    loopRef.current = window.setInterval(() => {
      const landmarker = landmarkerRef.current;
      const video = videoRef.current;
      if (!landmarker || !video) return;

      let feature = null;
      try {
        feature = readFrame(landmarker, video, performance.now());
      } catch {
        // A single bad frame is not worth tearing the session down for.
        return;
      }

      calibratorRef.current?.push(feature);

      const tracker = trackerRef.current;
      if (tracker) {
        tracker.push(feature, performance.now());
        // Only touch React state on an actual change — this runs 10x a second.
        setOnCamera((current) => (current === tracker.onCamera ? current : tracker.onCamera));
        setFaceVisible((current) =>
          current === tracker.faceVisible ? current : tracker.faceVisible,
        );
      } else {
        setFaceVisible((current) => (current === (feature !== null) ? current : feature !== null));
      }
    }, GAZE_CONFIG.sampleIntervalMs);
  }, [stopLoop]);

  const openCamera = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    if (!(await warmUp())) return false;

    setState('requesting');
    setMessage(null);

    try {
      // On the packaged Mac app the OS prompt has to be asked for explicitly,
      // and only now — turning this feature on is what consents to a camera.
      // In a browser this is undefined and getUserMedia does the asking.
      const bridge = desktopBridge();
      if (bridge && !(await bridge.requestCameraAccess())) {
        setState('denied');
        setMessage(
          'Camera access is turned off for this app in System Settings → Privacy & Security → Camera. Recording is unaffected.',
        );
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setState('error');
        setMessage('The camera preview is not on screen yet. Try again.');
        return false;
      }

      video.srcObject = stream;
      await video.play();

      setState('ready');
      startLoop();
      return true;
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = error instanceof DOMException ? error.name : '';

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setMessage(
          'Camera access is blocked, so eye contact will not be tracked this time. Recording is unaffected.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState('error');
        setMessage('No camera found. Recording still works normally.');
      } else {
        setState('error');
        setMessage('The camera could not be started. Recording still works normally.');
      }
      return false;
    }
  }, [startLoop, warmUp]);

  const startTracking = useCallback(async (): Promise<boolean> => {
    if (!(await openCamera())) return false;

    trackerRef.current = new GazeSessionTracker(
      baselineFrom(calibrationRef.current),
      sensitivityRef.current,
    );
    setOnCamera(true);
    setState('tracking');
    return true;
  }, [openCamera]);

  const stopTracking = useCallback((): GazeSummary | null => {
    const tracker = trackerRef.current;
    trackerRef.current = null;
    setState((current) => (current === 'tracking' ? 'ready' : current));
    return tracker ? tracker.summary() : null;
  }, []);

  const calibrate = useCallback(async (): Promise<CalibrationOutcome> => {
    if (!(await openCamera())) return { ok: false, reason: 'too-few-samples' };

    const calibrator = new GazeCalibrator();
    calibratorRef.current = calibrator;

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, GAZE_CONFIG.calibrationMs);
    });

    calibratorRef.current = null;
    return calibrator.finish();
  }, [openCamera]);

  return {
    state,
    message,
    videoRef,
    onCamera,
    faceVisible,
    warmUp,
    openCamera,
    closeCamera,
    startTracking,
    stopTracking,
    calibrate,
  };
}
