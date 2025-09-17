// lib/services/nominatim.ts
// Minimal Nominatim search service with optional bias + tiny TTL cache.
// NOTE: Use this ONLY on the server. Some platforms strip custom headers in Edge;
// prefer route handlers with `export const runtime = 'nodejs'` when you need User-Agent.

import type { FeatureCollection, Geometry } from "geojson";

// ---------- Types ----------
export type NominatimSearchArgs = {
    query: string;
    limit?: number;              // 1..10 (be polite)
    countrycodes?: string;       // e.g. "kr,us,gb"
    polygon?: boolean;           // default true (ask for polygon when available)
    language?: string;           // Accept-Language header (e.g., "en", "ko")
    near?: {                     // optional bias box around a center
        lat: number;
        lng: number;
        radiusKm?: number;         // default ~2km
    };
};

export type ToolResult =
    | { ok: true; data: FeatureCollection, source: "nominatim" | "fsq" }
    | { ok: false; error: string; status?: number };

// ---------- Small TTL cache (in-memory) ----------
type CacheEntry = { value: ToolResult; expires: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX = 300;

// Convert search arguments into a cache key.
function cacheKey(args: NominatimSearchArgs) {
    // avoid unstable ordering by building a stable object
    const keyObj = {
        q: args.query.trim().toLowerCase(),
        limit: args.limit ?? 5,
        cc: args.countrycodes ?? "",
        poly: args.polygon !== false, // default true
        lang: args.language ?? "",
        near: args.near
            ? {
                lat: Number(args.near.lat.toFixed(4)),
                lng: Number(args.near.lng.toFixed(4)),
                r: args.near.radiusKm ? Math.round(args.near.radiusKm * 10) / 10 : 2,
            }
            : null,
    };
    return JSON.stringify(keyObj);
}

// Retrieve from the cache based on the key.
function cacheGet(k: string): ToolResult | undefined {
    const hit = CACHE.get(k);
    if (!hit) return;
    // enforce deletion of cache if date is passed
    if (Date.now() > hit.expires) {
        CACHE.delete(k);
        return;
    }
    return hit.value;
}

// Adds the key-value pair to the cache. TTL is defaulted to 10 minutes.
function cacheSet(k: string, v: ToolResult, ttl = CACHE_TTL_MS) {
    if (CACHE.size >= CACHE_MAX) {
        const first = CACHE.keys().next().value;
        if (first) CACHE.delete(first);
    }
    CACHE.set(k, { value: v, expires: Date.now() + ttl });
}

// helper to run the search on nominatin
export async function runNominatimSearch(args: NominatimSearchArgs): Promise<ToolResult> {
    const key = cacheKey(args);
    const cached = cacheGet(key);
    // use cache if possible
    if (cached) return cached;

    const {
        query,
        limit = 5,
        countrycodes,
        polygon = true,
        language,
        near,
    } = args;

    if (!query || query.trim().length < 2) {
        const res: ToolResult = { ok: false, error: "Query too short" };
        cacheSet(key, res);
        return res;
    }

    const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        addressdetails: "1",
        limit: String(Math.min(Math.max(limit, 1), 10)),
    });

    if (polygon) params.set("polygon_geojson", "1");
    if (countrycodes) params.set("countrycodes", countrycodes);

    // Optional bias: create a small viewbox around the provided center
    if (near) {
        const rKm = near.radiusKm ?? 2;
        const dLat = rKm / 111.0; // ~111 km per degree latitude
        const cos = Math.cos((near.lat * Math.PI) / 180);
        const dLng = cos === 0 ? dLat : rKm / (111.0 * Math.max(cos, 0.0001));
        const left = (near.lng - dLng).toFixed(6);
        const right = (near.lng + dLng).toFixed(6);
        const top = (near.lat + dLat).toFixed(6);
        const bottom = (near.lat - dLat).toFixed(6);
        params.set("viewbox", `${left},${top},${right},${bottom}`);
        params.set("bounded", "1");
    }

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    // Respect Nominatim usage policy: set a real UA with contact info.
    const ua = process.env.APP_USER_AGENT ?? "MapChat/1.0";

    const headers: Record<string, string> = { "User-Agent": ua };
    if (language) headers["Accept-Language"] = language;

    let resp: Response;
    // for errors, still cache but lower TTL in case the network error was a one-time thing
    try {
        resp = await fetch(url, { headers });
    } catch (e: any) {
        const res: ToolResult = { ok: false, error: `Network error: ${e?.message ?? e}` };
        cacheSet(key, res, 2 * 60 * 1000);
        return res;
    }

    if (!resp.ok) {
        const res: ToolResult = { ok: false, error: `Nominatim ${resp.status}`, status: resp.status };
        cacheSet(key, res, 2 * 60 * 1000);
        return res;
    }

    const rows = (await resp.json()) as any[];
    const fc: FeatureCollection = toFeatureCollection(Array.isArray(rows) ? rows : []);

    const out: ToolResult = { ok: true, data: fc, source: "nominatim" };
    cacheSet(key, out);
    return out;
}

// converts list of (hopefully) features to feature collection
export function toFeatureCollection(items: any[]): FeatureCollection {
    const features = items.map((it) => {
        const geometry: Geometry =
            it.geojson ??
            ({
                type: "Point",
                coordinates: [parseFloat(it.lon), parseFloat(it.lat)],
            } as Geometry);

        return {
            type: "Feature" as const,
            properties: {
                display_name: it.display_name,
                category: it.category,
                type: it.type,
                importance: it.importance,
                osm_type: it.osm_type,
                osm_id: it.osm_id,
            },
            geometry,
        };
    });

    return { type: "FeatureCollection", features };
}