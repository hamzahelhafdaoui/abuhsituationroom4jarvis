export function voiceStatus(env = process.env, voiceId = "") {
  const voiceProvider = env.VOICE_PROVIDER || (env.ELEVENLABS_API_KEY ? "elevenlabs" : "openai");
  const transcriptionProvider = env.TRANSCRIPTION_PROVIDER || (env.ELEVENLABS_API_KEY ? "elevenlabs" : "openai");
  return {
    voiceProvider,
    voiceSelection: voiceProvider === "elevenlabs" && Boolean(env.ELEVENLABS_API_KEY),
    voice: voiceProvider === "elevenlabs" ? Boolean(env.ELEVENLABS_API_KEY && (voiceId || env.ELEVENLABS_VOICE_ID))
      : voiceProvider === "openai" && Boolean(env.OPENAI_API_KEY),
    transcriptionProvider,
    transcription: transcriptionProvider === "elevenlabs" ? Boolean(env.ELEVENLABS_API_KEY)
      : transcriptionProvider === "openai" && Boolean(env.OPENAI_API_KEY),
  };
}
export function speechRequest(text, env = process.env, voiceId = "") {
  if (typeof text !== "string" || !text.trim() || text.length > 4000)
    throw new Error("Speech text must contain between 1 and 4,000 characters.");
  if (typeof voiceId !== "string" || (voiceId && !validVoiceId(voiceId)))
    throw new Error("Invalid ElevenLabs voice ID.");
  const status = voiceStatus(env, voiceId);
  if (voiceId && status.voiceProvider !== "elevenlabs")
    throw new Error("Voice selection is only available for ElevenLabs.");
  if (!status.voice) throw new Error("Cloud voice is not configured. Set the ElevenLabs key and voice ID on the backend.");
  if (status.voiceProvider === "elevenlabs") return {
    url: "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId || env.ELEVENLABS_VOICE_ID) + "?output_format=mp3_44100_128",
    headers: { "Content-Type": "application/json", "xi-api-key": env.ELEVENLABS_API_KEY },
    body: JSON.stringify({
      text, model_id: env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2",
      voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
  };
  return {
    url: "https://api.openai.com/v1/audio/speech",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: env.OPENAI_TTS_VOICE || "cedar",
      input: text, response_format: "mp3",
      instructions: "Original British assistant voice. Calm, precise, warm, understated dry wit. Brief pauses.",
    }),
  };
}
export function transcriptionRequest(audio, mime, env = process.env) {
  const extensions = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" };
  if (!extensions[mime]) throw new Error("Unsupported audio format.");
  if (!audio.length) throw new Error("Empty audio recording.");
  const status = voiceStatus(env);
  if (!status.transcription) throw new Error("Cloud transcription is not configured. Add an ElevenLabs or OpenAI API key on the backend.");
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), "recording." + extensions[mime]);
  if (status.transcriptionProvider === "elevenlabs") {
    form.append("model_id", env.ELEVENLABS_STT_MODEL || "scribe_v1");
    form.append("tag_audio_events", "false"); form.append("diarize", "false");
    return {
      url: "https://api.elevenlabs.io/v1/speech-to-text",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: form,
    };
  }
  form.append("model", env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe");
  return {
    url: "https://api.openai.com/v1/audio/transcriptions",
    headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: form,
  };
}

// Return only the voice information needed by the chooser; account details and keys stay server-side.
export function validVoiceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export async function listVoices(env = process.env, fetcher = fetch, cursor = "") {
  if (!voiceStatus(env).voiceSelection) throw new Error("ElevenLabs voice selection is not configured on the backend.");
  if (typeof cursor !== "string" || cursor.length > 1024 || /[\u0000-\u001f]/.test(cursor))
    throw new Error("Invalid voice-list cursor.");
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("page_size", "100");
  if (cursor) url.searchParams.set("next_page_token", cursor);
  const response = await fetcher(url.href, {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("ElevenLabs voice list returned HTTP " + response.status + ".");
  const data = await response.json();
  if (!Array.isArray(data.voices)) throw new Error("Invalid voice list returned by ElevenLabs.");
  // ElevenLabs may include extra default voices on the first page.
  const voices = data.voices.slice(0, 500).filter(row => validVoiceId(row?.voice_id) && typeof row.name === "string")
    .map(row => ({
      id: row.voice_id, name: row.name.slice(0, 100),
      description: [row.labels?.accent, row.labels?.gender, row.labels?.descriptive]
        .filter(value => typeof value === "string").map(value => value.slice(0, 60)).join(" · "),
    }));
  const nextCursor = data.has_more && typeof data.next_page_token === "string" && data.next_page_token.length <= 1024
    ? data.next_page_token : "";
  return { voices, nextCursor, defaultVoiceId: validVoiceId(env.ELEVENLABS_VOICE_ID) ? env.ELEVENLABS_VOICE_ID : "" };
}
