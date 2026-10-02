export const PLACES = Object.freeze({
  sudan: { lat: 15.5, lon: 30.2, zoom: 5, label: "Sudan" },
  nyala: { lat: 12.053, lon: 24.881, zoom: 12, label: "Nyala" },
  khartoum: { lat: 15.5, lon: 32.56, zoom: 11, label: "Khartoum" },
  el_fasher: { lat: 13.63, lon: 25.35, zoom: 11, label: "El Fasher" },
});
export const TOOLS = ["navigate", "read_flags", "select_flag", "set_layer", "make_diagram"];
export function dateInZone(value, timeZone = "Africa/Khartoum") {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const pick = (type) => parts.find(p => p.type === type).value;
  return pick("year") + "-" + pick("month") + "-" + pick("day");
}
export function cleanFlags(rows) {
  if (!Array.isArray(rows)) throw new Error("The situation room returned invalid records.");
  const ids = new Set();
  return rows.filter(r => r && typeof r.id === "string" && r.id.length > 0 && r.id.length <= 200 && !ids.has(r.id) &&
    typeof r.title === "string" && Number.isFinite(r.lat) && Math.abs(r.lat) <= 90 &&
    Number.isFinite(r.lon) && Math.abs(r.lon) <= 180 &&
    typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.date) &&
    Number.isFinite(Date.parse(r.date)) && (ids.add(r.id), true))
    .slice(0, 250).map(r => ({
      id: r.id.slice(0, 200), title: r.title.slice(0, 240),
      body: String(r.body || "").slice(0, 1500), lat: r.lat, lon: r.lon,
      date: r.date, sourceLabel: String(r.sourceLabel || "Unspecified source").slice(0, 160),
      url: typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url.slice(0, 2000) : null,
      confidence: String(r.confidence ?? "unreviewed").slice(0, 80),
    }));
}
export function validatePlan(input) {
  if (!input || typeof input.reply !== "string" || input.reply.length > 5000 ||
      !Array.isArray(input.actions) || input.actions.length > 8) throw new Error("Invalid assistant plan.");
  const actions = input.actions.map(a => {
    if (!a || !TOOLS.includes(a.type)) throw new Error("Unsupported assistant action.");
    if (a.type === "navigate") {
      if (!Object.hasOwn(PLACES, a.place)) throw new Error("Unknown map location.");
      return { type: a.type, place: a.place };
    }
    if (a.type === "read_flags") {
      if (a.scope !== "today" || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 5)
        throw new Error("Invalid record query.");
      return { type: a.type, scope: "today", limit: a.limit };
    }
    if (a.type === "select_flag") {
      if (!Number.isInteger(a.index) || a.index < 1 || a.index > 5) throw new Error("Invalid numbered item.");
      return { type: a.type, index: a.index };
    }
    if (a.type === "set_layer") {
      if (!["firms", "thermalRaster"].includes(a.layer) || typeof a.enabled !== "boolean")
        throw new Error("Invalid layer setting.");
      return { type: a.type, layer: a.layer, enabled: a.enabled };
    }
    return { type: "make_diagram" };
  });
  return { reply: input.reply, actions };
}
export function stagePlan(state, plan, now = Date.now()) {
  const validated = validatePlan(plan);
  const next = {
    ...state, layers: { ...state.layers }, numbered: [...(state.numbered || [])],
    selected: state.selected || null,
  };
  const outcomes = [];
  for (const a of validated.actions) {
    if (a.type === "navigate") {
      next.camera = { ...PLACES[a.place] };
      next.selected = null;
      outcomes.push("Map moved to " + next.camera.label + ".");
    } else if (a.type === "read_flags") {
      const today = dateInZone(now, next.timeZone);
      next.numbered = cleanFlags(next.flags).filter(r => dateInZone(r.date, next.timeZone) === today)
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id)).slice(0, a.limit);
      outcomes.push(next.numbered.length ? "Today's " + next.numbered.length + " newest dated records: " +
        next.numbered.map((r, i) => (i + 1) + ". " + r.title + ". Source: " + r.sourceLabel + ".").join(" ")
        : "No records dated today in " + next.timeZone + " were returned. There is no item three to select.");
    } else if (a.type === "select_flag") {
      const row = next.numbered[a.index - 1];
      if (!row) throw new Error("Item " + a.index + " is unavailable. Read today's records first.");
      next.selected = { ...row };
      next.camera = { lat: row.lat, lon: row.lon, zoom: 14, label: row.title };
      outcomes.push("Selected item " + a.index + ": " + row.title + ".");
    } else if (a.type === "set_layer") {
      next.layers[a.layer] = a.enabled;
      outcomes.push((a.layer === "firms" ? "FIRMS detections" : "Thermal satellite overlay") +
        (a.enabled ? " enabled." : " disabled."));
    } else {
      next.diagram = next.numbered.map(r => ({ id: r.id, title: r.title, source: r.sourceLabel }));
      outcomes.push(next.diagram.length ? "Created an editable evidence diagram. Connections group records; they do not assert causation."
        : "Read some records before creating an evidence diagram.");
    }
  }
  return { state: next, outcomes, plan: validated };
}
export function demoPlan(text) {
  const t = text.toLowerCase();
  const actions = [];
  if (/sudan/.test(t)) actions.push({ type: "navigate", place: "sudan" });
  for (const [pattern, place] of [[/nyala/, "nyala"], [/khartoum/, "khartoum"], [/el[ -]fasher/, "el_fasher"]]) {
    if (pattern.test(t)) actions.push({ type: "navigate", place });
  }
  if (/(latest|newest|read|flag|five|5)/.test(t) && /(today|latest|newest|five|5)/.test(t))
    actions.push({ type: "read_flags", scope: "today", limit: 5 });
  const item = t.match(/(?:number|item|flag)\s*(one|two|three|four|five|[1-5])/);
  if (item) actions.push({ type: "select_flag", index: Number(item[1]) ||
    ({ one: 1, two: 2, three: 3, four: 4, five: 5 })[item[1]] });
  if (/firms|thermal/.test(t)) actions.push({
    type: "set_layer", layer: /thermal/.test(t) ? "thermalRaster" : "firms",
    enabled: !/off|disable|hide/.test(t),
  });
  if (/diagram|blueprint/.test(t)) actions.push({ type: "make_diagram" });
  return {
    reply: actions.length ? "Demo controls only; no AI model was called."
      : "Demo understands Sudan, Nyala, today's five records, item three, FIRMS, and evidence diagrams. Connect a provider for conversation.",
    actions,
  };
}
