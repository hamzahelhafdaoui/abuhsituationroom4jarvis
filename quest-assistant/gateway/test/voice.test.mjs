import test from "node:test";
import assert from "node:assert/strict";
import { speechRequest, transcriptionRequest, voiceStatus, listVoices } from "../voice.mjs";
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

test("a headset-selected voice works without a backend default and remains independent of model keys", () => {
  const onlyKey = { ELEVENLABS_API_KEY: "test-secret" };
  assert.equal(voiceStatus(onlyKey).voice, false);
  assert.equal(voiceStatus(onlyKey).voiceSelection, true);
  const request = speechRequest("Ready", onlyKey, "selected_voice_123");
  assert.match(request.url, /text-to-speech\/selected_voice_123\?/);
  assert.throws(() => speechRequest("Ready", onlyKey, "../other"), /Invalid/);
  assert.throws(() => speechRequest("Ready", onlyKey, null), /Invalid/);
  assert.throws(() => speechRequest("Ready", { OPENAI_API_KEY: "test" }, "selected_voice_123"), /only available/);
});
test("voice catalog uses authenticated ElevenLabs pagination and returns only chooser fields", async () => {
  let called = 0;
  const result = await listVoices(env, async (url, options) => {
    called++;
    assert.equal(new URL(url).origin, "https://api.elevenlabs.io");
    assert.equal(new URL(url).pathname, "/v2/voices");
    assert.equal(new URL(url).searchParams.get("next_page_token"), "next+/page==");
    assert.equal(options.headers["xi-api-key"], env.ELEVENLABS_API_KEY);
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ voices: [
      { voice_id: "chosen123", name: "British assistant", labels: { accent: "British", gender: "male" }, owner_id: "private-owner", sharing: { original_voice_id: "private-voice" } },
      { voice_id: "../bad", name: "Reject path" },
    ], has_more: true, next_page_token: "page-two" }));
  }, "next+/page==");
  assert.equal(called, 1);
  assert.deepEqual(result.voices, [{ id: "chosen123", name: "British assistant", description: "British · male" }]);
  assert.equal(result.nextCursor, "page-two");
  assert.equal(result.defaultVoiceId, "my-voice");
  assert.ok(!JSON.stringify(result).includes("private-owner"));
  assert.ok(!JSON.stringify(result).includes(env.ELEVENLABS_API_KEY));
});
test("voice catalog rejects missing configuration, invalid cursors, and upstream errors", async () => {
  await assert.rejects(listVoices({}, () => assert.fail("No upstream call expected")), /not configured/);
  await assert.rejects(listVoices(env, () => assert.fail("No upstream call expected"), "x".repeat(1025)), /Invalid/);
  await assert.rejects(listVoices(env, async () => new Response("", { status: 403 })), /returned HTTP 403/);
  await assert.rejects(listVoices(env, async () => new Response("{}")), /Invalid voice list/);
});
