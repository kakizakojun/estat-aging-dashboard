import urllib.request, json, os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "cities")
os.makedirs(OUT_DIR, exist_ok=True)

BASE = "https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_%02d_210101.json"

ok = 0
for code in range (1, 48):
    try:
        data = urllib.request.urlopen(BASE % code, timeout=30).read()
        name = json.loads(data)["features"][0]["properties"]["N03_001"]
        with open(os.path.join(OUT_DIR, f"{name}.json"), "wb") as f:
            f.write(data)
        ok += 1
        print("OK", name)

    except Exception as e:
        print("NG", code, e)

print(f"完了：{ok} / 47 県")