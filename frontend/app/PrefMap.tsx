'use client'
import { useRef, useEffect } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { regionBounds } from "./regionBounds"
import { prefBounds } from "./prefBounds"

export default function PrefMap(props: {rates: Record<string, number>, onSelectPref: (pref: string) => void, selectedPref: string, selectedRegion: string }){
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
            const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false})
            map.on("mousemove", "pref-fill", (e) => {
                const f = e.features![0]
                popup.setLngLat(e.lngLat).setHTML(`${f.properties.nam_ja}:${f.properties.aging_rate}%`).addTo(map)
            })
            map.on("mouseleave", "pref-fill", () => {
                popup.remove()
            })
            map.on("mousemove", "city-fill", (e) => {
                const f = e.features![0]
                popup.setLngLat(e.lngLat).setHTML(`${f.properties.name}:${f.properties.aging_rate}%`).addTo(map)
            })
            map.on("mouseleave", "city-fill", () => {
                popup.remove()
            })
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
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cities/?pref=${props.selectedPref}`)
                const geojson = await res.json()
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
            } catch (e) {
                console.error("市区町村データの取得に失敗：", e)
            } 
        }
        load()
    }, [props.selectedPref])

    return (
    <div style={{ position: "relative", width: "100%" }}>
        <div ref={mapContainer} style={{ width: "100%", height: "500px"}} />
        <div style={{
            position: "absolute", "bottom": 10, right: 10,
            background: "white", padding: 8, borderRadius: 4, fontSize: 12,
        }}>
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <div style={{width: 12, height: 12, background: "#ffffb2"}}/>
                <span>~15%</span>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <div style={{width: 12, height: 12, background: "#fecc5c"}}/>
                <span>15~18%</span>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <div style={{width: 12, height: 12, background: "#fd8d3c"}}/>
                <span>18~21%</span>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <div style={{width: 12, height: 12, background: "#f03b20"}}/>
                <span>21~24%</span>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <div style={{width: 12, height: 12, background: "#bd0026"}}/>
                <span>24%~</span>
            </div>
        </div>
    </div>)
}