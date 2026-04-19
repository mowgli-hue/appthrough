import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recog = new SR();
  recog.continuous = false;
  recog.interimResults = false;
  recog.lang = 'en-US';
  return recog;
}

// --- Camera motion detector ------------------------------------------------
// Uses getUserMedia to capture frames, compares consecutive frames on a hidden
// canvas, and fires onMotion when the pixel-diff exceeds a threshold.

function useMotionSensor({ enabled, onMotion, sensitivity = 30, threshold = 8 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const prevFrameRef = useRef(null);
  const streamRef = useRef(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let animId;
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    videoRef.current = video;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 160, height: 120 },
        });
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        detectLoop();
      } catch {
        // Camera not available — sensor won't work, tap still works
      }
    };

    const detectLoop = () => {
      ctx.drawImage(video, 0, 0, 160, 120);
      const frame = ctx.getImageData(0, 0, 160, 120);
      const data = frame.data;

      if (prevFrameRef.current && !cooldownRef.current) {
        const prev = prevFrameRef.current;
        let diffCount = 0;
        // Sample every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) {
          const dr = Math.abs(data[i] - prev[i]);
          const dg = Math.abs(data[i + 1] - prev[i + 1]);
          const db = Math.abs(data[i + 2] - prev[i + 2]);
          if (dr + dg + db > sensitivity) diffCount++;
        }
        const totalSampled = data.length / 16;
        const diffPercent = (diffCount / totalSampled) * 100;

        if (diffPercent > threshold) {
          cooldownRef.current = true;
          onMotion();
          // 10s cooldown to avoid re-triggering
          setTimeout(() => { cooldownRef.current = false; }, 10000);
        }
      }

      prevFrameRef.current = new Uint8ClampedArray(data);
      animId = requestAnimationFrame(detectLoop);
    };

    startCamera();

    return () => {
      cancelAnimationFrame(animId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [enabled, onMotion, sensitivity, threshold]);

  return { videoRef };
}

// ---------------------------------------------------------------------------

