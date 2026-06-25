'use client'
import { useState } from "react"
import PrefMap from "./PrefMap"
import { AgingItem } from "./page"
import CityList from "./CityList"
import { regions } from "./regions"

export default function Dashboard(props: { data: AgingItem[], rates:Record<string, number> }){
    const [selectedPref, setSelectedPref] = useState("")
    const [selectedRegion, setSelectedRegion] = useState("")
    
    return(
        <>
            <PrefMap rates={props.rates} onSelectPref = {setSelectedPref} selectedPref={selectedPref} />
            <CityList data={props.data} selectedPref={selectedPref} setSelectedPref={setSelectedPref} selectedRegion={selectedRegion} />
            <select onChange={(e) => {setSelectedRegion(e.target.value); setSelectedPref("") }} value={selectedRegion}>
                <option value="">全て</option>
                {Object.keys(regions).map(地方名 => <option key={地方名} value={地方名}>{地方名}</option>)}
            </select>
            <p>選択中の地方：{selectedRegion}</p>  
        </>
    )
}