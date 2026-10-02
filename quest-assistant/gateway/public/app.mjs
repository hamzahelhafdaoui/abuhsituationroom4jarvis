import { PLACES, cleanFlags, demoPlan, stagePlan } from "./protocol.mjs";
const $ = id => document.getElementById(id);
// Sudan is UTC+2. Keep all five synthetic fixtures inside the current Khartoum day.
const demoNow = Date.now(), demoDayElapsed = (demoNow + 2 * 3600000) % 86400000;
const synthetic = Array.from({ length: 5 }, (_, i) => ({
  id: "demo-" + (i + 1), title: ["Example aid access report", "Example source comparison",
    "Example thermal anomaly for review", "Example infrastructure note", "Example document follow-up"][i],
  body: "Synthetic demonstration record. This is not an actual incident or current report.",
  lat: 12.053 + i * 0.009, lon: 24.881 + i * 0.012,
  date: new Date(demoNow - i * Math.min(3600000, demoDayElapsed / 5)).toISOString(),
  sourceLabel: "Synthetic demo fixture", confidence: "demonstration only", url: null,
}));
let state = {
  sourceMode: "demo", flags: synthetic, numbered: [], selected: null, diagram: [],
  timeZone: "Africa/Khartoum", layers: { firms: false, thermalRaster: false }, camera: { ...PLACES.sudan },
};
let config = { backend: "", token: "", room: "", voiceId: "" };
try { config = { ...config, ...JSON.parse(sessionStorage.getItem("quest-connection") || "{}") }; } catch {}
let connected = false, busy = false, revision = 0;
let requestAbort = null, voiceAbort = null, audio = null, audioUrl = null;
let recorder = null, recordingStream = null, recordTimer = null, cancelRecording = false;
let status = { providers: [], voice: false, transcription: false };
let voiceChoices = [], voiceCursor = "", voiceListAbort = null, voiceListRevision = 0;
const history = [], pending = new Map();
let map = null, flagMarkers = null, thermalMarkers = null, thermalArea = null;
if (window.L) {
  map = L.map("map", { zoomControl: true }).setView([state.camera.lat, state.camera.lon], state.camera.zoom);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  tiles.on("tileerror", () => { if (!connected) $("map-note").textContent = "Basemap tiles unavailable · demonstration markers remain synthetic"; });
  flagMarkers = L.layerGroup().addTo(map);
  thermalMarkers = L.layerGroup();
  thermalArea = L.layerGroup();
  for (const row of synthetic) {
    L.circleMarker([row.lat, row.lon], { radius: 5, color: "#76d4e8", fillOpacity: 0.6 })
      .bindTooltip(row.title + " · SYNTHETIC").addTo(flagMarkers);
    L.circleMarker([row.lat, row.lon], { radius: 12, color: "#76d4e8", fillOpacity: 0.2 }).addTo(thermalMarkers);
  }
  L.circle([12.053, 24.881], { radius: 1200, color: "#76d4e8", fillOpacity: 0.12 }).addTo(thermalArea);
} else {
  $("map").textContent = "Map library unavailable. Command and record controls remain usable.";
}
function message(text, role = "assistant") {
  const p = document.createElement("p");
  p.className = role + "-message"; p.textContent = text; $("conversation").append(p);
  while ($("conversation").childElementCount > 40) $("conversation").firstElementChild.remove();
  $("conversation").scrollTop = $("conversation").scrollHeight;
}
function activity(text) { $("activity").textContent = text; }
function render() {
  $("location").textContent = state.camera?.label || "Situation room";
  $("mode").textContent = connected ? "CONNECTED WORKSPACE" : "SYNTHETIC DEMO";
  $("mode").dataset.mode = state.sourceMode;
  $("coords").textContent = state.camera.lat.toFixed(3) + " / " + state.camera.lon.toFixed(3);
  $("firms").setAttribute("aria-pressed", String(Boolean(state.layers.firms)));
  $("thermal").setAttribute("aria-pressed", String(Boolean(state.layers.thermalRaster)));
  if (map && !connected) {
    map.setView([state.camera.lat, state.camera.lon], state.camera.zoom, { animate: false });
    for (const [group, on] of [[thermalMarkers, state.layers.firms], [thermalArea, state.layers.thermalRaster]]) {
      if (on && !map.hasLayer(group)) group.addTo(map);
      if (!on && map.hasLayer(group)) map.removeLayer(group);
    }
  }
  $("flags").replaceChildren();
  if (!state.numbered.length) {
    const li = document.createElement("li"); li.className = "empty";
    li.textContent = "No numbered records. Read today's records first."; $("flags").append(li);
  }
  state.numbered.forEach((row, i) => {
    const li = document.createElement("li"), button = document.createElement("button");
    button.type = "button"; button.setAttribute("aria-pressed", String(state.selected?.id === row.id));
    const n = document.createElement("span"); n.className = "number"; n.textContent = String(i + 1);
    const content = document.createElement("span"); content.textContent = row.title;
    const meta = document.createElement("small"); meta.textContent = row.sourceLabel + " · " + new Date(row.date).toLocaleTimeString("en-GB", { timeZone: state.timeZone });
    content.append(meta); button.append(n, content);
    button.onclick = () => execute({ reply: "", actions: [{ type: "select_flag", index: i + 1 }] }).catch(showError);
    li.append(button); $("flags").append(li);
  });
  const row = state.selected;
  $("evidence").hidden = !row;
  if (row) {
    $("evidence-title").textContent = row.title; $("evidence-body").textContent = row.body;
    $("evidence-meta").textContent = row.sourceLabel + " · " + row.date + " · confidence: " + row.confidence;
    $("evidence-link").hidden = !row.url;
    if (row.url) $("evidence-link").href = row.url;
  }
  if (state.diagram?.length) {
    const quote = text => '"' + String(text).replace(/[\\"]/g, "").replace(/[\r\n]/g, " ").slice(0, 240) + '"';
    $("diagram").value = "flowchart LR\n  W[Evidence workspace]\n" + state.diagram.map((r, i) =>
      "  W --> E" + i + "[" + quote(r.title) + "]\n  E" + i + " --> S" + i + "[" + quote(r.source) + "]").join("\n");
    $("diagram-panel").open = true;
  }
}
function showError(err) { message(err instanceof Error ? err.message : String(err), "error"); activity("Needs attention"); }
function cleanBackend(value) {
  if (!value.trim()) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Use an HTTPS backend URL without credentials, query strings or fragments.");
  return url.href.replace(/\/$/, "");
}
async function api(path, options = {}, connection = config) {
  if (!connection.backend || !connection.token) throw new Error("Connect an assistant backend and its access token first.");
  const response = await fetch(connection.backend + path, {
    ...options, headers: { Authorization: "Bearer " + connection.token, ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Backend returned HTTP " + response.status + ".");
  }
  return response;
}
function bridge(type, payload = {}) {
  if (!config.room) return Promise.reject(new Error("Connect a situation-room URL first."));
  const origin = new URL(config.room).origin, id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Situation-room bridge did not respond. Check deployment, allowed origin and embedding access.")); }, 8000);
    pending.set(id, { resolve, reject, timer, origin });
    $("room").contentWindow.postMessage({ type, id, ...payload }, origin);
  });
}
window.addEventListener("message", event => {
  const data = event.data;
  if (!data || event.source !== $("room").contentWindow) return;
  const job = pending.get(data.id);
  if (!job || event.origin !== job.origin || data.type !== "quest:response") return;
  clearTimeout(job.timer); pending.delete(data.id);
  if (data.error) job.reject(new Error(String(data.error)));
  else job.resolve(data.snapshot);
});
function adopt(snapshot) {
  if (!snapshot || !snapshot.camera || !Number.isFinite(snapshot.camera.lat) ||
      !Number.isFinite(snapshot.camera.lon)) throw new Error("Invalid workspace snapshot.");
  state = {
    ...state, ...snapshot, sourceMode: "live", flags: cleanFlags(snapshot.flags),
    numbered: cleanFlags(snapshot.numbered || []),
    selected: snapshot.selected ? cleanFlags([snapshot.selected])[0] || null : null,
  };
}
async function execute(plan) {
  if (busy) throw new Error("Wait for the current command or press Stop.");
  let outcomes;
  if (connected) { adopt(await bridge("quest:actions", { plan })); outcomes = state.lastOutcomes || []; }
  else { const staged = stagePlan(state, plan); state = staged.state; outcomes = staged.outcomes; }
  render();
  return outcomes.join(" ");
}
async function run(text) {
  if (busy || !text.trim()) return;
  busy = true; const turn = ++revision; requestAbort = new AbortController();
  $("send").disabled = true; activity("Thinking"); message(text, "user");
  try {
    if (connected) adopt(await bridge("quest:snapshot"));
    if (turn !== revision) return;
    const provider = $("provider").value;
    let plan;
    if (provider === "demo") plan = demoPlan(text);
    else {
      const res = await api("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, prompt: text, context: state, history }),
        signal: requestAbort.signal,
      });
      plan = await res.json();
    }
    if (turn !== revision) return;
    let outcomes;
    if (connected) {
      adopt(await bridge("quest:actions", { plan })); outcomes = state.lastOutcomes || [];
    } else {
      const staged = stagePlan(state, plan);
      state = staged.state; outcomes = staged.outcomes;
    }
    if (turn !== revision) return;
    render();
    const prefix = connected ? "" : "Synthetic demonstration. ";
    const spoken = outcomes.length ? prefix + outcomes.join(" ") : plan.reply;
    const modelTag = provider === "demo" ? "Demo controls" : (plan.provider + " / " + plan.model);
    message(modelTag + "\n" + (plan.actions.length ? spoken : plan.reply));
    history.push({ role: "user", content: text }, { role: "assistant", content: spoken || plan.reply });
    if (history.length > 16) history.splice(0, history.length - 16);
    activity("Ready");
    if ($("voice").checked) void speak(spoken || plan.reply, turn);
  } catch (err) { if (turn === revision && err.name !== "AbortError") showError(err); }
  finally { if (turn === revision) { busy = false; $("send").disabled = false; requestAbort = null; } }
}
function nativeRequest(data) {
  if (window.QuestNative?.postMessage) { window.QuestNative.postMessage(JSON.stringify(data)); return true; }
  return false;
}
function stopAudio() {
  voiceAbort?.abort(); voiceAbort = null;
  if (audio) { audio.pause(); audio = null; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  window.speechSynthesis?.cancel(); nativeRequest({ type: "stop" });
}
async function speak(text, turn, previewConnection = null) {
  stopAudio();
  const connection = previewConnection || config;
  const voiceId = previewConnection ? connection.voiceId : status.voiceProvider === "elevenlabs" ? config.voiceId : "";
  try {
    if (connection.backend && (previewConnection || status.voice || (status.voiceSelection && voiceId))) {
      voiceAbort = new AbortController(); activity("Generating voice");
      const res = await api("/api/speech", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000), voiceId }), signal: voiceAbort.signal,
      }, connection);
      const blob = await res.blob();
      if (turn !== revision) return;
      audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
      audio.onended = () => { stopAudio(); activity("Ready"); };
      await audio.play();
      if (previewConnection) $("voice-status").textContent = "Preview playing. Save the connection to keep this voice.";
      activity("Speaking · " + (status.voiceProvider === "elevenlabs" ? "ElevenLabs" : "AI voice"));
    } else if (nativeRequest({ type: "speak", text: text.slice(0, 4000) })) activity("Speaking · device voice");
    else if (window.speechSynthesis) {
      const voices = speechSynthesis.getVoices(), voice = voices.find(v => v.lang === "en-GB") || voices.find(v => v.lang.startsWith("en"));
      if (!voice) throw new Error("No device voice is available. Connect cloud voice or read the reply.");
      const speech = new SpeechSynthesisUtterance(text); speech.voice = voice; speech.rate = 0.95;
      speech.onend = () => activity("Ready"); speechSynthesis.speak(speech); activity("Speaking · device voice");
    } else throw new Error("No voice engine is available. Connect cloud voice to hear replies.");
  } catch (err) {
    if (turn === revision && err.name !== "AbortError") {
      if (previewConnection) { $("voice-status").textContent = err.message; activity("Needs attention"); }
      else showError(err);
    }
  }
}
function stop() {
  if (voiceListAbort) $("voice-status").textContent = "Voice loading stopped.";
  cancelVoiceList();
  revision++; requestAbort?.abort(); requestAbort = null; busy = false; $("send").disabled = false;
  cancelRecording = true;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  recordingStream?.getTracks().forEach(t => t.stop()); recordingStream = null;
  clearTimeout(recordTimer); stopAudio(); $("mic").textContent = "Mic"; $("mic").setAttribute("aria-pressed", "false"); activity("Stopped");
}
$("mic").onclick = async () => {
  if (recorder?.state === "recording") { recorder.stop(); return; }
  if (busy) return;
  if (!status.transcription) { showError(new Error("Microphone transcription needs an ElevenLabs or OpenAI API key on your backend. Typed commands work with every provider.")); return; }
  const turn = ++revision; cancelRecording = false;
  try {
    stopAudio();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Audio recording is unavailable in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (turn !== revision) { stream.getTracks().forEach(t => t.stop()); return; }
    recordingStream = stream;
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error("No supported recording format is available.");
    recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stream.getTracks().forEach(t => t.stop()); clearTimeout(recordTimer); activity("Recording failed"); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); recordingStream = null; clearTimeout(recordTimer);
      $("mic").textContent = "Mic"; $("mic").setAttribute("aria-pressed", "false");
      if (cancelRecording || turn !== revision) return;
      requestAbort = new AbortController(); busy = true; $("send").disabled = true;
      try {
        activity("Transcribing");
        const res = await api("/api/transcribe", {
          method: "POST", headers: { "Content-Type": mimeType },
          body: new Blob(chunks, { type: mimeType }), signal: requestAbort.signal,
        });
        const transcript = await res.json();
        if (turn !== revision) return;
        busy = false; $("send").disabled = false; await run(transcript.text);
      } catch (err) { if (turn === revision && err.name !== "AbortError") showError(err); }
      finally { if (turn === revision) { busy = false; $("send").disabled = false; } }
    };
    recorder.start(); $("mic").textContent = "Finish"; $("mic").setAttribute("aria-pressed", "true"); activity("Listening · tap Finish");
    recordTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, 30000);
  } catch (err) { recordingStream?.getTracks().forEach(t => t.stop()); showError(err); }
};
$("stop").onclick = stop;
$("command-form").onsubmit = event => {
  event.preventDefault(); const text = $("command").value.trim(); if (!text || busy) return;
  $("command").value = ""; void run(text);
};
document.querySelectorAll("[data-prompt]").forEach(button => { button.onclick = () => void run(button.dataset.prompt); });
$("read-flags").onclick = () => void run("Read today's five latest records");
for (const [id, layer] of [["firms", "firms"], ["thermal", "thermalRaster"]]) {
  $(id).onclick = async () => {
    try { await execute({ reply: "", actions: [{ type: "set_layer", layer, enabled: !state.layers[layer] }] }); }
    catch (err) { showError(err); }
  };
}
document.querySelectorAll("[data-tab]").forEach(button => { button.onclick = () => {
  const tab = button.dataset.tab;
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
  $("map-wrap").hidden = tab !== "situation"; $("studio").hidden = tab !== "studio"; $("aid").hidden = tab !== "aid";
  if (tab === "situation") map?.invalidateSize();
}; });
$("ask-code").onclick = () => void run("Explain this code or app idea and suggest a concrete improvement:\n" + $("code").value.slice(0, 3400));
$("ask-notes").onclick = () => void run("Draft an aid coordination brief from these notes. Preserve uncertainty and identify missing sources:\n" + $("notes").value.slice(0, 3400));
$("export-diagram").onclick = () => {
  const blob = new Blob([$("diagram").value], { type: "text/plain" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "evidence-diagram.mmd"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function connectionDraft() {
  const backend = cleanBackend($("backend-url").value);
  const token = $("access-token").value;
  if (!backend || token.length < 24) throw new Error("Enter the HTTPS backend URL and its access token first.");
  return { backend, token, voiceId: $("elevenlabs-voice").value };
}
function renderVoiceChoices(selected = "") {
  const select = $("elevenlabs-voice");
  select.replaceChildren(new Option("Backend default voice", ""));
  if (selected && !voiceChoices.some(row => row.id === selected))
    select.add(new Option("Saved voice · " + selected, selected));
  for (const row of voiceChoices) select.add(new Option(row.name + (row.description ? " · " + row.description : ""), row.id));
  select.value = selected;
}
function cancelVoiceList() {
  voiceListRevision++; voiceListAbort?.abort(); voiceListAbort = null;
  $("load-voices").disabled = false;
}
$("load-voices").onclick = async () => {
  cancelVoiceList();
  const ticket = voiceListRevision;
  const controller = new AbortController(); voiceListAbort = controller;
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), 20000);
  $("load-voices").disabled = true;
  $("voice-status").textContent = "Loading your ElevenLabs voices…";
  try {
    const draft = connectionDraft();
    const res = await api("/api/voices" + (voiceCursor ? "?cursor=" + encodeURIComponent(voiceCursor) : ""), { signal }, draft);
    const data = await res.json();
    if (ticket !== voiceListRevision) return;
    if (!Array.isArray(data.voices)) throw new Error("The backend returned an invalid voice list.");
    const selected = $("elevenlabs-voice").value;
    const choices = new Map((voiceCursor ? voiceChoices : []).map(row => [row.id, row]));
    for (const row of data.voices) {
      if (typeof row.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.id) && typeof row.name === "string")
        choices.set(row.id, { id: row.id, name: row.name.slice(0, 100), description: String(row.description || "").slice(0, 200) });
    }
    voiceChoices = [...choices.values()].slice(0, 1000);
    voiceCursor = typeof data.nextCursor === "string" ? data.nextCursor : "";
    renderVoiceChoices(selected);
    $("load-voices").textContent = voiceCursor ? "Load more voices" : "Refresh my voices";
    $("voice-status").textContent = voiceChoices.length
      ? "Choose a voice, then Test voice. Each test generates a short sample using your API quota."
      : "No voices were returned. Add a voice in your ElevenLabs account, then refresh.";
  } catch (err) {
    if (ticket === voiceListRevision) $("voice-status").textContent = err.name === "AbortError" ? "Voice list timed out. Try loading again." : err.message;
  } finally {
    clearTimeout(timer);
    if (ticket === voiceListRevision) { voiceListAbort = null; $("load-voices").disabled = false; }
  }
};
$("preview-voice").onclick = async () => {
  try {
    const draft = connectionDraft();
    stop(); $("voice-status").textContent = "Generating a short voice preview…";
    await speak("Situation room ready. We can open Sudan, focus on Nyala, and review your latest records.", revision, draft);
  } catch (err) { $("voice-status").textContent = err.message; }
};
$("elevenlabs-voice").onchange = stopAudio;
for (const id of ["backend-url", "access-token"]) $(id).oninput = () => {
  cancelVoiceList(); stopAudio(); voiceChoices = []; voiceCursor = ""; renderVoiceChoices();
  $("load-voices").textContent = "Load my voices";
  $("voice-status").textContent = "Connection changed. Load this backend's voices before choosing.";
};
$("settings").addEventListener("close", () => {
  cancelVoiceList(); const playing = Boolean(voiceAbort || audio); stopAudio();
  if (playing && !busy) activity("Ready");
});
$("settings-button").onclick = () => {
  $("backend-url").value = config.backend; $("access-token").value = config.token; $("room-url").value = config.room;
  voiceChoices = []; voiceCursor = ""; renderVoiceChoices(config.voiceId);
  $("load-voices").textContent = "Load my voices";
  $("voice-status").textContent = "Load voices from your ElevenLabs account, or keep the backend default. Test voice generates a short sample using your API quota.";
  $("settings").showModal();
};
$("close-settings").onclick = () => $("settings").close();
async function refreshStatus() {
  status = { providers: [], voice: false, transcription: false };
  if (!config.backend || !config.token) { $("connection").textContent = "Demo · no backend connected"; return; }
  try {
    status = await (await api("/api/status")).json();
    const configured = status.providers.filter(p => p.configured);
    const modelStatus = configured.length ? configured.map(p => p.id).join(" / ") + " available" : "Backend connected · provider keys missing";
    const voiceReady = status.voice || (status.voiceSelection && config.voiceId);
    $("connection").textContent = modelStatus + " · " + (voiceReady ? (status.voiceProvider === "elevenlabs" ? "ElevenLabs voice ready" : "Cloud voice ready") : status.voiceSelection ? "Choose an ElevenLabs voice in Connect" : "Cloud voice unavailable");
  } catch (err) { $("connection").textContent = "Backend connection failed"; showError(err); }
}
$("settings-form").onsubmit = async event => {
  event.preventDefault();
  try {
    const backend = cleanBackend($("backend-url").value), roomValue = $("room-url").value.trim();
    const room = roomValue ? new URL(roomValue) : null;
    if (room && (room.protocol !== "https:" || room.username || room.password)) throw new Error("Use an HTTPS situation-room URL without embedded credentials.");
    if (backend && $("access-token").value.length < 24) throw new Error("The backend token must contain at least 24 characters.");
    stop(); config = { backend, token: $("access-token").value, room: room?.href || "", voiceId: $("elevenlabs-voice").value };
    sessionStorage.setItem("quest-connection", JSON.stringify(config));
    nativeRequest({ type: "save_config", ...config });
    $("settings").close(); connected = false; state.sourceMode = "demo"; state.flags = synthetic;
    state.numbered = []; state.selected = null; state.diagram = [];
    $("room").hidden = !config.room; $("map").hidden = Boolean(config.room);
    if (config.room) $("room").src = config.room; else { $("room").removeAttribute("src"); $("map").hidden = false; }
    render(); await refreshStatus();
  } catch (err) { showError(err); }
};
$("room").onload = async () => {
  if (!config.room) return;
  connected = false;
  try {
    adopt(await bridge("quest:snapshot")); connected = true;
    $("map-note").textContent = "Connected records · sources and timestamps come from your situation room"; render();
  } catch (err) {
    $("room").hidden = true; $("map").hidden = false; state.sourceMode = "demo";
    $("map-note").textContent = "Situation room unavailable · synthetic demonstration"; render(); showError(err);
  }
};
if (window.QuestNative) {
  window.QuestNative.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "config") {
        config = { backend: data.backend || "", token: data.token || "", room: data.room || "", voiceId: data.voiceId || "" };
        if (config.room) { $("room").hidden = false; $("map").hidden = true; $("room").src = config.room; }
        void refreshStatus();
      } else if (data.error) showError(new Error(data.error));
      else if (data.type === "speech_done") activity("Ready");
    } catch { showError(new Error("Device bridge returned invalid configuration.")); }
  };
  nativeRequest({ type: "config" });
} else {
  if (config.room) { $("room").hidden = false; $("map").hidden = true; $("room").src = config.room; }
  void refreshStatus();
}
window.addEventListener("pagehide", stop);
render();
