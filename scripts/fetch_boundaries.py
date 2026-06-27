import urllib.request, json, os, subprocess

api = json.load(urllib.request.urlopen("http://localhost:8000/api/aging/"))
pref_cities = {}
for x in api:
    if x["area_type"] == "市区町村":
        pref_cities.setdefault(x["pref"], []).append(x["area_code"])

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "cities")
os.makedirs(OUT_DIR, exist_ok=True)

for pref, codes in pref_cities.items():
    feats = []
    for code in codes:
        url = f"https://raw.githubusercontent.com/niiyz/JapanCityGeoJson/master/geojson/{code[:2]}/{code}.json"
        try:
            d = json.loads(urllib.request.urlopen(url, timeout=20).read())
            feats += d["features"]
        except Exception:
            pass
    raw = os.path.join(OUT_DIR, "_raw.json")
    with open(raw, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False)

    out = os.path.join(OUT_DIR, f"{pref}.json")
    subprocess.run(["npx", "mapshaper", raw, "-simplify", "interval=200", "keep-shapes", "-o", out], check=True)
    os.remove(raw)
    print("ok", pref, len(feats))

print("完了")