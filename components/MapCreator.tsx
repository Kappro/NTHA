"use client";
import React, { useEffect, useRef } from "react";
import maplibregl, { LngLatBoundsLike, Map as MaplibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import {env} from "../lib/env";

export default function MapCreator() {
  const mapRef = useRef<MaplibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mapRef.current) return;
    if (!env.MAPTILER_API_KEY) throw new Error("MAPTILER_API_KEY is not found");
    const map = new maplibregl.Map({
      container: containerRef.current as HTMLDivElement,
      style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${env.MAPTILER_API_KEY}`,
      center: [127.024612, 37.5326], // Seoul
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");
    mapRef.current = map;

    // Listen for custom events dispatched by Chat when a tool returns GeoJSON
    const onGeoJSON = (e: Event) => {
      const ce = e as CustomEvent<FeatureCollection>;
      const fc = ce.detail;
      const map = mapRef.current!;

      const sourceId = "search-result";
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as any).setData(fc);
      } else {
        map.addSource(sourceId, { type: "geojson", data: fc });
        map.addLayer({
          id: "search-result-fill",
          type: "fill",
          source: sourceId,
          paint: { "fill-opacity": 0.25 }
        });
        map.addLayer({
          id: "search-result-line",
          type: "line",
          source: sourceId,
          paint: { "line-width": 2 }
        });
        map.addLayer({
          id: "search-result-point",
          type: "circle",
          source: sourceId,
          paint: { "circle-radius": 4 }
        });
      }

      // fit bounds
      const coords = collectCoords(fc);
      if (coords.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, duration: 500 });
      }
    };

    window.addEventListener("add-geojson", onGeoJSON as any);
    return () => {
      window.removeEventListener("add-geojson", onGeoJSON as any);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div className="map-container"><div ref={containerRef} className="map" /></div>;
}

// extract all coordinates from a FeatureCollection
function collectCoords(fc: FeatureCollection): [number, number][] {
  const pts: [number, number][] = [];
  for (const f of fc.features) {
    const g: any = f.geometry;
    if (!g) continue;
    if (g.type === "Point") {
      pts.push(g.coordinates);
    } else if (g.type === "MultiPoint") {
      pts.push(...g.coordinates);
    } else if (g.type === "LineString") {
      pts.push(...g.coordinates);
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates) pts.push(...line);
    } else if (g.type === "Polygon") {
      for (const ring of g.coordinates) pts.push(...ring);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) for (const ring of poly) pts.push(...ring);
    }
  }
  return pts;
}