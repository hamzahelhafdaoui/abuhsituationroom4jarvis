import { createServerFn } from "@tanstack/react-start";
import { analysisBounds } from "./mapbox-geometry";
import { createRequestCache } from "./request-cache";
import { classifySmear, extractSmears, rasterizeLines, type SmearHit } from "./freight-smear";

const cache = createRequestCache(8);
const ROOT = "https://earth-search.aws.element84.com/v1";
const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export const FREIGHT_SITES = [
  { id: "port-sudan", name: "Port Sudan feeder", lat: 19.58, lon: 37.22, note: "Red Sea port access" },
  { id: "khartoum-n", name: "Khartoum–Omdurman", lat: 15.63, lon: 32.48, note: "Nile crossing / urban trunk" },
  { id: "el-fasher", name: "El Fasher access", lat: 13.63, lon: 25.35, note: "Darfur corridor" },
  { id: "nyala", name: "Nyala trunk", lat: 12.05, lon: 24.88, note: "South Darfur" },
  { id: "geneina", name: "Geneina–Adré", lat: 13.45, lon: 22.44, note: "Chad border road" },
  { id: "kufra", name: "Kufra desert road", lat: 24.18, lon: 23.29, note: "SE Libya access" },
  { id: "e11", name: "UAE E11", lat: 24.95, lon: 55.05, note: "Abu Dhabi–Dubai (DrishX benchmark)" },
  { id: "a109", name: "Mombasa–Nairobi A109", lat: -3.6, lon: 39.2, note: "East Africa imports" },
] as const;

function allowed(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "sentinel-cogs.s3.us-west-2.amazonaws.com";
  } catch {
    return false;
  }
}

async function osmRoads(west: number, south: number, east: number, north: number): Promise<number[][][]> {
  const q = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary)$"](${south},${west},${north},${east});out geom;`;
  for (const host of OVERPASS) {
    try {
      const r = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AbuHureirahSitroom/1.0 freight-smear" },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { elements?: Array<{ geometry?: Array<{ lat: number; lon: number }> }> };
      return (j.elements ?? [])
        .map((el) => (el.geometry ?? []).map((g) => [g.lon, g.lat]))
        .filter((line) => line.length >= 2)
        .slice(0, 400);
    } catch {
      /* next mirror */
    }
  }
  return [];
}

