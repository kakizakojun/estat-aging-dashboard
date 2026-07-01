'use client'
import { useState } from "react"
import PrefMap from "./PrefMap"
import { AgingItem } from "./page"
import CityList from "./CityList"
import { regions } from "./regions"

export default function Dashboard(props: { data: AgingItem[], rates: Record<string, number> }){
    const [selectedPref, setSelectedPref] = useState("")
    const [selectedRegion, setSelectedRegion] = useState("")
    const regionRates = selectedRegion === "" ? [] :
    regions[selectedRegion].map(pref => props.rates[pref])
    const regionAvg  = regionRates.length === 0 ? 0 : regionRates.reduce((sum, r) => sum + r ,0) / regionRates.length
    
    return(
        <>
            <PrefMap rates={props.rates} onSelectPref = {setSelectedPref} selectedPref={selectedPref} selectedRegion={selectedRegion} />
            <CityList data={props.data} selectedPref={selectedPref} setSelectedPref={setSelectedPref} selectedRegion={selectedRegion} />
            <select onChange={(e) => {setSelectedRegion(e.target.value); setSelectedPref("") }} value={selectedRegion}>
                <option value="">全て</option>
                {Object.keys(regions).map(地方名 => <option key={地方名} value={地方名}>{地方名}</option>)}
            </select>
            <p>選択中の地方：{selectedRegion}</p>
            {selectedRegion !== "" &&
            <p>{selectedRegion}の平均：{regionAvg.toFixed(1)}%</p>}
        </>
    )
}