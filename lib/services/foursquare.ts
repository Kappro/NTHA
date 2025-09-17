import type { Feature, FeatureCollection } from "geojson";
import fsqDevelopersPlaces from '@api/fsq-developers-places';

// input for the function
export type FsqSearchOpts = {
    ll: { lat: number; lng: number };
    query?: string;            // e.g. "restaurants", "coffee", "hotels"
    radiusMeters?: number;     // default 3000
    limit?: number;            // default 10 (max 50)
};

// usage in the API call
export type FsqParams = {
    ll: string;
    radius?: number;
    limit?: number;
    'X-Places-Api-Version': '2025-06-17';
    query?: string;
}

// conducts a search on foursquare to find nearby locations to the search center based on the query (e.g. restaurants)
export async function fsqSearch({
                                    ll, query, radiusMeters = 3000, limit = 10,
                                }: FsqSearchOpts) {
    if (!process.env.FOURSQUARE_API_KEY) {
        return { ok: false, error: "Missing FOURSQUARE_API_KEY" } as const;
    }
    const params: FsqParams = {
        ll: `${ll.lat}%2C${ll.lng}`,
        radius: radiusMeters,
        limit: Math.min(Math.max(limit,1),50),
        'X-Places-Api-Version': '2025-06-17'
    }
    if (query) params["query"] = query;

    fsqDevelopersPlaces.auth(process.env.FOURSQUARE_API_KEY);
    return fsqDevelopersPlaces.placeSearch(params).then(res => {
        return { ok: true, data: res.data.results } as const;
    }).catch(err => {
        return { ok: false, error: err.message } as const;
    })
}

// Convert FSQ search to GeoJSON Point features
export function fsqResultsToGeoJSON(results: any[]): FeatureCollection {
    const features: Feature[] = [];
    for (const r of results ?? []) {
        const lat = r.latitude;
        const lng = r.longitude;
        if (typeof lat !== "number" || typeof lng !== "number") continue;

        features.push({
            type: "Feature",
            properties: {
                source: "foursquare",
                fsq_id: r.fsq_id,
                name: r.name,
                address: r.location.address,
                categories: (r.categories ?? []).map((c: any) => c.name),
                distance: r.distance,           // meters (present when search is ll/radius)
            },
            geometry: { type: "Point", coordinates: [lng, lat] },
        });
    }
    return { type: "FeatureCollection", features };
}