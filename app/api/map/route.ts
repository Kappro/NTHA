// app/api/map/route.ts
import { NextResponse } from "next/server";

// Sends API requests to MapTiler through the server-side instead of client-side.
export async function GET() {
    const apiKey = process.env.MAPTILER_API_KEY; // Store in .env.local
    const url = `https://api.maptiler.com/maps/basic-v2/style.json?key=${apiKey}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            return NextResponse.json(
                { error: `Failed to fetch style: ${res.statusText}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || "Unexpected error" },
            { status: 500 }
        );
    }
}