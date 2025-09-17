"use client";
import React, { useEffect, useRef } from "react";
import maplibregl, { Map as MaplibreMap } from "maplibre-gl";
import type {Feature, FeatureCollection} from "geojson";

// main map creation
export default function MapCreator() {
  const mapRef = useRef<MaplibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markers = useRef<maplibregl.Marker[] | null>([]);

  // initialisation of map
  useEffect(() => {
    if (mapRef.current) return;                  // prevent double init
    if (!containerRef.current) return;           // guard

    const ctrl = new AbortController();
    let disposed = false;

    // wraps all the necessary map initiations in async so that other async functions can be used
    (async () => {
      try {
        // 1) fetch style from your API route
        const res = await fetch("/api/map", {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Failed to fetch map style: ${res.status} ${res.statusText}`);

        const mapStyle: maplibregl.StyleSpecification = await res.json();

        if (disposed) return;

        // 2) create the map only after style is available
        const map = new maplibregl.Map({
          container: containerRef.current as HTMLDivElement,
          style: mapStyle,
          center: [127.024612, 37.5326], // Seoul
          zoom: 3,
        });
        map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");
        mapRef.current = map;

        // 3) wire up your custom events AFTER map exists

        // For nominatim tool, draw out the found location on the map
        const markNominatimResults = (e: Event) => {
          const ce = e as CustomEvent<FeatureCollection>;
          const fc = ce.detail;
          const map = mapRef.current!;
          const sourceId = "search-result";

          if (map.getSource(sourceId)) {
            (map.getSource(sourceId) as any).setData(fc);
          } else {
            // drawing functions
            map.addSource(sourceId, { type: "geojson", data: fc });

            map.addLayer({
              id: "search-result-fill",
              type: "fill",
              source: sourceId,
              paint: { "fill-opacity": 0.25 },
            });
            map.addLayer({
              id: "search-result-line",
              type: "line",
              source: sourceId,
              paint: { "line-width": 2 },
            });
            map.addLayer({
              id: "search-result-point",
              type: "circle",
              source: sourceId,
              paint: { "circle-radius": 4 },
            });
          }

          // fit bounds
          const coords = collectCoords(fc);
          if (coords.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
            map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 40, duration: 500 });
          }
        };

        // For foursquare tool, draw the search center on the map, then pin the recommended places with details
        const markFSQResults = (e: Event) => {
          const ce = e as CustomEvent<FeatureCollection>;
          const fc = ce.detail;
          const map = mapRef.current!;
          const scSourceId = "search-result";
          const fsqSourceId = "recommendation-result";

          const sc: Feature[] = [];
          const recs: Feature[] = [];

          // separate search center and recommendations in separate FeatureCollections
          fc.features.map((f) => {
            if (f.properties?.source === "nominatim") {
              sc.push(f);
            } else {
              recs.push(f);
            }
          })
          // search center feature collection
          const scfc = {
            type: "FeatureCollection",
            features: sc
          } as FeatureCollection;
          // recommendations feature collection
          const recfc = {
            type: "FeatureCollection",
            features: recs
          } as FeatureCollection;

          if (map.getSource(scSourceId)) {
            (map.getSource(scSourceId) as any).setData(scfc);
          } else {
            map.addSource(scSourceId, {type: "geojson", data: scfc});

            map.addLayer({
              id: "search-result-fill",
              type: "fill",
              source: scSourceId,
              paint: {"fill-opacity": 0.25},
            });
            map.addLayer({
              id: "search-result-line",
              type: "line",
              source: scSourceId,
              paint: {"line-width": 2},
            });
            map.addLayer({
              id: "search-result-point",
              type: "circle",
              source: scSourceId,
              paint: {"circle-radius": 4},
            });
          }

          if (map.getSource(fsqSourceId)) {
            (map.getSource(fsqSourceId) as any).setData(recfc);
          } else {
            map.addSource(fsqSourceId, { type: "geojson", data: recfc });
          }

          // remove all previous markers
          for (const m of markers.current!) {
            m.remove();
          }
          markers.current! = [];
          for (const f of recfc.features) {
            const marker = new maplibregl.Marker()
                .setLngLat((f.geometry as any).coordinates)
                .setPopup(new maplibregl.Popup().setHTML(`
                  <strong>${f.properties!.name}</strong>
                  <p>${f.properties!.address ?? "-"}<br>${f.properties!.distance ? `${f.properties!.distance}m from location` : "-"}<br>Tags: ${f.properties!.categories.join(", ") ?? "-"}</p>`))
                .addTo(map);
            markers.current!.push(marker);
          }

          // fit bounds
          const coords = collectCoords(fc);
          if (coords.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
            map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 40, duration: 500 });
          }
        }

        window.addEventListener("nominatim-tool-complete", markNominatimResults as any);
        window.addEventListener("fsq-tool-complete", markFSQResults as any);

        // 4) cleanup when component unmounts
        const cleanup = () => {
          window.removeEventListener("nominatim-tool-complete", markNominatimResults as any);
          window.removeEventListener("fsq-tool-complete", markFSQResults as any);
          if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
          }
        };

        // attach to map's own remove as well (optional)
        map.once("remove", cleanup);
      } catch (err: any) {
        if (err?.name !== "AbortError") console.error(err);
      }
    })();

    return () => {
      disposed = true;
      ctrl.abort();                               // cancel fetch if in-flight
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
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