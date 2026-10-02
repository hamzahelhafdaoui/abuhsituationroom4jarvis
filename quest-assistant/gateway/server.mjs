import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { chat, providerStatus } from "./providers.mjs";
import { speechRequest, transcriptionRequest, voiceStatus, listVoices } from "./voice.mjs";
const PUBLIC = fileURLToPath(new URL("./public/", import.meta.url));
const STATIC = new Set(["/index.html", "/app.mjs", "/style.css", "/protocol.mjs",
  "/vendor/leaflet.js", "/vendor/leaflet.css", "/vendor/leaflet-LICENSE.txt"]);
const MIME = { html: "text/html", mjs: "text/javascript", js: "text/javascript", css: "text/css", txt: "text/plain" };
export function authorized(header, token) {
  if (typeof token !== "string" || token.length < 24 || typeof header !== "string") return false;
  const a = Buffer.from(header), b = Buffer.from("Bearer " + token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
export function createHandler(env = process.env, fetcher = fetch) {
  const uses = new Map();
  return async function handler(req, res) {
    try {
      const origin = req.headers.origin;
      const allowed = new Set(["https://appassets.androidplatform.net", env.ASSISTANT_UI_ORIGIN].filter(Boolean));
      if (origin && allowed.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(origin && allowed.has(origin) ? 204 : 403); res.end(); return;
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (!path.startsWith("/api/")) {
        if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
        const target = path === "/" ? "/index.html" : path;
        if (!STATIC.has(target)) return json(res, 404, { error: "Not found." });
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; media-src 'self' blob:; frame-src https:; object-src 'none'; base-uri 'self'");
        const data = await readFile(join(PUBLIC, target.slice(1)));
        res.writeHead(200, { "Content-Type": MIME[target.split(".").pop()] || "text/plain" });
        res.end(data); return;
      }
      if (!authorized(req.headers.authorization, env.ASSISTANT_TOKEN))
        return json(res, 401, { error: "Configure the backend access token to connect." });
      if (path === "/api/status" && req.method === "GET") return json(res, 200, {
        providers: providerStatus(env), ...voiceStatus(env),
      });
      const voiceList = path === "/api/voices" && req.method === "GET";
      if (req.method !== "POST" && !voiceList) return json(res, 405, { error: "Method not allowed." });
      if (!voiceList && !["/api/chat", "/api/transcribe", "/api/speech"].includes(path))
        return json(res, 404, { error: "Not found." });
      const minute = Math.floor(Date.now() / 60000);
      const count = uses.get(minute) || 0;
      for (const key of uses.keys()) if (key !== minute) uses.delete(key);
      if (count >= 12) return json(res, 429, { error: "Request limit reached. Try again in a minute." });
      uses.set(minute, count + 1);
      if (voiceList) return json(res, 200, await listVoices(env, fetcher, new URL(req.url, "http://localhost").searchParams.get("cursor") || ""));
      if (path === "/api/chat") {
        const input = JSON.parse((await readBody(req, 64000)).toString("utf8"));
        return json(res, 200, await chat(input, env, fetcher));
      }
      let request;
      if (path === "/api/transcribe") {
        const mime = String(req.headers["content-type"] || "").split(";")[0];
        request = transcriptionRequest(await readBody(req, 8 * 1024 * 1024), mime, env);
      } else {
        const input = JSON.parse((await readBody(req, 20000)).toString("utf8"));
        request = speechRequest(input.text, env, input.voiceId);
      }
      const upstream = await fetcher(request.url, {
        method: "POST", headers: request.headers, body: request.body,
        signal: AbortSignal.timeout(45000),
      });
      if (!upstream.ok) return json(res, 502, { error: "Voice provider returned HTTP " + upstream.status + "." });
      if (path === "/api/transcribe") {
        const body = await upstream.json();
        if (typeof body.text !== "string" || body.text.length > 4000) return json(res, 502, { error: "No usable transcript returned." });
        return json(res, 200, { text: body.text });
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
      res.end(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Assistant request failed.";
      const safe = /too large|prompt|Unknown|not configured|returned HTTP|invalid|Invalid|Unsupported|Unknown|Workspace|numbered|layer|location|usable|plan|Speech text|Empty audio|Voice selection/.test(message)
        ? message : "Request failed. Check the backend connection and provider settings.";
      json(res, message.includes("too large") ? 413 : 400, { error: safe });
    }
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.env.ASSISTANT_TOKEN || process.env.ASSISTANT_TOKEN.length < 24)
    throw new Error("Set ASSISTANT_TOKEN to a random access token of at least 24 characters.");
  createServer(createHandler()).listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.log("Assistant backend ready."));
}
