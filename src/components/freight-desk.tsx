import { useState } from "react";
import { useAnalysisArea } from "@/lib/analysis-area";
import { useAppStore } from "@/lib/store";
import { FREIGHT_SITES, runFreightScan } from "@/lib/freight-service";
import { useFreightState } from "@/lib/freight-state";
import { cn } from "@/lib/utils";

export function FreightDesk() {
  const center = useAnalysisArea((s) => s.center);
  const mapDate = useAppStore((s) => s.date);
  const setFly = useAppStore((s) => s.setFlyTarget);
  const [date, setDate] = useState(mapDate);
  const [size, setSize] = useState(6);
  const [windowDays, setWindowDays] = useState(12);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hits = useFreightState((s) => s.hits);
  const note = useFreightState((s) => s.note);
  const runDate = useFreightState((s) => s.date);
  const setResult = useFreightState((s) => s.setResult);
  const clear = useFreightState((s) => s.clear);

  const run = async (lat = center[1], lon = center[0]) => {
    setBusy(true);
    setError("");
    setStatus("Searching Sentinel-2 L2A COGs + OSM roads, then screening B02/B03/B04 motion smear…");
    try {
      const r = await runFreightScan({ data: { lon, lat, sizeKm: size, date, windowDays } });
      setResult({ hits: r.detections, date: r.date, note: `${r.note} · ${r.roads} OSM road ways · scene ${r.sceneId}` });
      setStatus(
        `${r.detections.length} large-vehicle smear candidates on ${r.date} (cloud ${r.cloud.toFixed(0)}%). Human verify. Not a type ID.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Freight scan failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="freight-desk pointer-events-auto">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">DRISH-X · S2 SMEAR</span>
        {hits.length ? (
          <button type="button" className="text-[10px] text-muted underline" onClick={() => clear()}>
            Clear
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-subtle">
        Counts large-vehicle motion smear on mapped highways from free Sentinel-2. Speed/heading are
        smear geometry, ±15 km/h / ±22°. Cars are sub-pixel. Not cargo. Not a live feed.
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {FREIGHT_SITES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="h-7 rounded-sm border border-border px-2 font-mono text-[10px] text-muted hover:text-fg"
            onClick={() => {
              setFly({ lat: s.lat, lon: s.lon, zoom: 12.2, label: s.name, inspect: true });
              void run(s.lat, s.lon);
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-[10px] text-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 w-full border border-border bg-bg px-1 py-1 font-mono text-[11px] text-fg"
          />
        </label>
        <label className="text-[10px] text-muted">
          km
          <input
            type="number"
            min={1}
            max={10}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="mt-0.5 w-full border border-border bg-bg px-1 py-1 font-mono text-[11px] text-fg"
          />
        </label>
        <label className="text-[10px] text-muted">
          ±days
          <input
            type="number"
            min={3}
            max={30}
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="mt-0.5 w-full border border-border bg-bg px-1 py-1 font-mono text-[11px] text-fg"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className={cn(
          "mt-2 h-8 w-full border border-accent/50 font-mono text-[11px] tracking-wider",
          busy ? "text-muted" : "text-accent hover:bg-accent hover:text-accent-fg",
        )}
      >
        {busy ? "SCANNING ROADS…" : "FREIGHT SCAN · MAP CENTER"}
      </button>
      {status ? <p className="mt-2 text-[11px] text-fg">{status}</p> : null}
      {error ? <p className="mt-2 text-[11px] text-damage">{error}</p> : null}
      {hits.length ? (
        <ul className="mt-2 max-h-40 overflow-auto text-[11px]">
          {hits.slice(0, 24).map((h, i) => (
            <li key={`${h.lat}-${h.lon}-${i}`}>
              <button
                type="button"
                className="w-full truncate text-left text-fg hover:text-accent"
                onClick={() => setFly({ lat: h.lat, lon: h.lon, zoom: 15.2, label: `smear ${i + 1}`, inspect: true })}
              >
                {Math.round(h.speedKmh)} km/h {h.headingDesc} · p{h.pixels} · {h.score.toFixed(2)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {runDate ? <p className="mt-1 font-mono text-[10px] text-subtle">{runDate}</p> : null}
      {note ? <p className="mt-1 text-[10px] leading-snug text-subtle">{note}</p> : null}
    </div>
  );
}
