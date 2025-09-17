import { z } from "zod";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import {tool} from "ai";
import { nominatimSearchTool } from "./nominatim";

// --- Simple in-memory TTL cache for geocoding fallbacks ---
// NOTE: In serverless, consider Vercel KV/Upstash Redis for durability.
type CacheValue = { lng: number; lat: number };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const CACHE_MAX = 500;
const geocodeCache = new Map<string, { value: CacheValue; expires: number }>();
function cacheGet(key: string): CacheValue | undefined {
    const hit = geocodeCache.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
        geocodeCache.delete(key);
        return undefined;
    }
    return hit.value;
}
function cacheSet(key: string, value: CacheValue, ttl = CACHE_TTL_MS) {
    if (geocodeCache.size >= CACHE_MAX) {
        const first = geocodeCache.keys().next().value;
        if (first) geocodeCache.delete(first);
    }
    geocodeCache.set(key, { value, expires: Date.now() + ttl });
}

// --- Helpers ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TA_BASE = "https://api.content.tripadvisor.com/api/v1";

type TAItem = {
    location_id?: string;
    name?: string;
    address?: string;
    address_obj?: { address_string?: string };
    latitude?: string | number | null;
    longitude?: string | number | null;
};

function asNumber(n: unknown): number | null {
    const v = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : NaN;
    return Number.isFinite(v) ? v : null;
}

function poiFeature(item: TAItem, lng: number, lat: number): Feature {
    return {
        type: "Feature",
        properties: {
            source: "tripadvisor",
            location_id: item.location_id,
            name: item.name,
            address: item.address || item.address_obj?.address_string,
            category: "poi",
        },
        geometry: { type: "Point", coordinates: [lng, lat] },
    };
}

// --- Centroid utilities ---
// Ensure closed ring (first = last)
function closeRing(ring: Position[]): Position[] {
    if (ring.length === 0) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return ring;
    return ring.concat([first]);
}

// Centroid of a single (outer) ring using the polygon centroid formula.
// Returns [lng, lat] or null if degenerate.
function ringCentroid(ring: Position[]): { cx: number; cy: number; area: number } | null {
    const r = closeRing(ring);
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < r.length - 1; i++) {
        const [x0, y0] = r[i];
        const [x1, y1] = r[i + 1];
        const a = x0 * y1 - x1 * y0;
        twiceArea += a;
        cx += (x0 + x1) * a;
        cy += (y0 + y1) * a;
    }
    if (twiceArea === 0) return null;
    const area = twiceArea / 2;
    return { cx: cx / (3 * twiceArea), cy: cy / (3 * twiceArea), area };
}

// Compute a robust centroid for any GeoJSON geometry.
// - Polygon/MultiPolygon: area-weighted centroid using outer rings
// - Line/Point types: average of coordinates (fallback)
// - As a last resort: bbox center
function geometryCentroid(g: Geometry): [number, number] | null {
    try {
        switch (g.type) {
            case "Point":
                return g.coordinates as [number, number];
            case "MultiPoint": {
                const pts = g.coordinates as [number, number][];
                if (!pts.length) return null;
                const [sx, sy] = pts.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
                return [sx / pts.length, sy / pts.length];
            }
            case "LineString": {
                const pts = g.coordinates as [number, number][];
                if (!pts.length) return null;
                const [sx, sy] = pts.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
                return [sx / pts.length, sy / pts.length];
            }
            case "MultiLineString": {
                const lines = g.coordinates as [number, number][][];
                const all = lines.flat();
                if (!all.length) return null;
                const [sx, sy] = all.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
                return [sx / all.length, sy / all.length];
            }
            case "Polygon": {
                const rings = g.coordinates as [number, number][][];
                const outer = rings?.[0];
                if (!outer?.length) return null;
                const rc = ringCentroid(outer);
                if (rc) return [rc.cx, rc.cy];
                // degenerate -> fallback to average of outer ring
                const [sx, sy] = outer.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
                return [sx / outer.length, sy / outer.length];
            }
            case "MultiPolygon": {
                const polys = g.coordinates as [number, number][][][];
                let sumCx = 0, sumCy = 0, sumA = 0;
                for (const poly of polys) {
                    const outer = poly?.[0];
                    if (!outer?.length) continue;
                    const rc = ringCentroid(outer);
                    if (rc) { sumCx += rc.cx * Math.abs(rc.area); sumCy += rc.cy * Math.abs(rc.area); sumA += Math.abs(rc.area); }
                }
                if (sumA > 0) return [sumCx / sumA, sumCy / sumA];
                // fallback to average of all points
                const all = polys.flat(2);
                if (!all.length) return null;
                const [sx, sy] = all.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
                return [sx / all.length, sy / all.length];
            }
            default:
                return null;
        }
    } catch {
        return null;
    }
}

