'use client'
import { useRef, useEffect } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

export default function PrefMap(props: {rates: Record<string, number> }){
    const mapContainer = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const map = new maplibregl.Map({
            container: mapContainer.current!,
            style:{
                version: 8,
                sources: {},
                layers: [{ id: "bg", type: "background", paint: { "background-color": "#dfe9f3"} }],
            },
        center: [137, 38],
        zoom: 4,    
        })
        map.on("load", async () => {
            const res = await fetch("/japan-pref.geojson")
            const geojson = await res.json()
            geojson.features.forEach((f: any) => {
                f.properties.aging_rate = props.rates[f.properties.nam_ja]
            })

            map.addSource("prefs", {type: "geojson", data: geojson})
            map.addLayer({
                id: "pref-fill",
                type: "fill",
                source: "prefs",
                paint: {
                    "fill-color": [
                    "step",
                    ["get", "aging_rate"],
                    "#ffffb2",
                    15, "#fecc5c",
                    18, "#fd8d3c",
                    21, "#f03b20",
                    24, "#bd0026",
                    ],
                    "fill-opacity": 0.75,
                },
            })
            map.addLayer({
                id: "pref-line",
                type: "line",
                source: "prefs",
                paint: { "line-color": "#ffffff", "line-width": 1},
            })
        })
        return () => map.remove()
    }, [])
    return <div ref={mapContainer} style={{ width: "100%", height: "500px" }} />
}