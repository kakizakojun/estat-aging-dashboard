import requests
import json

# appidを取得し、e-statからAPIでデータ取得
appid = open("appid.txt").read().strip()
url = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
params = {
    "appId": appid,
    "statsDataId": "0000020101",
    "cdCat01": "A1101,A1303",
    "cdTime": "2020100000"
}
response = requests.get(url, params= params)
data = response.json()

values = data["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
population = {}

for i in values:
    if i['@area'] not in population:
        population[i['@area']] = {}
    population[i['@area']][i['@cat01']] = int(i['$'])

area_map = {}
# 地域コードから地域名を取得するためここで変換表作成
for i in data["GET_STATS_DATA"]["STATISTICAL_DATA"]["CLASS_INF"]["CLASS_OBJ"]:
    if i["@id"] == "area":
        for v in i["CLASS"]:
            area_map[v["@code"]] = {"name": v["@name"],"level": v["@level"]}

result = []
pref_total = {}

for code, count in population.items():
    # 特別区部を入れてしまうと二重で計算してしまうため除外
    if code == '13100':
        continue
    # 政令指定都市の区は市と二重カウントになるため除外。東京23区は独立した自治体なので残す
    if area_map[code]['level'] == '3' and not code.startswith('131'):
        continue
    # 総人口０を除外（例：原発事故の避難している双葉町）
    if count['A1101'] == 0:
        continue
    
    item = {
        "area_code": code,
        "pref": area_map[code]["name"].split()[0],
        "city": area_map[code]["name"].split()[1],
        "aging_rate": round(count['A1303'] / count['A1101']  * 100 , 1),
        "area_type": '市区町村',
    }
    result.append(item)
    pref = item['pref']
    if pref not in pref_total:
        pref_total[pref] = {'code': code[:2] + '000', 'A1101': 0,'A1303': 0}
    pref_total[pref]['A1101'] += count['A1101']
    pref_total[pref]['A1303'] += count['A1303']

for pref, total in pref_total.items():
    item = {
        "area_code": total['code'],
        "pref": pref,
        "city": pref,
        "aging_rate": round(total['A1303'] / total['A1101']  * 100 , 1),
        "area_type":"都道府県",
    }
    result.append(item)

result.sort(key= lambda p: p['area_code'])

# aging_data.jsonに情報書き出し
with open("aging_data.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)