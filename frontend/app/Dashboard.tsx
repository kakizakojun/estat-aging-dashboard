'use client'
import { useState } from "react"
import PrefMap from "./PrefMap"
import { CityRow } from "./page"
import { AgingItem } from "./page"
import CityList from "./CityList"

export default function Dashboard(props: { data: AgingItem[], rates:Record<string, number> }){
    const [selectedPref, setSelectedPref] = useState("")
    
    return(
        <>
            <PrefMap rates={props.rates} onSelectPref = {setSelectedPref} selectedPref={selectedPref} />
            <CityList data={props.data} selectedPref={selectedPref} setSelectedPref={setSelectedPref} />          
        </>
    )
}