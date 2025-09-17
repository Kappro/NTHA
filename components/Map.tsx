"use client"

import dynamic from 'next/dynamic';

// needs this separate helper so that the map can be properly loaded into the main page without SSR
const Map = dynamic(() => import('../components/MapCreator'), { ssr: false });

export default Map;