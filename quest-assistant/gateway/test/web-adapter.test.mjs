import test from "node:test";
import assert from "node:assert/strict";
import { createWebHandler } from "../web-adapter.mjs";
const token = "a-private-token-at-least-24-characters";
test("embedded gateway keeps token protection and permits only the native origin for CORS", async () => {
  const handle = createWebHandler({ ASSISTANT_TOKEN: token });
  const denied = await handle(new Request("https://room.example/api/assistant/api/status"));
  assert.equal(denied.status, 401);
  const allowed = await handle(new Request("https://room.example/api/assistant/api/status", {
    headers: { Authorization: "Bearer " + token, Origin: "https://appassets.androidplatform.net" },
  }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://appassets.androidplatform.net");
  assert.equal((await allowed.json()).providers.length, 3);
});
test("embedded chat returns the same validated provider plan as the standalone backend", async () => {
  const handle = createWebHandler({ ASSISTANT_TOKEN: token, XAI_API_KEY: "test-key" }, async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Ready","actions":[{"type":"navigate","place":"nyala"}]}' } }] }), {
      headers: { "Content-Type": "application/json" },
    }));
  const res = await handle(new Request("https://room.example/api/assistant/api/chat", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "grok", prompt: "Nyala" }),
  }));
  assert.equal(res.status, 200); assert.equal((await res.json()).actions[0].place, "nyala");
});

test("voice catalog stays behind the access token and selected voice reaches ElevenLabs speech", async () => {
  const calls = [];
  const handle = createWebHandler({ ASSISTANT_TOKEN: token, ELEVENLABS_API_KEY: "private-test-key" }, async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/v2/voices")) return new Response(JSON.stringify({
      voices: [{ voice_id: "chosen123", name: "Assistant", labels: {} }], has_more: false,
    }));
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
  });
  const denied = await handle(new Request("https://room.example/api/assistant/api/voices"));
  assert.equal(denied.status, 401); assert.equal(calls.length, 0);
  const listed = await handle(new Request("https://room.example/api/assistant/api/voices", {
    headers: { Authorization: "Bearer " + token },
  }));
  assert.equal(listed.status, 200);
  const body = await listed.json();
  assert.equal(body.voices[0].id, "chosen123");
  assert.ok(!JSON.stringify(body).includes("private-test-key"));
  const spoken = await handle(new Request("https://room.example/api/assistant/api/speech", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Nyala ready", voiceId: "chosen123" }),
  }));
  assert.equal(spoken.status, 200);
  assert.match(calls[1].url, /text-to-speech\/chosen123/);
  assert.equal(calls[1].options.headers["xi-api-key"], "private-test-key");
  const bad = await handle(new Request("https://room.example/api/assistant/api/speech", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Ready", voiceId: "../bad" }),
  }));
  assert.equal(bad.status, 400); assert.equal(calls.length, 2);
});
