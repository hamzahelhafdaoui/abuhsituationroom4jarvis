import test from "node:test";
import assert from "node:assert/strict";
import { speechRequest, transcriptionRequest, voiceStatus } from "../voice.mjs";
const env = { ELEVENLABS_API_KEY: "elevenlabs-test-secret", ELEVENLABS_VOICE_ID: "my-voice" };
test("ElevenLabs voice selection is independent of the reasoning provider", () => {
  const request = speechRequest("Nyala workspace ready.", env);
  assert.match(request.url, /api\.elevenlabs\.io\/v1\/text-to-speech\/my-voice/);
  assert.equal(request.headers["xi-api-key"], env.ELEVENLABS_API_KEY);
  assert.equal(JSON.parse(request.body).model_id, "eleven_multilingual_v2");
  assert.ok(!request.url.includes(env.ELEVENLABS_API_KEY));
  assert.equal(voiceStatus(env).voiceProvider, "elevenlabs");
});
test("ElevenLabs-only accounts can transcribe without an OpenAI key", () => {
  const request = transcriptionRequest(Buffer.from("test-audio"), "audio/webm", env);
  assert.equal(request.url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(request.body.get("model_id"), "scribe_v1");
  assert.equal(request.body.get("file").name, "recording.webm");
  assert.equal(voiceStatus(env).transcription, true);
});
test("missing voice ID cannot silently switch to a different cloud voice", () => {
  const incomplete = { ELEVENLABS_API_KEY: "secret", OPENAI_API_KEY: "other" };
  assert.equal(voiceStatus(incomplete).voice, false);
  assert.throws(() => speechRequest("Hello", incomplete), /not configured/);
  assert.equal(voiceStatus(incomplete).transcription, true);
});
test("status never includes the ElevenLabs credential", () => {
  assert.ok(!JSON.stringify(voiceStatus(env)).includes(env.ELEVENLABS_API_KEY));
});
