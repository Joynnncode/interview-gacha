/**
 * Audio recording via the native MediaRecorder API. No libraries.
 *
 * The recorder deliberately knows nothing about the game. It hands back a Blob
 * and a duration; the caller decides what that means.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'denied' | 'unsupported' | 'error';

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/** Preference order. The browser picks the first it supports. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface UseRecorder {
  state: RecorderState;
  /** Seconds elapsed, updated about ten times a second while recording. */
  elapsedSec: number;
  /** Human-readable explanation when state is 'denied', 'unsupported' or 'error'. */
  message: string | null;
  start: () => Promise<boolean>;
  stop: () => Promise<RecorderResult | null>;
  cancel: () => void;
  reset: () => void;
}

const TICK_MS = 100;

export function useRecorder(): UseRecorder {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /** Release the microphone. The browser indicator should go out immediately. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    // Clean up if the component unmounts mid-recording.
    return () => {
      stopTicking();
      releaseStream();
    };
  }, [releaseStream, stopTicking]);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setMessage('This browser cannot record audio. Try Chrome, Edge or Safari.');
      return false;
    }

    const mimeType = pickMimeType();
    if (!mimeType) {
      setState('unsupported');
      setMessage('This browser has no audio format the recorder can use.');
      return false;
    }

    setState('requesting');
    setMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;

      startedAtRef.current = performance.now();
      setElapsedSec(0);
      recorder.start();

      tickRef.current = window.setInterval(() => {
        setElapsedSec((performance.now() - startedAtRef.current) / 1000);
      }, TICK_MS);

      setState('recording');
      return true;
    } catch (error) {
      releaseStream();
      const name = error instanceof DOMException ? error.name : '';

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setMessage(
          'Microphone access is blocked. Allow it for this site in your browser settings, then try again.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState('error');
        setMessage('No microphone found. Plug one in or check your input device, then try again.');
      } else {
        setState('error');
        setMessage('Something went wrong starting the recorder. Try again.');
      }
      return false;
    }
  }, [releaseStream]);

  const stop = useCallback(async (): Promise<RecorderResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    setState('stopping');
    stopTicking();

    const durationSec = (performance.now() - startedAtRef.current) / 1000;
    const mimeType = recorder.mimeType || 'audio/webm';

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
      recorder.stop();
    });

    releaseStream();
    recorderRef.current = null;
    setElapsedSec(durationSec);
    setState('idle');

    return { blob, mimeType, durationSec };
  }, [releaseStream, stopTicking]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    stopTicking();
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    recorderRef.current = null;
    releaseStream();
    setElapsedSec(0);
    setState('idle');
  }, [releaseStream, stopTicking]);

  const reset = useCallback(() => {
    setState('idle');
    setElapsedSec(0);
    setMessage(null);
  }, []);

  return { state, elapsedSec, message, start, stop, cancel, reset };
}
