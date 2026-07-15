// Client for the natural-voice backend (/api/voice/*).
// If the server has no ElevenLabs key, callers fall back to the browser's
// speechSynthesis / SpeechRecognition.

let status = null;

export async function getVoiceStatus() {
  if (status) return status;
  try {
    const res = await fetch('/api/voice/status');
    status = await res.json();
  } catch {
    status = { tts: false, stt: false };
  }
  return status;
}

// Speak text through ElevenLabs. Resolves when playback ends.
// Throws if generation/playback fails so the caller can fall back.
export function speakServer(text, { onStart, onEnd } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('tts failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onplay = () => onStart?.();
      audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('playback failed')); };
      await audio.play(); // rejects if autoplay is blocked -> caller falls back
    } catch (e) {
      reject(e);
    }
  });
}

// Record one utterance from the mic, stopping after ~1.4s of silence
// (or maxMs), then transcribe it on the server. Returns { text, language }.
export async function listenServer({ maxMs = 12000, silenceMs = 1400, onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  // Silence detection via RMS level
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  await new Promise((resolve) => {
    let lastSound = Date.now();
    let spoke = false;
    const started = Date.now();
    recorder.onstop = resolve;
    recorder.start();

    const tick = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / buf.length);
      onLevel?.(rms);
      if (rms > 0.02) { lastSound = Date.now(); spoke = true; }
      const quietFor = Date.now() - lastSound;
      const total = Date.now() - started;
      if ((spoke && quietFor > silenceMs) || total > maxMs || (!spoke && total > 6000)) {
        clearInterval(tick);
        recorder.stop();
      }
    }, 100);
  });

  stream.getTracks().forEach(t => t.stop());
  ctx.close().catch(() => {});

  const blob = new Blob(chunks, { type: mime || 'audio/webm' });
  if (blob.size < 2000) return { text: '', language: 'en' }; // nothing said

  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error('stt failed');
  return res.json();
}
