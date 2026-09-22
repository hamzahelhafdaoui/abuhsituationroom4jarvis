/**
 * Fisser et al. 2022 Sentinel-2 motion-smear screening (DrishX / S2TruckDetect).
 * Large-vehicle *candidates* from B02/B03/B04 1.01s offset. Not a vehicle ID, not cargo, not military.
 */
const OFFSET_S = 1.01;

export interface SmearHit {
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number;
  headingDesc: string;
  score: number;
  pixels: number;
}

function compass(deg: number) {
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(deg / 45) % 8]!;
}

function ratio(a: number, b: number) {
  const s = a + b;
  return s < 1e-6 ? 0 : (a - b) / s;
}

/** Classify pixels 0=bg, 2=blue, 3=green, 4=red using RGB variance + peak band. */
export function classifySmear(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  valid: Uint8Array,
  n: number,
): Int8Array {
  const cls = new Int8Array(n);
  let varSum = 0;
  let varN = 0;
  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const mean = (r[i]! + g[i]! + b[i]!) / 3;
    const v = ((r[i]! - mean) ** 2 + (g[i]! - mean) ** 2 + (b[i]! - mean) ** 2) / 3;
    varSum += v;
    varN++;
  }
  const varCut = varN ? (varSum / varN) * 1.8 : 1;
  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const rv = r[i]!,
      gv = g[i]!,
      bv = b[i]!;
    const mean = (rv + gv + bv) / 3;
    const v = ((rv - mean) ** 2 + (gv - mean) ** 2 + (bv - mean) ** 2) / 3;
    if (v < varCut) continue;
    const rb = ratio(rv, bv);
    const gb = ratio(gv, bv);
    if (bv >= gv && bv >= rv && rb < -0.04) cls[i] = 2;
    else if (gv >= rv && gv >= bv && gb > 0.02) cls[i] = 3;
    else if (rv >= gv && rv >= bv && rb > 0.04) cls[i] = 4;
  }
  return cls;
}

export function extractSmears(
  cls: Int8Array,
  width: number,
  height: number,
  toLonLat: (x: number, y: number) => [number, number],
  road?: Uint8Array,
): SmearHit[] {
  const n = width * height;
  const seen = new Uint8Array(n);
  const hits: SmearHit[] = [];
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (cls[i] !== 2 || seen[i]) continue;
      if (road && !road[i]) continue;
      const stack = [i];
      seen[i] = 1;
      const pix: number[] = [];
      while (stack.length) {
        const p = stack.pop()!;
        pix.push(p);
        const px = p % width,
          py = (p / width) | 0;
        for (const [dx, dy] of dirs) {
          const nx = px + dx,
            ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (seen[ni] || cls[ni] === 0) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (pix.length < 3 || pix.length > 28) continue;
      let hasG = false,
        hasR = false;
      let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      let bx = 0,
        by = 0,
        bn = 0,
        rx = 0,
        ry = 0,
        rn = 0;
      for (const p of pix) {
        const c = cls[p]!;
        if (c === 3) hasG = true;
        if (c === 4) hasR = true;
        const px = p % width,
          py = (p / width) | 0;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        if (c === 2) {
          bx += px;
          by += py;
          bn++;
        }
        if (c === 4) {
          rx += px;
          ry += py;
          rn++;
        }
      }
      const bw = maxX - minX + 1,
        bh = maxY - minY + 1;
      if (!hasG || !hasR || bw > 6 || bh > 6 || (bw < 3 && bh < 3)) continue;
      const score = pix.length / 8 + (hasG && hasR ? 0.8 : 0);
      if (score <= 1.2) continue;
      const diameter = Math.max(bw, bh) * 10 - 10;
      const speed = Math.sqrt(Math.max(diameter, 10) * 20) / OFFSET_S * 3.6;
      const vx = (bn ? bx / bn : minX) - (rn ? rx / rn : maxX);
      const vy = (rn ? ry / rn : maxY) - (bn ? by / bn : minY);
      const heading = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
      const [lon, lat] = toLonLat((minX + maxX) / 2, (minY + maxY) / 2);
      hits.push({
        lat,
        lon,
        speedKmh: Math.round(speed * 10) / 10,
        heading: Math.round(heading * 10) / 10,
        headingDesc: compass(heading),
        score: Math.round(Math.min(score / 2.4, 1) * 100) / 100,
        pixels: pix.length,
      });
    }
  }
  return hits.slice(0, 80);
}

export function rasterizeLines(
  lines: number[][][],
  width: number,
  height: number,
  toPx: (lon: number, lat: number) => [number, number],
  radius = 3,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const stamp = (x: number, y: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        mask[ny * width + nx] = 1;
      }
    }
  };
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!,
        b = line[i]!;
      const [x0, y0] = toPx(a[0]!, a[1]!);
      const [x1, y1] = toPx(b[0]!, b[1]!);
      const steps = Math.max(1, Math.hypot(x1 - x0, y1 - y0) | 0);
      for (let s = 0; s <= steps; s++) {
        stamp(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps));
      }
    }
  }
  return mask;
}
