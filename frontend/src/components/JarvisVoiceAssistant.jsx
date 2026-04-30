/**
 * JarvisVoiceAssistant
 *
 * Always-on, wake-word activated voice assistant for Taskora.
 * Say "Jarvis" → give command → hear + see response.
 *
 * States: idle → wake_detected → processing → speaking → idle
 *
 * Upgrade path:
 *   - Replace useSpeechRecognition with Porcupine/Whisper
 *   - Replace useTTS with ElevenLabs streaming
 *   - Replace fetch() with WebSocket for streaming responses
 */

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useTTS } from "../hooks/useTTS";
import api from "../api/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const WAKE_WORD         = "jarvis";
const COMMAND_TIMEOUT   = 6000;   // ms — how long to wait for command after wake
const DEBOUNCE_MS       = 800;    // ms — prevent duplicate processing
const MAX_HISTORY       = 10;     // messages to keep in memory
const WAKE_VARIATIONS   = ["jarvis", "jarvas", "jarves", "jarvis,"]; // common mishears

// ── State machine ─────────────────────────────────────────────────────────────

const STATES = {
  IDLE:           "idle",
  WAKE_DETECTED:  "wake_detected",
  PROCESSING:     "processing",
  SPEAKING:       "speaking",
  ERROR:          "error",
};

const STATE_CONFIG = {
  [STATES.IDLE]:          { label: "Say 'Jarvis' to activate",  color: "#475569", glow: "none" },
  [STATES.WAKE_DETECTED]: { label: "Listening...",               color: "#6366f1", glow: "0 0 40px rgba(99,102,241,0.6)" },
  [STATES.PROCESSING]:    { label: "Jarvis is thinking...",      color: "#f59e0b", glow: "0 0 40px rgba(245,158,11,0.6)" },
  [STATES.SPEAKING]:      { label: "Speaking...",                color: "#10b981", glow: "0 0 40px rgba(16,185,129,0.6)" },
  [STATES.ERROR]:         { label: "Error — try again",          color: "#ef4444", glow: "0 0 30px rgba(239,68,68,0.4)" },
};

// ── Message reducer ───────────────────────────────────────────────────────────

