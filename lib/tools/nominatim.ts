import { z } from "zod";
import type { FeatureCollection, Geometry, Feature } from "geojson";
import { tool } from "ai";

// Helper: Convert Nominatim /search results to GeoJSON FeatureCollection
function nominatimToFeatureCollection(items: any[]): FeatureCollection {
  const features: Feature[] = items.map((it) => {
    // Prefer polygon GeoJSON if present, fallback to Point
    const geometry: Geometry = it.geojson ?? {
      type: "Point",
      coordinates: [parseFloat(it.lon), parseFloat(it.lat)],
    };
    return {
      type: "Feature",
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
  return {
    type: "FeatureCollection",
    features
  };
}

export const nominatimSearchTool = tool({
  description:
    "Search for places using Nominatim (OpenStreetMap). Use when the user asks to find or locate a place. Always request polygon output when available.",
  inputSchema: z.object({
    query: z.string().min(2),
    limit: z.number().int().min(1).max(10).default(5),
    countrycodes: z.string().optional(), // e.g., 'kr,us,gb'
  }),
  // Execute server-side, never expose keys
  execute: async ({ query, limit, countrycodes }) => {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      polygon_geojson: "1",
      limit: String(limit ?? 5),
    });
    if (countrycodes) params.set("countrycodes", countrycodes);

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const ua = process.env.APP_USER_AGENT ?? "MapChat/0.1";
    const res = await fetch(url, {
      headers: { "User-Agent": ua },
      // Nominatim asks for reasonable rate limits, add a small delay if needed later
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Nominatim error ${res.status}`,
      };
    }
    const json = await res.json();
    const fc = nominatimToFeatureCollection(Array.isArray(json) ? json : []);
    return { ok: true, data: fc };
  },
});