export async function runFreight(input: { lon: number; lat: number; sizeKm: number; date: string; windowDays: number }) {
  const { fromUrl } = await import("geotiff");
  const { default: proj4 } = await import("proj4");
  const signal = AbortSignal.timeout(120000);
  const bbox = await analysisBounds(input.lon, input.lat, input.sizeKm);
  const day = Date.parse(input.date);
  const delta = input.windowDays * 86400000;
  const params = new URLSearchParams({
    collections: "sentinel-2-l2a",
    bbox: bbox.join(","),
    datetime: `${new Date(day - delta).toISOString()}/${new Date(day + delta + 86399999).toISOString()}`,
    limit: "40",
    query: JSON.stringify({ "eo:cloud_cover": { lte: 40 } }),
  });
  const cat = await fetch(`${ROOT}/search?${params}`, { signal });
  if (!cat.ok) throw new Error(`Scene catalogue HTTP ${cat.status}`);
  const body = await cat.json();
  const scenes = (body.features ?? []).filter(
    (f: { assets?: Record<string, { href?: string }>; properties?: Record<string, number> }) =>
      f.assets?.red?.href &&
      f.assets?.green?.href &&
      f.assets?.blue?.href &&
      f.assets?.scl?.href &&
      allowed(f.assets.red.href) &&
      allowed(f.assets.scl.href),
  );
  if (!scenes.length) throw new Error("No clear Sentinel-2 L2A scene with B02/B03/B04 COGs in this window.");
  scenes.sort(
    (a: { properties: Record<string, number> }, b: { properties: Record<string, number> }) =>
      (a.properties["eo:cloud_cover"] ?? 100) - (b.properties["eo:cloud_cover"] ?? 100),
  );
  const scene = scenes[0]!;
  const epsg = scene.properties["proj:epsg"] as number;
  const zone = epsg % 100;
  const utm = `+proj=utm +zone=${zone} ${epsg >= 32700 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`;
  const center = proj4("EPSG:4326", utm, [input.lon, input.lat]);
  const half = input.sizeKm * 500;
  const west = Math.floor((center[0] - half) / 10) * 10;
  const south = Math.floor((center[1] - half) / 10) * 10;
  const east = Math.ceil((center[0] + half) / 10) * 10;
  const north = Math.ceil((center[1] + half) / 10) * 10;
  const width = Math.min(512, Math.round((east - west) / 10));
  const height = Math.round((((north - south) / 10) * width) / Math.round((east - west) / 10));

  const readBand = async (href: string, samples?: number[]) => {
    const tif = await fromUrl(href, { allowFullFile: false }, signal);
    try {
      const im = await tif.getImage();
      const [ox, oy] = im.getOrigin();
      const [rx, ry] = im.getResolution();
      const win = [
        Math.round((west - ox) / rx),
        Math.round((north - oy) / ry),
        Math.round((east - ox) / rx),
        Math.round((south - oy) / ry),
      ];
      if (win[0] < 0 || win[1] < 0 || win[2] > im.getWidth() || win[3] > im.getHeight())
        throw new Error("AOI crosses the scene edge. Move the map or shrink the area.");
      const rasters = await im.readRasters({
        window: win,
        width,
        height,
        resampleMethod: "nearest",
        samples: samples ?? [0],
        signal,
      });
      const arr = rasters[0] as ArrayLike<number>;
      return Float32Array.from(arr, (v) => Number(v));
    } finally {
      await tif.close();
    }
  };

  const [R, G, B, scl] = await Promise.all([
    readBand(scene.assets.red.href),
    readBand(scene.assets.green.href),
    readBand(scene.assets.blue.href),
    readBand(scene.assets.scl.href, [0]),
  ]);
  const n = width * height;
  const valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = scl[i] ?? 0;
    if (s === 4 || s === 5 || s === 6) valid[i] = 1;
  }
  const roadsLonLat = await osmRoads(bbox[0]!, bbox[1]!, bbox[2]!, bbox[3]!);
  const toPx = (lon: number, lat: number): [number, number] => {
    const p = proj4("EPSG:4326", utm, [lon, lat]);
    return [((p[0] - west) / (east - west)) * width, ((north - p[1]) / (north - south)) * height];
  };
  const roadMask = roadsLonLat.length
    ? rasterizeLines(roadsLonLat, width, height, toPx, 4)
    : undefined;
  const cls = classifySmear(R, G, B, valid, n);
  const toLonLat = (x: number, y: number): [number, number] => {
    const e = west + (x / width) * (east - west);
    const nrt = north - (y / height) * (north - south);
    return proj4(utm, "EPSG:4326", [e, nrt]) as [number, number];
  };
  const detections: SmearHit[] = extractSmears(cls, width, height, toLonLat, roadMask);
  const date = String(scene.properties.datetime).slice(0, 10);
  return {
    date,
    sceneId: scene.id as string,
    cloud: scene.properties["eo:cloud_cover"] as number,
    metadata: `${ROOT}/collections/sentinel-2-l2a/items/${encodeURIComponent(scene.id)}`,
    roads: roadsLonLat.length,
    detections,
    note: "Sentinel-2 B02/B03/B04 motion-smear screening (Fisser 2022 / DrishX). Large-vehicle candidates on mapped roads. Not a vehicle type, cargo, or occupancy call. RF pickle is not in-browser — this is the spectral-smear object extractor.",
    bbox: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] },
  };
}

export const runFreightScan = createServerFn({ method: "POST" })
  .inputValidator((data: { lon: number; lat: number; sizeKm: number; date: string; windowDays: number }) => {
    if (!data || ![data.lon, data.lat, data.sizeKm, data.windowDays].every(Number.isFinite))
      throw new Error("Pick a map center and 1–10 km corridor.");
    if (data.sizeKm < 1 || data.sizeKm > 10) throw new Error("Freight AOI must be 1–10 km.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Date must be YYYY-MM-DD.");
    return data;
  })
  .handler(async ({ data }) => cache(`freight:${JSON.stringify(data)}`, 8 * 60_000, () => runFreight(data)));

export type FreightScanResult = Awaited<ReturnType<typeof runFreightScan>>;