function messagesReducer(state, action) {
  switch (action.type) {
    case "ADD":
      return [...state, action.msg].slice(-MAX_HISTORY);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

// ── Wake word detection ───────────────────────────────────────────────────────

function detectWakeWord(transcript) {
  const lower = transcript.toLowerCase().trim();
  for (const variant of WAKE_VARIATIONS) {
    const idx = lower.indexOf(variant);
    if (idx !== -1) {
      const command = lower.slice(idx + variant.length).trim();
      return { detected: true, command: command || null, index: idx };
    }
  }
  return { detected: false, command: null, index: -1 };
}

// ── Orb SVG component ─────────────────────────────────────────────────────────

function JarvisOrb({ state, isListening, size = 72 }) {
  const cfg = STATE_CONFIG[state];
  const rings = state === STATES.WAKE_DETECTED || state === STATES.SPEAKING;

  return (
    <div
      className="jarvis-orb-wrap"
      style={{
        width: size, height: size,
        filter: cfg.glow !== "none" ? `drop-shadow(0 0 16px ${cfg.color}88)` : "none",
        transition: "filter 0.4s ease",
      }}
    >
      {/* Outer pulse rings */}
      {rings && (
        <>
          <div className="jarvis-ring jarvis-ring-1" style={{ borderColor: cfg.color + "44" }} />
          <div className="jarvis-ring jarvis-ring-2" style={{ borderColor: cfg.color + "22" }} />
        </>
      )}

      {/* Core orb */}
      <svg width={size} height={size} viewBox="0 0 72 72">
        <defs>
          <radialGradient id="orbGrad" cx="35%" cy="30%">
            <stop offset="0%"   stopColor={cfg.color} stopOpacity="0.9" />
            <stop offset="60%"  stopColor={cfg.color} stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0f172a"   stopOpacity="1" />
          </radialGradient>
          <radialGradient id="shineGrad" cx="40%" cy="30%">
            <stop offset="0%"   stopColor="#fff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Base sphere */}
        <circle cx="36" cy="36" r="32" fill="url(#orbGrad)" />
        {/* Shine */}
        <ellipse cx="28" cy="24" rx="14" ry="10" fill="url(#shineGrad)" />
        {/* Arc lines */}
        <circle cx="36" cy="36" r="28" fill="none" stroke={cfg.color} strokeWidth="0.5" strokeOpacity="0.3" />
        <ellipse cx="36" cy="36" rx="28" ry="12" fill="none" stroke={cfg.color} strokeWidth="0.5" strokeOpacity="0.2" />

        {/* State icon */}
        {state === STATES.IDLE && (
          <path d="M36 24 a8 8 0 0 1 0 16 a8 8 0 0 1 0-16 M36 42 l0 6"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" strokeOpacity="0.7" />
        )}
        {state === STATES.WAKE_DETECTED && (
          <g>
            <circle cx="36" cy="36" r="6" fill="#fff" fillOpacity="0.9">
              <animate attributeName="r" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="fill-opacity" values="0.9;0.5;0.9" dur="0.8s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
        {state === STATES.PROCESSING && (
          <g transform="translate(36,36)">
            {[0,45,90,135,180,225,270,315].map((angle, i) => (
              <circle
                key={i}
                cx={Math.cos(angle * Math.PI / 180) * 16}
                cy={Math.sin(angle * Math.PI / 180) * 16}
                r="2.5" fill="#fff" fillOpacity={0.3 + i * 0.08}
              >
                <animateTransform attributeName="transform" type="rotate"
                  from="0 0 0" to="360 0 0" dur="1.2s" repeatCount="indefinite"
                  begin={`${i * 0.15}s`} additive="sum" />
              </circle>
            ))}
          </g>
        )}
        {state === STATES.SPEAKING && (
          <g>
            {[20,26,32,38,44,50].map((x, i) => (
              <rect key={i} x={x} y="28" width="3" height="16" rx="1.5"
                fill="#fff" fillOpacity="0.75">
                <animate attributeName="height" values="4;16;4" dur={`${0.3 + i * 0.08}s`}
                  repeatCount="indefinite" begin={`${i * 0.06}s`} />
                <animate attributeName="y" values="32;28;32" dur={`${0.3 + i * 0.08}s`}
                  repeatCount="indefinite" begin={`${i * 0.06}s`} />
              </rect>
            ))}
          </g>
        )}
        {state === STATES.ERROR && (
          <path d="M28 28 l16 16 M44 28 l-16 16"
            stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

// ── Waveform bars ─────────────────────────────────────────────────────────────

function WaveformBars({ active, color }) {
  return (
    <div className="jarvis-waveform">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="jarvis-wave-bar"
          style={{
            background: color,
            animationDuration: active ? `${0.4 + i % 4 * 0.15}s` : "0s",
            animationPlayState: active ? "running" : "paused",
            height: active ? undefined : "4px",
          }}
        />
      ))}
    </div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`jarvis-bubble ${isUser ? "jarvis-bubble--user" : "jarvis-bubble--jarvis"}`}>
      {!isUser && <div className="jarvis-bubble-name">JARVIS</div>}
      <div className="jarvis-bubble-text">{msg.content}</div>
      <div className="jarvis-bubble-time">{msg.time}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JarvisVoiceAssistant({ workspaceId }) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [assistantState, setAssistantState]   = useState(STATES.IDLE);
  const [enabled, setEnabled]                 = useState(true);
  const [expanded, setExpanded]               = useState(false);
  const [liveTranscript, setLiveTranscript]   = useState("");
  const [statusDetail, setStatusDetail]       = useState("");
  const [error, setError]                     = useState(null);
  const [messages, dispatchMessages]          = useReducer(messagesReducer, []);

  // ── Refs for stable callbacks ────────────────────────────────────────────────
  const assistantStateRef  = useRef(STATES.IDLE);
  const commandBufferRef   = useRef("");
  const commandTimerRef    = useRef(null);
  const lastProcessedRef   = useRef("");
  const debounceTimerRef   = useRef(null);
  const processingRef      = useRef(false);
  const abortRef           = useRef(null);
  const chatEndRef         = useRef(null);

  const setState = useCallback((s) => {
    assistantStateRef.current = s;
    setAssistantState(s);
  }, []);

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS({ rate: 1.0, pitch: 0.9 });

  useEffect(() => {
    if (isSpeaking) setState(STATES.SPEAKING);
    else if (assistantStateRef.current === STATES.SPEAKING) setState(STATES.IDLE);
  }, [isSpeaking, setState]);

  // ── Process a command ────────────────────────────────────────────────────────
  const processCommand = useCallback(async (command) => {
    if (!command?.trim()) { setState(STATES.IDLE); return; }
    if (processingRef.current) return;
    if (command === lastProcessedRef.current) return;

    lastProcessedRef.current = command;
    processingRef.current    = true;

    stopSpeaking();
    setState(STATES.PROCESSING);
    setStatusDetail(command);
    setLiveTranscript("");

    dispatchMessages({
      type: "ADD",
      msg: { role: "user", content: command, time: fmt(new Date()) },
    });

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data } = await api.post(
        "/jarvis/command",
        { message: command, workspace_id: workspaceId },
        { signal: controller.signal }
      );

      const reply = data.reply || data.message || "I couldn't process that command.";

      dispatchMessages({
        type: "ADD",
        msg: { role: "assistant", content: reply, time: fmt(new Date()) },
      });

      setStatusDetail(reply);
      speak(reply);

    } catch (err) {
      // Swallow cancellations silently
      if (err.name === "AbortError" || err.name === "CanceledError" || err.code === "ERR_CANCELED") return;

      const serverMsg = err.response?.data?.reply || err.response?.data?.message;
      const spokenErr = serverMsg || "Sorry, something went wrong. Please try again.";

      setError(spokenErr);
      setState(STATES.ERROR);
      dispatchMessages({
        type: "ADD",
        msg: { role: "assistant", content: spokenErr, time: fmt(new Date()) },
      });
      speak(spokenErr);
      setTimeout(() => { setError(null); setState(STATES.IDLE); }, 4000);
    } finally {
      processingRef.current    = false;
      commandBufferRef.current = "";
    }
  }, [workspaceId, speak, stopSpeaking, setState]);

  // ── Transcript handler ────────────────────────────────────────────────────
  const handleTranscript = useCallback((text, isFinal) => {
    const lower = text.toLowerCase().trim();

    // Show live transcript while listening
    setLiveTranscript(text);

    // If currently processing or speaking, allow interruption only on new wake word
    if (assistantStateRef.current === STATES.PROCESSING ||
        assistantStateRef.current === STATES.SPEAKING) {
      const { detected, command } = detectWakeWord(lower);
      if (detected && command && isFinal) {
        stopSpeaking();
        abortRef.current?.abort();
        processingRef.current = false;
        lastProcessedRef.current = "";
        setTimeout(() => processCommand(command), 100);
      }
      return;
    }

    // ── IDLE: scan for wake word ──────────────────────────────────────────
    if (assistantStateRef.current === STATES.IDLE) {
      const { detected, command } = detectWakeWord(lower);
      if (detected) {
        setState(STATES.WAKE_DETECTED);
        commandBufferRef.current = command || "";

        // If command was part of the wake utterance, process immediately (final only)
        if (isFinal && command) {
          clearTimeout(commandTimerRef.current);
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => processCommand(command), DEBOUNCE_MS);
          return;
        }

        // Start command collection timeout
        clearTimeout(commandTimerRef.current);
        commandTimerRef.current = setTimeout(() => {
          if (commandBufferRef.current.trim()) {
            processCommand(commandBufferRef.current.trim());
          } else {
            setLiveTranscript("");
            setState(STATES.IDLE);
          }
        }, COMMAND_TIMEOUT);
      }
      return;
    }

    // ── WAKE_DETECTED: accumulate command ─────────────────────────────────
    if (assistantStateRef.current === STATES.WAKE_DETECTED) {
      // Strip wake word if user repeated it
      const { detected, command: stripped } = detectWakeWord(lower);
      const cleanText = detected && stripped !== null ? stripped : lower;

      if (cleanText) commandBufferRef.current = cleanText;

      if (isFinal && commandBufferRef.current.trim()) {
        clearTimeout(commandTimerRef.current);
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(
          () => processCommand(commandBufferRef.current.trim()),
          DEBOUNCE_MS
        );
      }
    }
  }, [processCommand, stopSpeaking, setState]);

  // ── Error handler ────────────────────────────────────────────────────────────
  const handleSpeechError = useCallback((msg) => {
    if (msg.includes("permission")) {
      setError(msg);
      setState(STATES.ERROR);
      setEnabled(false);
    }
    // Non-fatal — just show briefly
    else {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    }
  }, [setState]);

  // ── Speech recognition ────────────────────────────────────────────────────
  const { isListening, permissionState } = useSpeechRecognition({
    onTranscript: handleTranscript,
    onError: handleSpeechError,
    enabled,
    continuous: true,
    lang: "en-US",
  });

  // ── Scroll chat to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Keyboard shortcut: Alt+J toggle ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "j") { setEnabled(v => !v); }
      if (e.altKey && e.key === "k") { setExpanded(v => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── UI helpers ────────────────────────────────────────────────────────────
  const cfg = STATE_CONFIG[assistantState];

  const handleToggle = () => {
    if (enabled) {
      stopSpeaking();
      setEnabled(false);
      setState(STATES.IDLE);
    } else {
      setError(null);
      setEnabled(true);
    }
  };

  const handleManualSend = (text) => {
    if (!text?.trim()) return;
    setState(STATES.WAKE_DETECTED);
    processCommand(text.trim());
  };

  return (
    <>
      {/* ── Floating orb button ── */}
      <div className="jarvis-float" style={{ "--jarvis-color": cfg.color }}>

        {/* Expanded panel */}
        {expanded && (
          <div className="jarvis-panel">
            {/* Header */}
            <div className="jarvis-panel-header" style={{ borderBottomColor: cfg.color + "33" }}>
              <div className="jarvis-panel-title">
                <span className="jarvis-j" style={{ background: cfg.color }}>J</span>
                <div>
                  <div className="jarvis-title-text">JARVIS</div>
                  <div className="jarvis-title-sub" style={{ color: cfg.color }}>
                    {cfg.label}
                    {isListening && <span className="jarvis-live-dot" />}
                  </div>
                </div>
              </div>
              <div className="jarvis-panel-controls">
                {/* Toggle mic */}
                <button
                  className={`jarvis-ctrl-btn ${enabled ? "jarvis-ctrl-btn--on" : "jarvis-ctrl-btn--off"}`}
                  onClick={handleToggle}
                  title={enabled ? "Disable Jarvis (Alt+J)" : "Enable Jarvis (Alt+J)"}
                >
                  {enabled ? "🎙️" : "🔇"}
                </button>
                {/* Clear chat */}
                <button
                  className="jarvis-ctrl-btn"
                  onClick={() => dispatchMessages({ type: "CLEAR" })}
                  title="Clear history"
                >
                  🗑️
                </button>
                {/* Close panel */}
                <button
                  className="jarvis-ctrl-btn"
                  onClick={() => setExpanded(false)}
                  title="Minimize"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Waveform */}
            <div className="jarvis-panel-vis">
              <WaveformBars
                active={assistantState === STATES.WAKE_DETECTED || assistantState === STATES.SPEAKING}
                color={cfg.color}
              />
              <JarvisOrb state={assistantState} isListening={isListening} size={64} />
            </div>

            {/* Live transcript */}
            {liveTranscript && assistantState !== STATES.PROCESSING && (
              <div className="jarvis-live-transcript" style={{ borderColor: cfg.color + "44" }}>
                <span className="jarvis-transcript-icon">👂</span>
                <span>{liveTranscript}</span>
              </div>
            )}

            {/* Processing command */}
            {assistantState === STATES.PROCESSING && statusDetail && (
              <div className="jarvis-processing-bar">
                <span className="jarvis-processing-spinner" />
                <span className="jarvis-processing-cmd">"{statusDetail}"</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="jarvis-error-bar">⚠️ {error}</div>
            )}

            {/* Permission denied */}
            {permissionState === "denied" && (
              <div className="jarvis-error-bar">
                🔒 Mic access denied. Allow microphone in browser settings, then refresh.
              </div>
            )}

            {/* Chat history */}
            <div className="jarvis-chat">
              {messages.length === 0 ? (
                <div className="jarvis-chat-empty">
                  <div style={{ fontSize: 28 }}>🤖</div>
                  <div>Say <strong>"Jarvis"</strong> followed by a command</div>
                  <div className="jarvis-examples">
                    <span>"Jarvis, show my overdue tasks"</span>
                    <span>"Jarvis, create a bug for the login issue"</span>
                    <span>"Jarvis, what's my workload today?"</span>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Manual input fallback */}
            <ManualInput onSend={handleManualSend} disabled={processingRef.current} />

            {/* Footer */}
            <div className="jarvis-panel-footer">
              <span>{enabled ? "Listening" : "Sleeping"} · Alt+J toggle · Alt+K panel</span>
            </div>
          </div>
        )}

        {/* Floating orb trigger */}
        <div
          className={`jarvis-trigger ${!expanded ? "jarvis-trigger--visible" : "jarvis-trigger--hidden"}`}
          onClick={() => setExpanded(true)}
          title="Open Jarvis (Alt+K)"
        >
          <JarvisOrb state={enabled ? assistantState : STATES.IDLE} isListening={isListening} size={52} />
          {/* Badge for wake detected / processing */}
          {(assistantState === STATES.WAKE_DETECTED || assistantState === STATES.PROCESSING) && (
            <div className="jarvis-trigger-badge" style={{ background: cfg.color }}>
              {assistantState === STATES.PROCESSING ? "..." : "!"}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Manual input fallback ─────────────────────────────────────────────────────

function ManualInput({ onSend, disabled }) {
  const [text, setText] = useState("");

  const submit = () => {
    if (text.trim()) { onSend(text); setText(""); }
  };

  return (
    <div className="jarvis-manual">
      <input
        className="jarvis-manual-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        placeholder="Type a command..."
        disabled={disabled}
      />
      <button className="jarvis-manual-btn" onClick={submit} disabled={disabled || !text.trim()}>
        ➤
      </button>
    </div>
  );
}

// ── Utils ────────────────────────────────────────────────────────────────────

function fmt(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
