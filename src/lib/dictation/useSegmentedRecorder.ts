"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Keep each uploaded chunk small (well under any request-size limit a
// hosting platform might impose) so a dictation of any length -- a 5 minute
// note or a 90 minute consult -- never fails because a single upload got too
// big. Segments are transcribed independently and the caller concatenates
// the results once recording stops.
const DEFAULT_SEGMENT_MS = 45_000;

export type SegmentHandler = (blob: Blob, index: number) => Promise<void> | void;

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Records audio in a continuous stream but periodically finalises the
 * current MediaRecorder segment and starts a new one on the same
 * MediaStream, so every uploaded blob is a small, independently-decodable
 * audio file (a mid-stream MediaRecorder chunk on its own is not a valid
 * playable file -- only a fully stopped segment is).
 *
 * `onSegment` is called once per completed segment (including the final one
 * after `stop()`), in order, and may be async -- the hook tracks how many are
 * still in flight so `finishing` stays true until the last one settles.
 */
export function useSegmentedRecorder(onSegment: SegmentHandler, segmentMs: number = DEFAULT_SEGMENT_MS) {
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const indexRef = useRef(0);
  const pendingRef = useRef(0);
  const onSegmentRef = useRef(onSegment);
  const beginSegmentRef = useRef<() => void>(() => {});

  useEffect(() => {
    onSegmentRef.current = onSegment;
  }, [onSegment]);

  useEffect(() => {
    beginSegmentRef.current = () => {
      const stream = streamRef.current;
      if (!stream) return;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const index = indexRef.current;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const isLastSegment = stoppingRef.current;

        if (blob.size > 0) {
          pendingRef.current += 1;
          Promise.resolve(onSegmentRef.current(blob, index))
            .catch((err: unknown) => {
              setError(toErrorMessage(err, `Failed to process part ${index + 1}`));
            })
            .finally(() => {
              pendingRef.current -= 1;
              if (isLastSegment && pendingRef.current === 0) setFinishing(false);
            });
        }

        if (!isLastSegment) {
          indexRef.current += 1;
          beginSegmentRef.current();
        } else {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (pendingRef.current === 0) setFinishing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
    };
  }, []);

  const start = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stoppingRef.current = false;
      indexRef.current = 0;
      pendingRef.current = 0;
      setRecording(true);
      beginSegmentRef.current();
      timerRef.current = setInterval(() => {
        recorderRef.current?.stop();
      }, segmentMs);
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Could not access microphone"));
    }
  }, [segmentMs]);

  const stop = useCallback(() => {
    if (!streamRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setFinishing(true);
    recorderRef.current?.stop();
  }, []);

  return { recording, finishing, error, setError, start, stop };
}
