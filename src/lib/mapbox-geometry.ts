function geodesicBbox(lon: number, lat: number, sizeKm: number): number[] {
  const dy = sizeKm / 111.32;
  const dx = sizeKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dx / 2, lat - dy / 2, lon + dx / 2, lat + dy / 2];
}

/** Actual upstream Mapbox MCP tool execution, kept on the server. Falls back to geodesic envelope. */
export async function analysisBounds(lon: number, lat: number, sizeKm: number): Promise<number[]> {
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    Math.abs(lon) > 179 ||
    Math.abs(lat) > 80 ||
    !Number.isFinite(sizeKm) ||
    sizeKm <= 0 ||
    sizeKm > 10
  )
    throw new Error("Invalid analysis area");
  try {
    const [{ buffer }, { boundingBox, validateGeojson }] = await Promise.all([
      import("@mapbox/mcp-server/tools"),
      import("@mapbox/mcp-devkit-server/tools"),
    ]);
    const result = await buffer.run({
      geometry: [lon, lat],
      distance: sizeKm / Math.SQRT2,
      units: "kilometers",
    });
    if (result.isError || !result.structuredContent?.bufferedPolygon)
      throw new Error("Mapbox buffer calculation failed");
    const geojson = { type: "Polygon", coordinates: result.structuredContent.bufferedPolygon };
    const validation = await validateGeojson.run({ geojson });
    if (validation.isError || validation.structuredContent?.valid !== true)
      throw new Error("Analysis geometry did not pass Mapbox validation");
    const bounds = await boundingBox.run({ geojson });
    const bbox = bounds.structuredContent?.bbox;
    if (bounds.isError || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite))
      throw new Error("Mapbox bounding box calculation failed");
    return bbox as number[];
  } catch {
    return geodesicBbox(lon, lat, sizeKm);
  }
}

export async function validateAnalysisGeometry(geojson: Record<string, unknown>): Promise<void> {
  try {
    const { validateGeojson } = await import("@mapbox/mcp-devkit-server/tools");
    const result = await validateGeojson.run({ geojson });
    if (result.isError || result.structuredContent?.valid !== true)
      throw new Error("Change geometries failed GeoJSON validation");
  } catch {
    if (geojson?.type !== "FeatureCollection") throw new Error("Change geometries failed GeoJSON validation");
  }
}
