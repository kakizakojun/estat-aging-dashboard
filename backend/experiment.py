import requests

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

values = data["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
# print(len(values))
# print(values[0])

times = set(v["@time"] for v in values)
# print(times)
# print(data["GET_STATS_DATA"]["STATISTICAL_DATA"]["CLASS_INF"]["CLASS_OBJ"])

area_map = {}
for i in data["GET_STATS_DATA"]["STATISTICAL_DATA"]["CLASS_INF"]["CLASS_OBJ"]:
    if i["@id"] == "area":
        area_class = i["CLASS"]
        for v in i["CLASS"]:
            area_map[v["@code"]] = {"name": v["@name"],"level": v["@level"]}
            # area_map["name"] = v["@name"]
            
# print(len(area_map))
# print(area_map)

result = []
for v in values:
    code = v["@area"]
    info = area_map[code]
    level = info["level"]
    if level in ("3", "5"):
        continue
    if level == "2":
        type = "都道府県"
    else:
        type = "市区町村"

    item = {
        "city": info["name"],
        "aging_rate": float(v["$"]),
        "type": type,
    }
    result.append(item)

print(len(result))
print([r for r in result if r["type"] == "都道府県"][:3])

leves = set(v["@level"] for v in area_class)
# print(leves)
# print(result[:5])

level_example = {}
for v in area_class:
    if v["@level"] not in level_example:
        level_example[v["@level"]] = v["@name"]

# print(level_example)
