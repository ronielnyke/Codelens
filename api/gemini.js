// Vercel serverless function: Gemini text + voice. The key stays on the server (GEMINI_API_KEY).
// Models are tried in order, so if Google retires one the next one is used automatically.
const TEXT_MODELS = [
  process.env.GEMINI_TEXT_MODEL,
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash'
].filter(Boolean);

const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL,
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview'
].filter(Boolean);

const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Zephyr'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callModel(model, requestBody, apiKey) {
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody)
    }
  );
  let data = {};
  try { data = await upstream.json(); } catch (e) {}
  return { ok: upstream.ok, status: upstream.status, data };
}

async function tryModels(models, requestBody, apiKey) {
  let last = { status: 502, message: 'Gemini is not available right now.' };
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await callModel(model, requestBody, apiKey);
        if (r.ok) return { ok: true, data: r.data };
        last = { status: r.status, message: r.data?.error?.message || 'Gemini request failed.' };
        // Temporary overload: wait a moment and retry the same model once.
        if ((r.status === 503 || r.status === 500) && attempt === 0) { await sleep(800); continue; }
        break; // 404 / 400 / 429 / "no longer available": go to the next model
      } catch (e) {
        last = { status: 502, message: 'Could not reach Gemini.' };
        break;
      }
    }
  }
  return { ok: false, ...last };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST for this endpoint.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing from Vercel Environment Variables.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  if (body.mode === 'text') {
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return res.status(400).json({ error: 'A prompt is required.' });
    }
    const result = await tryModels(TEXT_MODELS, {
      contents: [{ parts: [{ text: body.prompt.slice(0, 30000) }] }]
    }, apiKey);
    if (!result.ok) return res.status(result.status >= 400 ? result.status : 502).json({ error: result.message });
    const text = (result.data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) return res.status(502).json({ error: 'Gemini returned no text.' });
    return res.status(200).json({ text });
  }

  if (body.mode === 'tts') {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return res.status(400).json({ error: 'Text is required for voice.' });
    }
    const voice = VOICES.includes(body.voice) ? body.voice : 'Kore';
    const result = await tryModels(TTS_MODELS, {
      contents: [{ parts: [{ text: body.text.slice(0, 4000) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    }, apiKey);
    if (!result.ok) return res.status(result.status >= 400 ? result.status : 502).json({ error: result.message });
    const part = result.data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    const audio = part?.inlineData?.data;
    if (typeof audio !== 'string' || !audio.length) {
      return res.status(502).json({ error: 'Gemini returned no audio data.' });
    }
    return res.status(200).json({ audio, mimeType: part.inlineData.mimeType || 'audio/wav' });
  }

  return res.status(400).json({ error: 'Mode must be text or tts.' });
}
