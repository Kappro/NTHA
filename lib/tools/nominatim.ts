// lib/tools/nominatim.ts
import { z } from "zod";
import { tool } from "ai";
import { runNominatimSearch } from "../services/nominatim";

// Tool to be used by the chatbot for locating a place.
export const nominatimSearchTool = tool({
  description:
      "Search places with Nominatim (OpenStreetMap). Returns a GeoJSON FeatureCollection; prefers polygon geometry when available.",
  inputSchema: z.object({
    query: z.string().min(2),
    limit: z.number().int().min(1).max(10).default(5),
    countrycodes: z.string().optional(),            // e.g. "kr,us,gb"
    polygon: z.boolean().default(true),             // request polygon_geojson=1
    language: z.string().optional(),                // e.g. "en", "ko"
    near: z
        .object({
          lat: z.number(),
          lng: z.number(),
          radiusKm: z.number().min(0.1).max(10).default(2),
        })
        .optional(),                                  // optional viewbox bias
  }),
  // Server-side only. The AI SDK will supply the (unused) context arg.
  execute: async (args) => {
    // Delegate to the shared service (handles UA header, caching, etc.)
    return await runNominatimSearch(args);
  },
});
