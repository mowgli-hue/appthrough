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

function useMotionSensor({ enabled, onMotion, sensitivity = 30, threshold = 8 }) {
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

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
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
      } catch {}
    };

    const detectLoop = () => {
      ctx.drawImage(video, 0, 0, 160, 120);
      const frame = ctx.getImageData(0, 0, 160, 120);
      const data = frame.data;

      if (prevFrameRef.current && !cooldownRef.current) {
        const prev = prevFrameRef.current;
        let diffCount = 0;
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
}

function Kiosk() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [popular, setPopular] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [screen, setScreen] = useState('idle'); // idle | ordering | payment | placed
  const [countdown, setCountdown] = useState(null);
  const [sensorStatus, setSensorStatus] = useState('waiting');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const recogRef = useRef(null);
  const messagesEndRef = useRef(null);
  const autoListenRef = useRef(true);
  const sessionIdRef = useRef(null);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    fetch(`/api/restaurants/${restaurantId}/kiosk`)
      .then(r => r.json())
      .then(data => {
        setRestaurant(data.restaurant);
        setPopular(data.popular || []);
      });
  }, [restaurantId]);

  // Auto-listen: start mic after agent finishes speaking
  const autoListen = useCallback(() => {
    if (!autoListenRef.current || !sessionIdRef.current) return;
    setTimeout(() => {
      if (!sessionIdRef.current) return;
      const recog = getSpeechRecognition();
      if (!recog) return;
      recogRef.current = recog;
      setListening(true);
      recog.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setListening(false);
        sendToAgentRef.current(transcript);
      };
      recog.onerror = () => setListening(false);
      recog.onend = () => setListening(false);
      try { recog.start(); } catch {}
    }, 600);
  }, []);

  const speak = useCallback((text, shouldAutoListen = true) => {
    if (!('speechSynthesis' in window)) {
      if (shouldAutoListen) autoListen();
      return;
    }
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
    utter.onend = () => {
      setSpeaking(false);
      if (shouldAutoListen) autoListen();
    };
    utter.onerror = () => {
      setSpeaking(false);
      if (shouldAutoListen) autoListen();
    };
    window.speechSynthesis.speak(utter);
  }, [autoListen]);

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
    let t = 20;
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
    setPaymentProcessing(false);
    autoListenRef.current = true;
    window.speechSynthesis?.cancel();
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} }
  }, []);

  const startSession = useCallback(async () => {
    setScreen('ordering');
    setSensorStatus('detected');
    setMessages([]);
    setState(null);
    autoListenRef.current = true;
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
      speak(data.reply, true);
    } catch {
      setMessages([{ role: 'agent', text: 'Could not start. Please step away and try again.' }]);
    }
  }, [restaurantId, speak]);

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
    if (!text.trim() || !sessionIdRef.current) return;
    setMessages(m => [...m, { role: 'you', text }]);
    try {
      const res = await fetch('/api/agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
      });
      const data = await res.json();
      setState(data.state);
      setMessages(m => [...m, { role: 'agent', text: data.reply }]);

      if (data.orderId) {
        // Order placed — go to payment screen
        autoListenRef.current = false;
        speak(data.reply, false);
        setTimeout(() => setScreen('payment'), 3000);
      } else {
        speak(data.reply, true);
      }
    } catch {
      setMessages(m => [...m, { role: 'agent', text: 'Sorry, something went wrong.' }]);
    }
  }, [speak]);

  const sendToAgentRef = useRef(sendToAgent);
  useEffect(() => { sendToAgentRef.current = sendToAgent; }, [sendToAgent]);

  // Simulate payment processing
  const handlePayment = useCallback(() => {
    setPaymentProcessing(true);
    setTimeout(() => {
      setPaymentProcessing(false);
      setScreen('placed');
    }, 3000);
  }, []);

  const orderTotal = state?.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;
  const tax = Math.round(orderTotal * 0.08 * 100) / 100;
  const grandTotal = Math.round((orderTotal + tax) * 100) / 100;

  if (!restaurant) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  // IDLE SCREEN
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
                <span>💳 Tap to pay</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PAYMENT SCREEN
  if (screen === 'payment') {
    return (
      <div className="kiosk-page">
        <div className="kiosk-payment">
          <div className="kiosk-payment-content">
            {paymentProcessing ? (
              <>
                <div className="kiosk-payment-icon kiosk-payment-processing">💳</div>
                <h1>Processing payment...</h1>
                <div className="kiosk-payment-spinner"><div className="spinner" /></div>
              </>
            ) : (
              <>
                <div className="kiosk-payment-icon">💳</div>
                <h1>Tap your card to pay</h1>
                <div className="kiosk-payment-amount">${grandTotal.toFixed(2)}</div>
                <div className="kiosk-payment-breakdown">
                  <span>Subtotal: ${orderTotal.toFixed(2)}</span>
                  <span>Tax: ${tax.toFixed(2)}</span>
                </div>
                <div className="kiosk-payment-pad" onClick={handlePayment}>
                  <div className="kiosk-pad-visual">
                    <div className="kiosk-pad-waves" />
                    <span>📲</span>
                  </div>
                  <p>Tap, insert, or swipe your card on the reader below</p>
                </div>
                <div className="kiosk-payment-items">
                  {state?.items?.map(i => (
                    <span key={i.id}>{i.quantity}x {i.name}</span>
                  ))}
                </div>
                <button className="btn-secondary" onClick={resetKiosk} style={{ marginTop: '1rem' }}>
                  Cancel Order
                </button>
              </>
            )}
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
            <h1>You're all set!</h1>
            <div className="kiosk-placed-code-box">
              <div className="kiosk-placed-code-label">Your pickup code</div>
              <div className="kiosk-placed-code">{state.pickupCode}</div>
            </div>
            <p className="kiosk-placed-msg">
              We'll text <strong>{state.phone}</strong> when your food is ready.
              <br />Show this code to the staff when you pick up.
            </p>
            <div className="kiosk-placed-total">
              Paid: <strong>${grandTotal.toFixed(2)}</strong>
            </div>
            <div className="kiosk-placed-enjoy">
              Walk away and relax — your phone will buzz when it's ready!
            </div>
            <div className="kiosk-reset-timer">
              Screen resets in {countdown}s
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ORDERING SCREEN — fully voice-driven, minimal touch
  return (
    <div className="kiosk-page">
      <div className="kiosk-ordering">
        <div className="kiosk-top-bar">
          <h2>{restaurant.name}</h2>
          <div className="kiosk-top-right">
            <span className="kiosk-sensor-badge-sm"><span className="kiosk-sensor-dot" /> Listening</span>
          </div>
        </div>

        <div className="kiosk-body">
          <div className="kiosk-conversation">
            <div className={`kiosk-orb kiosk-orb-large ${speaking ? 'speaking' : listening ? 'listening' : 'waiting'}`}>
              <div className="kiosk-orb-inner-ring" />
              {speaking ? '🗣️' : listening ? '👂' : '🤖'}
            </div>

            <div className="kiosk-voice-status">
              {speaking && 'Agent is speaking...'}
              {listening && 'Listening — speak now'}
              {!speaking && !listening && 'Processing...'}
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
              </>
            ) : (
              <p className="kiosk-empty-order">Just say what you'd like!</p>
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
