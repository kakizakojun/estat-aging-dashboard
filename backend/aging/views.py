from django.shortcuts import render
from django.http import JsonResponse

# Create your views here.
def aging_list(request):
    data = [
        {"pref": "大分県","city": "大分市", "aging_rate": 0.31},
        {"pref": "大分県","city": "別府市", "aging_rate": 0.36}, 
        {"pref": "福岡県","city": "福岡市", "aging_rate": 0.33}
        ]
    pref = request.GET.get("pref")
    result = []
    if pref:
        for item in data:
            if item["pref"] == pref:
                result.append(item)
    else:
        result = data
    return JsonResponse(result, json_dumps_params={"ensure_ascii": False}, safe= False)