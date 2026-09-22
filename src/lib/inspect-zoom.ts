import type { DetectHit, DetectKlass } from "@/lib/imagery-detect";
import type { Flag } from "@/lib/flags";
import type { FlyTarget } from "@/lib/store";

/** Yard-scale inspect zoom by morphology. Theater zoom is too wide to verify a chip. */
export const INSPECT_ZOOM: Record<DetectKlass, number> = {
  wreck_air: 17.0,
  wreck_bldg: 16.7,
  camp_buildup: 15.7,
  camp_grid: 15.5,
  irregular_pad: 16.0,
  vehicle_park: 16.4,
  cargo_yard: 16.1,
  earthwork: 15.6,
  pol_storage: 15.4,
  possible_damage: 16.0,
  burn_scar: 14.6,
  airfield_activity: 14.8,
  base_compound: 15.2,
  thermal_cluster: 12.8,
  unresolved_objects: 15.6,
  osm_gap: 14.2,
  crossing_cue: 15.0,
  maritime: 12.2,
  corridor_track: 13.4,
  reporting_cue: 14.6,
};

export function inspectZoomForKlass(klass?: DetectKlass, type?: Flag["type"]) {
  if (klass && INSPECT_ZOOM[klass] != null) return INSPECT_ZOOM[klass];
  if (type === "damage") return 16.0;
  if (type === "convoy") return 16.2;
  if (type === "flight") return 13.8;
  return 15.6;
}

export function dayOf(iso?: string | null): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function daysBefore(iso: string, n: number) {
  const t = Date.parse(`${iso}T12:00:00Z`) - n * 86400000;
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}

/** Always a point slew. Never a wide fitBounds — that was aborting yard zoom. */
export function inspectCam(opts: {
  lat: number;
  lon: number;
  zoom?: number;
  label?: string;
  date?: string | null;
}): FlyTarget {
  const date = dayOf(opts.date);
  return {
    lat: opts.lat,
    lon: opts.lon,
    zoom: opts.zoom ?? 15.6,
    label: opts.label,
    inspect: true,
    date: date ?? undefined,
  };
}

export function inspectFromHit(hit: DetectHit): FlyTarget {
  return inspectCam({
    lat: hit.lat,
    lon: hit.lon,
    zoom: inspectZoomForKlass(hit.klass),
    label: hit.title,
    date: hit.date,
  });
}

export function inspectFromFlag(f: Flag): FlyTarget {
  return inspectCam({
    lat: f.lat,
    lon: f.lon,
    zoom: inspectZoomForKlass(f.klass, f.type),
    label: f.title,
    date: f.date,
  });
}
