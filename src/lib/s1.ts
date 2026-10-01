import { createServerFn } from "@tanstack/react-start";

export interface S1Scene {
  tiles: string | null;
  item: string | null;
  sensed: string | null;
  note: string;
}

/** One public Sentinel-1 RTC scene over Sudan. Morphology only — not a vehicle layer. */
export const getS1Scene = createServerFn({ method: "GET" })
  .inputValidator((data: { date?: string }) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data?.date ?? "") ? data.date! : new Date().toISOString().slice(0, 10);
    return { date };
  })
  .handler(async ({ data }): Promise<S1Scene> => {
    const day = Date.parse(`${data.date}T00:00:00Z`);
    const start = new Date(day - 4 * 86400000).toISOString();
    const end = new Date(day + 86400000).toISOString();
    const res = await fetch("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        collections: ["sentinel-1-rtc"],
        bbox: [24, 12, 34, 16],
        datetime: `${start}/${end}`,
        limit: 1,
      }),
    });
    if (!res.ok) {
      return { tiles: null, item: null, sensed: null, note: `S1 gap · Planetary Computer HTTP ${res.status}. Not a negative.` };
    }
    const json = (await res.json()) as {
      features?: { id: string; properties?: { datetime?: string }; assets?: { tilejson?: { href?: string } } }[];
    };
    const feat = json.features?.[0];
    const tilejson = feat?.assets?.tilejson?.href;
    if (!feat || !tilejson) {
      return { tiles: null, item: null, sensed: null, note: `S1 gap · no GRD scene over the Darfur–Khartoum box within 4 days of ${data.date}. Cloud gap stays a gap.` };
    }
    const tj = await fetch(tilejson);
    if (!tj.ok) {
      return { tiles: null, item: feat.id, sensed: feat.properties?.datetime ?? null, note: `S1 gap · tilejson HTTP ${tj.status} for ${feat.id}.` };
    }
    const body = (await tj.json()) as { tiles?: string[] };
    const tiles = body.tiles?.[0] ?? null;
    if (!tiles) {
      return { tiles: null, item: feat.id, sensed: feat.properties?.datetime ?? null, note: `S1 gap · ${feat.id} has no tile template.` };
    }
    return {
      tiles,
      item: feat.id,
      sensed: feat.properties?.datetime?.slice(0, 10) ?? null,
      note: `S1 RTC ${feat.id}. One scene, not a mosaic. Morphology and change context only. Speckle is not wreckage. DET does not run on this layer.`,
    };
  });
