# Map + Chat — Vercel AI SDK v5 + MapLibre + Nominatim (tool calling)

This is a minimal scaffold to satisfy your assignment:

- **Part 1:** Uses the Vercel **AI SDK v5** with the **OpenAI provider** and streams responses.
- **Part 2:** Renders a **MapLibre** map as the main panel with a chat panel.
- **Part 3:** Calls **OpenAI gpt-5-mini** (server-side only) using the key from `.env.local`.
- **Part 4:** Implements **tool calling** to query **Nominatim** and pushes returned **GeoJSON** onto the map.
- **Bonus 2:** Streaming output to the UI via AI SDK's data streams.

## Quickstart

```bash
pnpm i   # or npm i / yarn
pnpm dev
```

Then open http://localhost:3000 and try prompts like:

- "Find Gangnam-gu, Seoul and draw it on the map"
- "Show Central Park polygon"
- "Locate Busan"

## Notes

- Keys are **never** sent to the browser. The `/api/chat` route runs on the **Edge runtime** and reads `OPENAI_API_KEY`.
- The Nominatim tool sets a **User-Agent** header. For production, set `APP_USER_AGENT` to a contact email/domain and add caching/rate limiting.
- The map style uses MapLibre **demo tiles** (no key). Swap to a provider when needed.
- The chat UI listens for **tool results** and dispatches a `window` event `add-geojson` which the Map component consumes.
- Keep `maxSteps` in sync on **client and server** to ensure tools run consistently.