// Nominatim single-address geocode with bias & cache
async function geocodeAddressWithCache(address: string, near?: { lat: number; lng: number }): Promise<CacheValue | null> {
    const key = `${address.toLowerCase().trim()}|${near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : ""}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const params = new URLSearchParams({
        q: address,
        format: "jsonv2",
        addressdetails: "1",
        polygon_geojson: "0",
        limit: "1",
    });
    if (near) {
        const d = 0.02; // ~2km bias box
        params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
        params.set("bounded", "1");
    }
    const ua = process.env.APP_USER_AGENT ?? "MapChat/0.1 (+no-email-provided)";
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { "User-Agent": ua },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    const first = rows?.[0];
    if (!first) return null;
    const value = { lng: parseFloat(first.lon), lat: parseFloat(first.lat) };
    cacheSet(key, value);
    return value;
}

export const tripAdvisorByPlaceTool = tool({
    description:
        "Given a place name and a category (hotels/restaurants/attractions), resolve the place with Nominatim, take its centroid, then call TripAdvisor nearby_search around that coordinate. Falls back to per-POI geocoding (cached) when TripAdvisor items lack coordinates. Returns a GeoJSON FeatureCollection.",
    inputSchema: z.object({
        place: z.string().min(2),
        category: z.enum(["hotels", "restaurants", "attractions"]),
        radiusKm: z.number().int().min(1).max(5).default(3),
    }),
    // Server-side only; do not expose keys
    execute: async ({ place, category, radiusKm }) => {
        if (!process.env.TRIPADVISOR_API_KEY) {
            return { ok: false, error: "Missing TRIPADVISOR_API_KEY (server env var)" };
        }

        // 1) Resolve the place (reuse your existing tool)
        const nomi = await nominatimSearchTool.execute!({ query: place, limit: 1 }, {} as any);
        if (!(nomi as any).ok || !(nomi as any).data?.features?.length) {
            return { ok: false, error: `Could not locate "${place}" via Nominatim` };
        }

        // Use centroid (not first vertex)
        const geom = (nomi as any).data.features[0]?.geometry as Geometry | undefined;
        let center: { lng: number; lat: number } | null = null;
        const c = geom ? geometryCentroid(geom) : null;
        if (c) center = { lng: c[0], lat: c[1] };
        else {
            // if centroid fails, fall back to first coordinate if available
            const fallback = ((): [number, number] | null => {
                if (!geom) return null;
                switch (geom.type) {
                    case "Point": return geom.coordinates as [number, number];
                    case "Polygon": return (geom.coordinates[0] as [number, number][])[0] ?? null;
                    case "MultiPolygon": return (geom.coordinates[0]?.[0] as [number, number][])?.[0] ?? null;
                    default: return null;
                }
            })();
            if (!fallback) return { ok: false, error: "No usable coordinate from Nominatim geometry" };
            center = { lng: fallback[0], lat: fallback[1] };
        }

        // 2) Query TripAdvisor nearby_search centered on centroid
        const params = new URLSearchParams({
            key: process.env.TRIPADVISOR_API_KEY!,
            latLong: `${center.lat}%2C${center.lng}`, // TripAdvisor expects "lat,lon"
            category,
            radius: String(radiusKm),
            radiusUnit: "km",
        });

        const url = `${TA_BASE}/location/nearby_search?${params.toString()}`;
        const taRes = await fetch(url, { headers: { accept: "application/json" } });
        if (!taRes.ok) {
            return { ok: false, error: `TripAdvisor error ${taRes.status}` };
        }

        const json = await taRes.json();
        const items: TAItem[] = Array.isArray(json?.data) ? json.data : (json?.data ?? json?.results ?? []);

        // 3) Build pins; fallback geocode (cached) if TA lacks coords
        const features: Feature[] = [];

        // Include the search center marker
        features.push({
            type: "Feature",
            properties: { source: "nominatim", name: place, category: "search-center" },
            geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        });

        let geocodeCount = 0;
        for (const item of items) {
            const latTA = asNumber(item.latitude);
            const lngTA = asNumber(item.longitude);
            if (latTA != null && lngTA != null) {
                features.push(poiFeature(item, lngTA, latTA));
                continue;
            }

            const address = item.address || item.address_obj?.address_string;
            if (!address) continue; // nothing to geocode

            // Polite fallback: use cached geocode (or fetch) with bias near center
            const cachedOrFresh = await geocodeAddressWithCache(address, center);
            if (cachedOrFresh) {
                features.push(poiFeature(item, cachedOrFresh.lng, cachedOrFresh.lat));
                geocodeCount++;
                // Respect public Nominatim: ~1 req/sec for fresh lookups.
                // If it was a fresh hit (uncached), we probably just awaited a fetch inside geocodeAddressWithCache.
                // Add a small sleep every N fresh lookups to be safe.
                if (geocodeCount > 0) await sleep(1100);
            }
            // else: skip if we couldn't geocode
        }

        const fc: FeatureCollection = { type: "FeatureCollection", features };
        return { ok: true, data: fc };
    },
});
