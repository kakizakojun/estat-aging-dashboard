'use client'
import { AgingItem,CityRow } from "./page";

export default function CityList(props:{data: AgingItem[],selectedPref: string, setSelectedPref: (pref: string) => void,}) {
    const {selectedPref, setSelectedPref } = props
    const prefList = Array.from(new Set(props.data.map(item => item.pref)))
    return(
        <div>
            <select onChange={(e) => setSelectedPref(e.target.value)} value={selectedPref}>
                <option value="">全て</option>
                {prefList.map(pref => <option key={pref} value={pref}>{pref}</option>)}
            </select>
            <p>選択中：{selectedPref}</p>
            <ul>{props.data.filter(item => selectedPref === "" || item.pref === selectedPref).map((item) => <CityRow key={item.area_code} item={item}/>)}</ul>
        </div>
    )
}
