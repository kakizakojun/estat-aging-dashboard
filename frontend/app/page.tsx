type AgingItem ={
  area_code: string
  pref: string
  city: string
  aging_rate: number
  area_type: string
}

export default async function Home() {
  const res = await fetch("http://localhost:8000/api/aging/")
  const data: AgingItem[] = await res.json()
  const count = data.length
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
          <h1>高齢化ダッシュボード（{count}件）</h1>
          <ul>{data.map((item) => <li key={item.area_code}>{item.city},{item.aging_rate}</li>)}</ul>
      </main>
    </div>
  );
}
