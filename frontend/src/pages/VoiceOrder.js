import React, { useState, useEffect, useRef, useCallback } from 'react';
import { warmVoices, tuneUtterance } from '../utils/tts';
import { getVoiceStatus, speakServer } from '../utils/voiceClient';
import { useNavigate } from 'react-router-dom';

// Drive-through style voice ordering: AI agent speaks, customer speaks back.
// Uses the browser's Web Speech API — no server-side audio needed.

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recog = new SR();
  recog.continuous = false;
  recog.interimResults = false;
  recog.lang = 'en-US';
  return recog;
}

function VoiceOrder() {
  React.useEffect(() => { warmVoices(); }, []);
  const serverTtsRef = useRef(false);
  React.useEffect(() => { getVoiceStatus().then(v => { serverTtsRef.current = v.tts; }); }, []);
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // { role: 'agent'|'you', text }
  const [state, setState] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [typed, setTyped] = useState('');
  const [voiceReady, setVoiceReady] = useState(false);
  const recogRef = useRef(null);
  const messagesEndRef = useRef(null);

  const speak = useCallback((text) => {
    const browserSpeak = () => {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utter = tuneUtterance(new SpeechSynthesisUtterance(text));
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
    };
    if (serverTtsRef.current) {
      speakServer(text, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
        .catch(() => { setSpeaking(false); browserSpeak(); });
      return;
    }
    browserSpeak();
  }, []);

  // Load voices (some browsers load them async).
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoiceReady(true);
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // Kick off a session
  const startSession = useCallback(async () => {
    setMessages([]);
    setState(null);
    try {
      const res = await fetch('/api/agent/session', { method: 'POST' });
      const data = await res.json();
      setSessionId(data.sessionId);
      setState(data.state);
      setMessages([{ role: 'agent', text: data.reply }]);
      speak(data.reply);
    } catch {
      setMessages([{ role: 'agent', text: 'Could not reach the order assistant. Please try again.' }]);
    }
  }, [speak]);

  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendToAgent = useCallback(async (text) => {
    if (!text.trim() || !sessionId) return;
    setMessages(m => [...m, { role: 'you', text }]);
    try {
      const res = await fetch('/api/agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      setState(data.state);
      setMessages(m => [...m, { role: 'agent', text: data.reply }]);
      speak(data.reply);

      // If the order was placed, hand off to the tracker page.
      if (data.orderId) {
        setTimeout(() => navigate(`/order/${data.orderId}`), 5500);
      }
    } catch {
      setMessages(m => [...m, { role: 'agent', text: 'Sorry, something went wrong.' }]);
    }
  }, [sessionId, speak, navigate]);

  const startListening = useCallback(() => {
    if (!sessionId) return;
    const recog = getSpeechRecognition();
    if (!recog) return;
    recogRef.current = recog;
    setListening(true);
    recog.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setListening(false);
      sendToAgent(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    try { recog.start(); } catch {}
  }, [sendToAgent, sessionId]);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const handleTypedSubmit = (e) => {
    e.preventDefault();
    if (!typed.trim()) return;
    const t = typed;
    setTyped('');
    sendToAgent(t);
  };

  const orderTotal = state?.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;

  return (
    <div className="voice-page">
      <div className="voice-header">
        <h1>🎙️ Order by Voice</h1>
        <p>Talk to our AI order assistant — just like pulling up to the speaker.</p>
      </div>

      <div className="voice-layout">
        <div className="voice-main">
          <div className={`voice-orb ${speaking ? 'speaking' : listening ? 'listening' : ''}`}>
            <div className="voice-orb-inner">
              {speaking ? '🗣️' : listening ? '👂' : '🤖'}
            </div>
          </div>

          <div className="voice-status">
            {!sessionId && <span>Tap "Start Order" to begin.</span>}
            {sessionId && speaking && <span>Agent is speaking...</span>}
            {sessionId && listening && <span>Listening — speak now.</span>}
            {sessionId && !speaking && !listening && <span>Tap the mic and say what you'd like.</span>}
          </div>

          <div className="voice-controls">
            {!sessionId ? (
              <button className="btn-primary btn-large" onClick={startSession} disabled={!voiceReady}>
                🎙️ Start Order
              </button>
            ) : (
              <>
                <button
                  className={`mic-btn ${listening ? 'active' : ''}`}
                  onClick={listening ? stopListening : startListening}
                  disabled={speaking || !supported}
                >
                  {listening ? '🛑 Stop' : '🎤 Hold to Speak'}
                </button>
                <button className="btn-secondary" onClick={startSession}>
                  🔄 Restart
                </button>
              </>
            )}
          </div>

          {!supported && (
            <p className="voice-warning">
              Your browser doesn't support voice input. You can still type below.
            </p>
          )}

          {sessionId && (
            <form className="voice-typed" onSubmit={handleTypedSubmit}>
              <input
                type="text"
                placeholder="Or type what you'd say..."
                value={typed}
                onChange={e => setTyped(e.target.value)}
              />
              <button type="submit" className="btn-secondary">Send</button>
            </form>
          )}
        </div>

        <div className="voice-side">
          <div className="voice-transcript">
            <h3>Conversation</h3>
            <div className="transcript-log">
              {messages.length === 0 && <p className="transcript-empty">Conversation will appear here.</p>}
              {messages.map((m, i) => (
                <div key={i} className={`transcript-line ${m.role}`}>
                  <span className="transcript-role">{m.role === 'agent' ? '🤖 Agent' : '🧑 You'}</span>
                  <span className="transcript-text">{m.text}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {state && (
            <div className="voice-order-card">
              <h3>Order in progress</h3>
              {state.restaurant && <div className="voice-meta">🍽️ {state.restaurant.name}</div>}
              {state.name && <div className="voice-meta">👤 {state.name}</div>}
              {state.phone && <div className="voice-meta">📞 {state.phone}</div>}
              {state.items?.length ? (
                <>
                  <ul className="voice-items">
                    {state.items.map(i => (
                      <li key={i.id}>
                        <span>{i.quantity}x {i.name}</span>
                        <span>${(i.price * i.quantity).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="voice-total">
                    <span>Subtotal</span>
                    <strong>${orderTotal.toFixed(2)}</strong>
                  </div>
                </>
              ) : (
                <p className="voice-empty">No items yet.</p>
              )}
              {state.pickupCode && (
                <div className="voice-pickup-code">
                  Pickup code: <strong>{state.pickupCode}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VoiceOrder;