function Kiosk() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [popular, setPopular] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [typed, setTyped] = useState('');
  const [screen, setScreen] = useState('idle');
  const [countdown, setCountdown] = useState(null);
  const [sensorStatus, setSensorStatus] = useState('waiting'); // waiting | detected
  const recogRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetch(`/api/restaurants/${restaurantId}/kiosk`)
      .then(r => r.json())
      .then(data => {
        setRestaurant(data.restaurant);
        setPopular(data.popular || []);
      });
  }, [restaurantId]);

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => /en-?US/i.test(v.lang) && /female|samantha|google/i.test(v.name)) ||
      voices.find(v => /en-?US/i.test(v.lang)) ||
      voices[0];
    if (preferred) utter.voice = preferred;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, []);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {};
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-reset after order placed
  useEffect(() => {
    if (screen !== 'placed') return;
    let t = 30;
    setCountdown(t);
    const interval = setInterval(() => {
      t--;
      setCountdown(t);
      if (t <= 0) { clearInterval(interval); resetKiosk(); }
    }, 1000);
    return () => clearInterval(interval);
  }, [screen]); // resetKiosk is stable via useCallback

  const resetKiosk = useCallback(() => {
    setScreen('idle');
    setSessionId(null);
    setMessages([]);
    setState(null);
    setCountdown(null);
    setSensorStatus('waiting');
    window.speechSynthesis?.cancel();
  }, []);

  const startSession = useCallback(async () => {
    setScreen('ordering');
    setSensorStatus('detected');
    setMessages([]);
    setState(null);
    try {
      const res = await fetch('/api/agent/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setState(data.state);
      setMessages([{ role: 'agent', text: data.reply }]);
      speak(data.reply);
    } catch {
      setMessages([{ role: 'agent', text: 'Could not start. Please tap to try again.' }]);
    }
  }, [restaurantId, speak]);

  // --- Motion sensor: auto-start session when someone walks up ---
  const handleMotionDetected = useCallback(() => {
    if (screen === 'idle') {
      setSensorStatus('detected');
      startSession();
    }
  }, [screen, startSession]);

  useMotionSensor({
    enabled: screen === 'idle',
    onMotion: handleMotionDetected,
    sensitivity: 35,
    threshold: 10,
  });

  const sendToAgent = useCallback(async (text) => {
    if (!text.trim()) return;
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
      if (data.orderId) {
        setTimeout(() => setScreen('placed'), 4000);
      }
    } catch {
      setMessages(m => [...m, { role: 'agent', text: 'Sorry, something went wrong.' }]);
    }
  }, [sessionId, speak]);

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
    sendToAgent(typed);
    setTyped('');
  };

  const orderTotal = state?.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;
  const tax = Math.round(orderTotal * 0.08 * 100) / 100;
  const grandTotal = Math.round((orderTotal + tax) * 100) / 100;

  if (!restaurant) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  // IDLE SCREEN — waiting for walk-up (camera sensor + tap fallback)
  if (screen === 'idle') {
    return (
      <div className="kiosk-page">
        <div className="kiosk-idle" onClick={startSession}>
          <div className="kiosk-idle-bg" style={{ backgroundImage: `url(${restaurant.image})` }} />
          <div className="kiosk-idle-overlay">
            <div className="kiosk-idle-content">
              <h1>{restaurant.name}</h1>
              <div className="kiosk-idle-icon">
                <div className="kiosk-pulse-ring" />
                <div className="kiosk-pulse-ring kiosk-pulse-ring-2" />
                <span>🚶</span>
              </div>
              <h2>Walk up to order</h2>
              <p>Step forward — the sensor will detect you automatically</p>
              <div className="kiosk-sensor-badge">
                <span className="kiosk-sensor-dot" />
                {sensorStatus === 'waiting' ? 'Sensor active — watching for customers' : 'Customer detected!'}
              </div>
              <div className="kiosk-idle-features">
                <span>🎤 Voice ordering</span>
                <span>📱 Phone notifications</span>
                <span>⏱️ Skip the line</span>
                <span>💰 No delivery fee</span>
              </div>
              <p className="kiosk-idle-tap">or tap anywhere to start</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PLACED SCREEN
  if (screen === 'placed' && state?.pickupCode) {
    return (
      <div className="kiosk-page">
        <div className="kiosk-placed">
          <div className="kiosk-placed-content">
            <span className="kiosk-placed-icon">🎉</span>
            <h1>Order Placed!</h1>
            <div className="kiosk-placed-code-box">
              <div className="kiosk-placed-code-label">Your pickup code</div>
              <div className="kiosk-placed-code">{state.pickupCode}</div>
            </div>
            <p className="kiosk-placed-msg">
              We'll text <strong>{state.phone}</strong> when your food is ready.
              <br />Just show this code to the staff.
            </p>
            <div className="kiosk-placed-total">
              Total: <strong>${grandTotal.toFixed(2)}</strong>
            </div>
            <div className="kiosk-reset-timer">
              Screen resets in {countdown}s
            </div>
            <button className="btn-secondary" onClick={resetKiosk}>
              Done — Next Customer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ORDERING SCREEN
  return (
    <div className="kiosk-page">
      <div className="kiosk-ordering">
        <div className="kiosk-top-bar">
          <h2>{restaurant.name}</h2>
          <div className="kiosk-top-right">
            <span className="kiosk-sensor-badge-sm"><span className="kiosk-sensor-dot" /> Sensor active</span>
            <button className="btn-secondary kiosk-cancel" onClick={resetKiosk}>Cancel</button>
          </div>
        </div>

        <div className="kiosk-body">
          <div className="kiosk-conversation">
            <div className={`kiosk-orb ${speaking ? 'speaking' : listening ? 'listening' : ''}`}>
              {speaking ? '🗣️' : listening ? '👂' : '🤖'}
            </div>

            <div className="kiosk-transcript">
              {messages.map((m, i) => (
                <div key={i} className={`kiosk-msg ${m.role}`}>
                  <span className="kiosk-msg-role">{m.role === 'agent' ? '🤖' : '🧑'}</span>
                  <span className="kiosk-msg-text">{m.text}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="kiosk-input-area">
              <button
                className={`kiosk-mic-btn ${listening ? 'active' : ''}`}
                onClick={listening ? stopListening : startListening}
                disabled={speaking}
              >
                {listening ? '🛑 Listening...' : '🎤 Tap to Speak'}
              </button>
              <form className="kiosk-typed" onSubmit={handleTypedSubmit}>
                <input
                  type="text"
                  placeholder="Or type here..."
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                />
                <button type="submit">Send</button>
              </form>
            </div>

            {popular.length > 0 && (!state?.items?.length) && (
              <div className="kiosk-quick-picks">
                <h4>Quick picks — tap to add:</h4>
                <div className="kiosk-quick-grid">
                  {popular.slice(0, 6).map(item => (
                    <button
                      key={item.id}
                      className="kiosk-quick-item"
                      onClick={() => sendToAgent(`I'd like the ${item.name}`)}
                    >
                      <span className="kiosk-quick-name">{item.name}</span>
                      <span className="kiosk-quick-price">${item.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="kiosk-order-panel">
            <h3>Your Order</h3>
            {state?.items?.length ? (
              <>
                <ul className="kiosk-items">
                  {state.items.map(i => (
                    <li key={i.id}>
                      <span>{i.quantity}x {i.name}</span>
                      <span>${(i.price * i.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="kiosk-order-totals">
                  <div><span>Subtotal</span><span>${orderTotal.toFixed(2)}</span></div>
                  <div><span>Tax</span><span>${tax.toFixed(2)}</span></div>
                  <div className="kiosk-grand-total"><span>Total</span><span>${grandTotal.toFixed(2)}</span></div>
                </div>
                <button
                  className="btn-primary kiosk-checkout-btn"
                  onClick={() => sendToAgent("that's it")}
                >
                  Checkout →
                </button>
              </>
            ) : (
              <p className="kiosk-empty-order">Speak or tap to add items</p>
            )}
            {state?.name && <div className="kiosk-order-meta">👤 {state.name}</div>}
            {state?.phone && <div className="kiosk-order-meta">📞 {state.phone}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Kiosk;
