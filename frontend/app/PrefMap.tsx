'use client'
import { useRef, useEffect } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { regionBounds } from "./regionBounds"
import { prefBounds } from "./prefBounds"

export default function PrefMap(props: {rates: Record<string, number>, onSelectPref: (pref: string) => void, selectedPref: string, selectedRegion: string, cityRates: Record<string, number>}){
    const mapContainer = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)

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
        mapRef.current = map
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
            map.on("click", "pref-fill", (e) => {
                const name = e.features![0].properties!.nam_ja
                props.onSelectPref(name)
            })
            map.on("mouseenter", "pref-fill", () => { 
                map.getCanvasContainer().style.cursor = "pointer"
            })
            map.on("mouseleave", "pref-fill", () => { 
                map.getCanvasContainer().style.cursor = ""})
            map.addLayer({
                id: "pref-highlight",
                type: "line",
                source: "prefs",
                paint: { "line-color": "#000000", "line-width": 2},
                filter: ["==", [ "get", "nam_ja"], ""], 
            })
        })
        return () => map.remove()
    }, [])
    useEffect(() => {
        const map = mapRef.current
        if (!map || !map.getLayer("pref-highlight")) return
        map.setFilter("pref-highlight", ["==", ["get","nam_ja"], props.selectedPref])
    }, [props.selectedPref])
    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        if (props.selectedRegion !== ""){
            map.fitBounds(regionBounds[props.selectedRegion], { padding: 40})
        } else {
            map.flyTo({ center:[137, 38], zoom: 4})
        }
    }, [props.selectedRegion])
    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        if (props.selectedPref === "") {
            if (map.getLayer("city-fill")) map.removeLayer("city-fill")
            if (map.getSource("cities")) map.removeSource("cities")
            map.flyTo({ center: [137, 38], zoom: 4 })
            return
        }

        const load = async () => {
            const res = await fetch(`/cities/${props.selectedPref}.json`)
            const geojson = await res.json()
            geojson.features.forEach((f: any) => {
                f.properties.aging_rate = props.cityRates[f.properties.N03_007]
            })
            if (map.getLayer("city-fill")) map.removeLayer("city-fill")
            if (map.getSource("cities")) map.removeSource("cities")
            map.addSource("cities", {type: "geojson", data: geojson})
            map.addLayer({id: "city-fill", type: "fill", source: "cities", paint: {
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
            }})
            map.fitBounds(prefBounds[props.selectedPref], { padding: 40})
        }
        load()
    }, [props.selectedPref])
    return <div ref={mapContainer} style={{ width: "100%", height: "500px" }} />
}