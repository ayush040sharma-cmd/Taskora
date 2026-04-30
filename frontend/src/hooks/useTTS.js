/**
 * useTTS — Text-to-Speech hook wrapping SpeechSynthesis API.
 *
 * Upgrade path: replace speak() implementation with ElevenLabs API call
 * (stream audio blob → play via AudioContext) without changing consumers.
 */
import { useRef, useState, useCallback, useEffect } from "react";

export function useTTS({ rate = 1.05, pitch = 0.95, volume = 1, voiceName = null } = {}) {
  const utteranceRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);

  // Load available voices (Chrome loads them async)
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text) => {
    if (!text?.trim()) return;
    // Interrupt any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = rate;
    utterance.pitch  = pitch;
    utterance.volume = volume;

    // Pick preferred voice: named > English female > first available
    const available = window.speechSynthesis.getVoices();
    if (voiceName) {
      utterance.voice = available.find(v => v.name.includes(voiceName)) || null;
    } else {
      utterance.voice =
        available.find(v => v.name.includes("Google UK English Female")) ||
        available.find(v => v.lang.startsWith("en") && v.name.includes("Female")) ||
        available.find(v => v.lang.startsWith("en")) ||
        null;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;

    // Chrome bug: long utterances get cut off — chunked workaround
    const chunks = splitIntoChunks(text, 200);
    speakChunks(chunks, 0);
  }, [rate, pitch, volume, voiceName]);

  function speakChunks(chunks, index) {
    if (index >= chunks.length) { setIsSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(chunks[index]);
    u.rate   = rate;
    u.pitch  = pitch;
    u.volume = volume;
    u.voice  = utteranceRef.current?.voice || null;
    if (index === 0) u.onstart = () => setIsSpeaking(true);
    u.onend  = () => speakChunks(chunks, index + 1);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  function splitIntoChunks(text, maxLen) {
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    const chunks = [];
    let current = "";
    for (const s of sentences) {
      if ((current + s).length > maxLen && current) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  return { speak, stop, isSpeaking, voices };
}
