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
