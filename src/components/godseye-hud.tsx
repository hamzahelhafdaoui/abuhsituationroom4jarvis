import { useEffect, useMemo, useState } from "react";
import type { FlightEvent, VesselEvent } from "@/lib/types";
import { haversineKm } from "@/lib/geo";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Cam {
  lat: number;
  lon: number;
  z: number;
  bearing: number;
  pitch: number;
}

export function GodseyeHud({
  flights,
  vessels,
  counts,
}: {
  flights: FlightEvent[];
  vessels: VesselEvent[];
  counts: { quakes: number; sats: number; eonet: number; launches: number };
}) {
  const hudOn = useAppStore((s) => s.hudOn);
  const globeOn = useAppStore((s) => s.globeOn);
  const orbitOn = useAppStore((s) => s.orbitOn);
  const setFlyTarget = useAppStore((s) => s.setFlyTarget);
  const [cam, setCam] = useState<Cam>({ lat: 13.5, lon: 30.4, z: 5.4, bearing: 0, pitch: 0 });
  useEffect(() => {
    const on = (e: Event) => setCam((e as CustomEvent<Cam>).detail);
    window.addEventListener("ahsr-cam", on);
    return () => window.removeEventListener("ahsr-cam", on);
  }, []);
  const contacts = useMemo(() => {
    const air = flights
      .map((f) => ({ kind: "air" as const, id: f.id, title: f.reg || f.hex, sub: f.typeCode, km: haversineKm(cam.lat, cam.lon, f.lat, f.lon), lat: f.lat, lon: f.lon }))
      .filter((x) => x.km <= 250)
      .sort((a, b) => a.km - b.km)
      .slice(0, 6);
    const sea = vessels
      .map((v) => ({ kind: "sea" as const, id: v.id, title: v.name, sub: v.kind, km: haversineKm(cam.lat, cam.lon, v.lat, v.lon), lat: v.lat, lon: v.lon }))
      .filter((x) => x.km <= 250)
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
    return [...air, ...sea].slice(0, 8);
  }, [flights, vessels, cam.lat, cam.lon]);
  if (!hudOn) return null;
  const ticks = ["N", "E", "S", "W"];
  return (
    <div className="gev-hud" aria-hidden="true">
      <div className="gev-tube" />
      <div className="gev-reticle">
        {ticks.map((t, i) => (
          <span
            key={t}
            className="gev-compass"
            style={{ transform: `rotate(${i * 90 - cam.bearing}deg) translateY(-min(38vh, 280px)) rotate(${-(i * 90 - cam.bearing)}deg)` }}
          >
            {t}
          </span>
        ))}
        <span className="gev-ring r-a" />
        <span className="gev-ring r-b" />
        <span className="gev-cross-h" />
        <span className="gev-cross-v" />
      </div>
      <div className="gev-corner tl">
        <p>UNCLASSIFIED // OSINT</p>
        <p className="gev-mode">{globeOn ? "GLOBE" : "THEATER"} {orbitOn ? "· ORBIT" : ""}</p>
        <p>
          {cam.lat.toFixed(3)} {cam.lon.toFixed(3)} · z{cam.z.toFixed(1)}
        </p>
      </div>
      <div className="gev-corner tr">
        <p>
          <span className="live-pulse gev-rec" /> REC · PUBLIC FEEDS
        </p>
        <p>AIR {flights.length} · SEA {vessels.length}</p>
        <p>
          USGS {counts.quakes} · SAT {counts.sats} · EONET {counts.eonet} · LL2 {counts.launches}
        </p>
      </div>
      <div className="gev-edge left">GOD'S EYE · KEYLESS LAYERS</div>
      <div className="gev-edge right">NO TARGETING · HUMAN VERIFY</div>
      {contacts.length ? (
        <div className="gev-contacts pointer-events-auto">
          <p className="mb-1 font-mono text-[9px] tracking-[0.18em] text-muted">CONTACTS 250 KM</p>
          <ul>
            {contacts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn("w-full truncate text-left font-mono text-[10px] text-fg hover:text-accent")}
                  onClick={() => setFlyTarget({ lat: c.lat, lon: c.lon, zoom: c.kind === "air" ? 13.2 : 14.4, label: c.title, inspect: true })}
                >
                  {c.kind === "air" ? "AIR" : "SEA"} {c.title} · {Math.round(c.km)} km
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
