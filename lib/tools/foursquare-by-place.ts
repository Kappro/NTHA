import { z } from "zod";
import type { FeatureCollection, Geometry } from "geojson";
import { tool } from "ai";
import {runNominatimSearch, ToolResult} from "../services/nominatim";
import { fsqSearch, fsqResultsToGeoJSON } from "../services/foursquare";

// simple centroid for Polygon/MultiPolygon
function centroid(g: Geometry | undefined | null): [number, number] | null {
    if (!g) return null;
    try {
        // point IS its own centroid
        if (g.type === "Point") return g.coordinates as [number, number];
        // for polygons, find area of the ring using shoelace method, and use it to divide sum of all x- and y- coordinates
        if (g.type === "Polygon") {
            const ring = (g.coordinates as [number, number][][])[0] || [];
            let a=0,cx=0,cy=0;
            const n = ring.length;
            if (n < 3) return ring[0] ?? null;
            for (let i=0;i<n;i++){
                const [x1,y1]=ring[i], [x2,y2]=ring[(i+1)%n]; const cross = x1*y2 - x2*y1;
                a += cross; cx += (x1+x2)*cross; cy += (y1+y2)*cross;
            }
            if (a === 0) return ring[0] ?? null;
            return [cx/(3*a), cy/(3*a)];
        }
        if (g.type === "MultiPolygon") {
            const polys = g.coordinates as [number, number][][][];
            let A=0,CX=0,CY=0;
            for (const poly of polys) {
                const ring = poly[0] || [];
                let a=0,cx=0,cy=0; const n=ring.length; if (n<3) continue;
                for (let i=0;i<n;i++){ const [x1,y1]=ring[i], [x2,y2]=ring[(i+1)%n]; const cross = x1*y2 - x2*y1; a+=cross; cx+=(x1+x2)*cross; cy+=(y1+y2)*cross; }
                if (a!==0){ A+=a; CX+=cx; CY+=cy; }
            }
            if (A===0) {
                const first = (polys[0]?.[0]?.[0]) as [number,number] | undefined;
                return first ?? null;
            }
            return [CX/(3*A), CY/(3*A)];
        }
        // basic fallbacks for lines/multipoints
        const coords: [number,number][] = (g as any).coordinates?.flat?.(2) ?? (g as any).coordinates ?? [];
        if (!coords.length) return null;
        const [sx,sy] = coords.reduce(([ax,ay],[x,y])=>[ax+x, ay+y], [0,0]);
        return [sx/coords.length, sy/coords.length];
    } catch { return null; }
}

// Tool to be used by the chatbot for finding recommendations near a place.
export const foursquareByPlaceTool = tool({
    description:
        "Resolve a place name to a centroid (via Nominatim) then search Foursquare for nearby POIs (restaurants, hotels, attractions). Only able to filter by distance to search center and by rating. Returns GeoJSON FeatureCollection, which includes recommendation as Points and search center as any kind of feature based on Nominatim search.",
    inputSchema: z.object({
        place: z.string().min(2),                // e.g. "Gangnam-gu, Seoul"
        query: z.string().default("restaurants"),// free text like "restaurants", "coffee", "hotels"
        radiusKm: z.number().int().min(1).max(5).default(3),
        limit: z.number().int().min(1).max(20).default(10),
        includeDetails: z.boolean().default(true), // fetch rating/stats
        minRating: z.number().min(0).max(10).optional(), // filter after details
        categories: z.string().optional(), // CSV of FSQ category IDs (optional)
    }),
    // server-side only
    execute: async ({ place, query, radiusKm, limit, minRating }): Promise<ToolResult> => {
        // 1) Nominatim -> centroid
        const nomi = await runNominatimSearch({ query: place, limit: 1 });
        if (!nomi.ok || !nomi.data?.features?.length) {
            return { ok: false, error: `Could not locate "${place}"` };
        }
        const g = nomi.data.features[0].geometry as Geometry | undefined;
        const c = centroid(g);
        if (!c) return { ok: false, error: "No usable centroid from place geometry" };
        const [lng, lat] = c;

        // 2) Foursquare search around centroid
        const sr = await fsqSearch({
            ll: { lat, lng },
            query,
            radiusMeters: Math.round(radiusKm * 1000),
            limit,
        });
        if (!sr.ok) return sr;

        const results = sr.data;

        // 3) Build GeoJSON
        let fc: FeatureCollection = fsqResultsToGeoJSON(results!);

        // 4) Filter by minRating if requested (only where rating exists)
        if (typeof minRating === "number") {
            fc = {
                type: "FeatureCollection",
                features: fc.features.filter(f => (f.properties as any)?.rating >= minRating),
            };
        }

        // Add the search center
        fc.features.unshift({
            type: "Feature",
            properties: { source: "nominatim", name: place, category: "search-center" },
            geometry: g!,
        });

        return { ok: true, data: fc, source: "fsq"};
    },
});