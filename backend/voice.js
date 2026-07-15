// ElevenLabs voice: natural multilingual TTS + speech-to-text.
// Configure with env vars; everything falls back gracefully when unset:
//   ELEVENLABS_API_KEY   - required to enable
//   ELEVENLABS_VOICE_ID  - optional (defaults to "Rachel")
const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

function available() {
  return Boolean(KEY);
}

// Text -> MP3 audio buffer (multilingual model: speaks the language of the text)
async function tts(text) {
  const res = await fetch(`${API}/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Audio buffer -> { text, language } (Scribe auto-detects the spoken language)
async function stt(audioBuffer, mimeType = 'audio/webm') {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'utterance.webm');
  const res = await fetch(`${API}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs STT failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: data.text || '', language: data.language_code || 'en' };
}

module.exports = { available, tts, stt };
