import test from "node:test";
import assert from "node:assert/strict";
import { demoPlan, stagePlan, validatePlan, dateInZone, cleanFlags } from "../public/protocol.mjs";
const now = Date.parse("2026-10-02T12:00:00Z");
function row(id, date, extra = {}) {
  return { id, date, title: id, body: "Evidence", lat: 12.05, lon: 24.88, sourceLabel: "Source", ...extra };
}
function workspace(flags = []) {
  return { flags, numbered: [], selected: null, layers: { firms: false, thermalRaster: false },
    camera: { lat: 0, lon: 0, zoom: 4, label: "Overview" }, sourceMode: "live", timeZone: "Africa/Khartoum" };
}
test("the requested compound workflow selects the third newest record and enables FIRMS", () => {
  const flags = ["08", "11", "09", "10", "07"].map(h => row(h, "2026-10-02T" + h + ":00:00Z"));
  const result = stagePlan(workspace(flags), demoPlan("Open Sudan, zoom to Nyala, read today's five latest flags, zoom to number 3 with FIRMS"), now);
  assert.deepEqual(result.state.numbered.map(r => r.id), ["11", "10", "09", "08", "07"]);
  assert.equal(result.state.selected.id, "09"); assert.equal(result.state.layers.firms, true);
  assert.equal(result.state.camera.lat, flags[0].lat);
});
test("number three remains tied to the last read list when new records arrive", () => {
  const first = stagePlan(workspace([row("a", "2026-10-02T11:00:00Z"), row("b", "2026-10-02T10:00:00Z"), row("c", "2026-10-02T09:00:00Z")]),
    { reply: "", actions: [{ type: "read_flags", scope: "today", limit: 5 }] }, now).state;
  first.flags.unshift(row("new", "2026-10-02T11:30:00Z"));
  const next = stagePlan(first, { reply: "", actions: [{ type: "select_flag", index: 3 }] }, now);
  assert.equal(next.state.selected.id, "c");
});
test("today respects the Sudan timezone across UTC midnight and excludes old records", () => {
  assert.equal(dateInZone("2026-10-01T23:30:00Z", "Africa/Khartoum"), "2026-10-02");
  const result = stagePlan(workspace([row("yes", "2026-10-01T23:30:00Z"), row("old", "2026-10-01T12:00:00Z")]),
    { reply: "", actions: [{ type: "read_flags", scope: "today", limit: 5 }] }, now);
  assert.deepEqual(result.state.numbered.map(r => r.id), ["yes"]);
});
test("a missing item rejects the entire sequence without changing the original map or layers", () => {
  const original = workspace();
  assert.throws(() => stagePlan(original, { reply: "", actions: [
    { type: "navigate", place: "nyala" }, { type: "set_layer", layer: "firms", enabled: true },
    { type: "select_flag", index: 3 },
  ] }, now), /unavailable/);
  assert.equal(original.layers.firms, false); assert.equal(original.camera.label, "Overview");
});
test("unknown actions, prototype properties, invalid coordinates and dates are rejected", () => {
  assert.throws(() => validatePlan({ reply: "", actions: [{ type: "execute_code", code: "bad" }] }), /Unsupported/);
  assert.throws(() => validatePlan({ reply: "", actions: [{ type: "navigate", place: "__proto__" }] }), /Unknown/);
  assert.deepEqual(cleanFlags([row("bad", "not-a-date"), row("outside", "2026-10-02T10:00:00Z", { lat: 100 })]), []);
});
test("an empty today returns no fabricated events", () => {
  const result = stagePlan(workspace([row("old", "2026-10-01T12:00:00Z")]),
    { reply: "", actions: [{ type: "read_flags", scope: "today", limit: 5 }] }, now);
  assert.equal(result.state.numbered.length, 0); assert.match(result.outcomes[0], /No records/);
});
