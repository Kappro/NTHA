# MapChat

## Introduction
Welcome to MapChat! This smart GPT-powered chatbot is able to locate the places you want and mark them out on the map.

In addition, it is able to recommend places near your desired location so that you can find places that you desire!

## Quickstart

```bash
pnpm i   # or npm i / yarn
pnpm dev
```

## Usage
The floating button with a text icon opens the chatbot window. Then, talk to the chatbot using prompts like the following:

- "Find Gangnam-gu, Seoul and draw it on the map"
- "Show Central Park polygon"
- "Locate Busan"
- "Recommend me some places to eat near Jurong Point"

You can move the chatbot window as well as the button around to prevent blocking any parts of the map!

## Tech Stack and Attributions
This application uses **NextJS**, together with [**Vercel's AI SDK**](https://ai-sdk.dev/docs/introduction).

The map engine is [**MapLibre GL**](https://maplibre.org/maplibre-gl-js/docs/),
and the map tiles are obtained from [**MapTiler**](https://www.maptiler.com/cloud/).

The chatbot is powered by none other than [**OpenAI**](https://openai.com/index/openai-api/).

The location search tool used is [**Nominatim Search**](https://nominatim.org/release-docs/latest/api/Search/),
while the recommendation tool uses [**Foursquare**](https://foursquare.com/developer/) to find nearby locations.