/** Geometry helpers (pure). GeoJSON uses [lng, lat] order. */
export type LatLng = { lat: number; lng: number };
export type Polygon = { type: 'Polygon'; coordinates: number[][][] };
export type MultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] };
export type AreaGeometry = Polygon | MultiPolygon;

const EARTH_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Placeholder boundary: a circle approximated by an n-gon (used until real boundaries are drawn). */
export function circlePolygon(center: LatLng, radiusKm: number, sides = 32): Polygon {
  const ring: number[][] = [];
  const dLat = (radiusKm / EARTH_KM) * (180 / Math.PI);
  const dLng = dLat / Math.cos((center.lat * Math.PI) / 180);
  for (let i = 0; i < sides; i++) {
    const t = (2 * Math.PI * i) / sides;
    ring.push([round6(center.lng + dLng * Math.cos(t)), round6(center.lat + dLat * Math.sin(t))]);
  }
  ring.push(ring[0]!);
  return { type: 'Polygon', coordinates: [ring] };
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Ray casting on one ring ([lng, lat] pairs). */
function inRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(p: LatLng, g: AreaGeometry): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // Outer ring must contain the point; holes must not.
  return polys.some(([outer, ...holes]) => !!outer && inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

export function isValidLatLng(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/** The first active area whose boundary contains the point. */
export function areaContaining<T extends { id: string; boundary: AreaGeometry | null }>(p: LatLng, areas: T[]): T | null {
  return areas.find((a) => a.boundary && pointInGeometry(p, a.boundary)) ?? null;
}
