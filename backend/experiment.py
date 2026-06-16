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
print(len(values))
print(values[0])

times = set(v["@time"] for v in values)
print(times)