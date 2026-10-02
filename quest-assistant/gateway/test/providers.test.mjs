import test from "node:test";
import assert from "node:assert/strict";
import { providerRequest, providerStatus, chat } from "../providers.mjs";
import { authorized } from "../server.mjs";
const env = { OPENAI_API_KEY: "openai-test", XAI_API_KEY: "grok-test", GEMINI_API_KEY: "gemini-test" };
const messages = [{ role: "system", content: "Instructions" }, { role: "user", content: "Hello" }];
test("each provider uses the right endpoint and server-side authorization format", () => {
  const openai = providerRequest("openai", messages, env);
  const grok = providerRequest("grok", messages, env);
  const gemini = providerRequest("gemini", messages, env);
  assert.equal(openai.headers.Authorization, "Bearer openai-test");
  assert.equal(grok.url, "https://api.x.ai/v1/chat/completions");
  assert.equal(gemini.headers["x-goog-api-key"], "gemini-test");
  assert.equal(gemini.body.contents[0].role, "user");
  assert.deepEqual(gemini.body.systemInstruction.parts, [{ text: "Instructions" }]);
  assert.ok(!gemini.url.includes("gemini-test"));
});
test("status exposes availability and model names, never API keys", () => {
  const status = JSON.stringify(providerStatus(env));
  for (const key of Object.values(env)) assert.ok(!status.includes(key));
  assert.equal(providerStatus({}).filter(p => p.configured).length, 0);
});
test("a provider response becomes a validated plan; a dangerous action is refused", async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({
    choices: [{ message: { content: JSON.stringify({ reply: "Ready", actions: [{ type: "navigate", place: "nyala" }] }) } }],
  }) });
  const result = await chat({ provider: "openai", prompt: "Nyala" }, env, fetcher);
  assert.equal(result.actions[0].place, "nyala");
  await assert.rejects(() => chat({ provider: "openai", prompt: "Go" }, env, async () => ({
    ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"","actions":[{"type":"delete_all"}]}' } }] }),
  })), /Unsupported/);
});
test("missing keys and upstream failures stay failures, with no substituted AI answer", async () => {
  await assert.rejects(() => chat({ provider: "grok", prompt: "Hello" }, {}, async () => { throw new Error("must not fetch"); }), /not configured/);
  await assert.rejects(() => chat({ provider: "gemini", prompt: "Hello" }, env, async () => ({ ok: false, status: 429 })), /HTTP 429/);
});
test("gateway requires the exact backend access token and rejects short tokens", () => {
  const token = "a-private-token-at-least-24-characters";
  assert.equal(authorized("Bearer " + token, token), true);
  assert.equal(authorized("Bearer wrong", token), false);
  assert.equal(authorized("Bearer short", "short"), false);
});
