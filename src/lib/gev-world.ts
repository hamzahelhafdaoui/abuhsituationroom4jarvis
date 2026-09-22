/** Public GEV / WorldView feeds — USGS, CelesTrak/ISS, NASA EONET, Launch Library 2. Observation only. */
export interface GevPin {
  id: string;
  kind: "quake" | "sat" | "eonet" | "launch";
  name: string;
  lat: number;
  lon: number;
  mag?: number;
  note: string;
  when: string;
  url?: string;
}

const UA = "AbuHureirahSitroom/1.0 (public-data documentation; GEV-style globe layers)";

async function getJson(url: string, ms = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function pullQuakes(): Promise<GevPin[]> {
  try {
    const j = (await getJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")) as {
      features?: Array<{
        id?: string;
        properties?: { mag?: number; place?: string; time?: number; url?: string };
        geometry?: { coordinates?: number[] };
      }>;
    };
    return (j.features ?? []).slice(0, 80).flatMap((f) => {
      const c = f.geometry?.coordinates;
      if (!c || c.length < 2) return [];
      const lon = c[0]!;
      const lat = c[1]!;
      const mag = f.properties?.mag ?? 0;
      return [
        {
          id: `qk-${f.id ?? `${lat}-${lon}`}`,
          kind: "quake" as const,
          name: `M${mag.toFixed(1)} · ${f.properties?.place ?? "quake"}`,
          lat,
          lon,
          mag,
          note: "USGS M2.5+ last 24h. Public seismograph feed — not a damage call.",
          when: f.properties?.time ? new Date(f.properties.time).toISOString() : new Date().toISOString(),
          url: f.properties?.url,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function pullSats(): Promise<GevPin[]> {
  try {
    const iss = (await getJson("https://api.wheretheiss.at/v1/satellites/25544", 8000)) as {
      latitude?: number;
      longitude?: number;
      altitude?: number;
      name?: string;
    };
    const lat = num(iss.latitude);
    const lon = num(iss.longitude);
    if (lat == null || lon == null) return [];
    return [
      {
        id: "sat-iss",
        kind: "sat",
        name: "ISS",
        lat,
        lon,
        note: `Public ISS position (Where The ISS At / CelesTrak heritage). Alt ${Math.round(iss.altitude ?? 0)} km.`,
        when: new Date().toISOString(),
        url: "https://wheretheiss.at/",
      },
    ];
  } catch {
    return [];
  }
}

export async function pullEonet(): Promise<GevPin[]> {
  try {
    const j = (await getJson("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=40")) as {
      events?: Array<{
        id?: string;
        title?: string;
        link?: string;
        categories?: Array<{ title?: string }>;
        geometry?: Array<{ coordinates?: number[] | number[][]; date?: string }>;
      }>;
    };
    return (j.events ?? []).flatMap((ev) => {
      const g = ev.geometry?.[ev.geometry.length - 1];
      const raw = g?.coordinates;
      let lon: number | null = null;
      let lat: number | null = null;
      if (Array.isArray(raw) && typeof raw[0] === "number") {
        lon = raw[0] as number;
        lat = raw[1] as number;
      } else if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
        lon = raw[0][0];
        lat = raw[0][1] as number;
      }
      if (lat == null || lon == null) return [];
      const cat = ev.categories?.[0]?.title ?? "event";
      return [
        {
          id: `eo-${ev.id ?? ev.title}`,
          kind: "eonet" as const,
          name: ev.title ?? "EONET",
          lat,
          lon,
          note: `NASA EONET open natural event · ${cat}. Not a strike feed.`,
          when: g?.date ?? new Date().toISOString(),
          url: ev.link,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function pullLaunches(): Promise<GevPin[]> {
  try {
    const j = (await getJson("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=list")) as {
      results?: Array<{
        id?: string;
        name?: string;
        net?: string;
        pad?: { latitude?: string; longitude?: string; name?: string; location?: { name?: string } };
        url?: string;
      }>;
    };
    return (j.results ?? []).flatMap((r) => {
      const lat = Number(r.pad?.latitude);
      const lon = Number(r.pad?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      return [
        {
          id: `ln-${r.id ?? r.name}`,
          kind: "launch" as const,
          name: r.name ?? "Launch",
          lat,
          lon,
          note: `Launch Library 2 · ${r.pad?.name ?? r.pad?.location?.name ?? "pad"}. Public schedule, not telemetry.`,
          when: r.net ?? new Date().toISOString(),
          url: r.url,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function pullGevWorld(): Promise<{
  quakes: GevPin[];
  sats: GevPin[];
  eonet: GevPin[];
  launches: GevPin[];
}> {
  const [quakes, sats, eonet, launches] = await Promise.all([pullQuakes(), pullSats(), pullEonet(), pullLaunches()]);
  return { quakes, sats, eonet, launches };
}

export const EMPTY_GEV = {
  quakes: [] as GevPin[],
  sats: [] as GevPin[],
  eonet: [] as GevPin[],
  launches: [] as GevPin[],
};
