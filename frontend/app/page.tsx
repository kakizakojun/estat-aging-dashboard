import Dashboard from "./Dashboard"

export type AgingItem ={
  area_code: string
  pref: string
  city: string
  aging_rate: number
  area_type: string
}

export default async function Home() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/aging/`)
  const data: AgingItem[] = await res.json()
  const count = data.length
  const rates = Object.fromEntries(
    data.filter(item => item.area_type === "都道府県").map(item => [item.pref, item.aging_rate])
  )

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
          <h1>高齢化ダッシュボード（{count}件）</h1>
          <Dashboard data={data} rates={rates} />
      </main>
    </div>
  );
}

export function CityRow(props: {item: AgingItem }){
  return(
    <li>{props.item.pref} {props.item.city}：{props.item.aging_rate}%</li>
  )
}

