import requests
import json 

# appidを取得し、e-statからAPIでデータ取得
appid = open("appid.txt").read().strip()
url = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
params = {
    "appId": appid,
    "statsDataId": "0000032966",
    "cdCat01": "00700",
    "cdCat02": "000",
    "cdCat03": "000",
    "cdCat04": "565",
    "cdCat05": "002",
}
response = requests.get(url, params= params)
data = response.json()

# 地域コードから地域名を取得するためここで変換表作成
values = data["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
area_map = {}
for i in data["GET_STATS_DATA"]["STATISTICAL_DATA"]["CLASS_INF"]["CLASS_OBJ"]:
    if i["@id"] == "area":
        for v in i["CLASS"]:
            area_map[v["@code"]] = {"name": v["@name"],"level": v["@level"]}

# e-statのデータをviews.pyで使いやすい辞書型のリストに整形する
result = []
# 市区町村のデータに県名がないので直前に出てきた県名を覚えるための変数
current_pref = ""

for v in values:
    code = v["@area"]
    info = area_map[code]
    level = info["level"]
    # 小計と区は除外（小計は集計値で重複、区は市と二重カウントになるため）
    if level in ("3", "5"):
        continue
    # level2が都道府県
    if level == "2":
        area_type = "都道府県"
        current_pref = info["name"]
    else:
        area_type = "市区町村"

    item = {
        "area_code": code,
        "pref": current_pref,
        "city": info["name"],
        "aging_rate": float(v["$"]),
        "area_type": area_type,
    }
    result.append(item)

# aging_data.jsonに情報書き出し
with open("aging_data.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)