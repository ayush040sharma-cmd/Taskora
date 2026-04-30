/**
 * useSpeechRecognition
 * Wraps the Web Speech API with auto-restart, error recovery,
 * and interim/final transcript splitting.
 *
 * Upgrade path: swap the SpeechRecognition block for Whisper streaming
 * without changing anything in the consumer component.
 */
import { useRef, useState, useEffect, useCallback } from "react";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export function useSpeechRecognition({
  onTranscript,      // (text, isFinal) => void
  onError,           // (errorMsg) => void
  continuous = true,
  lang = "en-US",
  enabled = true,
}) {
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const isRunningRef = useRef(false);
  const enabledRef = useRef(enabled);

  const [isListening, setIsListening] = useState(false);
  const [permissionState, setPermissionState] = useState("unknown"); // unknown | granted | denied

  // Keep ref in sync so callbacks always see current value
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const stop = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    isRunningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      onError?.("Web Speech API not supported. Use Chrome or Edge.");
      return;
    }
    if (isRunningRef.current) return;

    const rec = new SpeechRecognition();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRunningRef.current = true;
      setIsListening(true);
      setPermissionState("granted");
    };

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) onTranscript?.(interim, false);
      if (final)   onTranscript?.(final, true);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPermissionState("denied");
        onError?.("Microphone permission denied. Allow mic access in browser settings.");
        stop();
        return;
      }
      // Non-fatal errors — will auto-restart
      if (e.error !== "no-speech" && e.error !== "aborted") {
        onError?.(`Speech error: ${e.error}`);
      }
    };

    rec.onend = () => {
      isRunningRef.current = false;
      setIsListening(false);
      // Auto-restart unless explicitly stopped
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (enabledRef.current) start();
        }, 300);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      onError?.(`Could not start recognition: ${e.message}`);
    }
  }, [continuous, lang, onTranscript, onError, stop]);

  // Start/stop based on `enabled` prop
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => stop();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isListening, permissionState, start, stop };
}
