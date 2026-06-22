'use client'
import { useState } from "react";
import { AgingItem,CityRow } from "./page";

export default function CityList(props:{data: AgingItem[]}) {
    const [selectedPref, setSelectedPref] = useState<string>("東京都");
    return(
        <div>
            <select onChange={(e) => setSelectedPref(e.target.value)}>
                <option value="東京都">東京都</option>
                <option value="北海道">北海道</option>
                <option value="沖縄県">沖縄県</option>
            </select>
            <p>選択中：{selectedPref}</p>
            <ul>{props.data.filter(item => item.pref === selectedPref).map((item) => <CityRow key={item.area_code} item={item}/>)}</ul>
        </div>
    )
}
