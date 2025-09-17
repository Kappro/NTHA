"use client"

import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../components/MapCreator'), { ssr: false });

export default Map;