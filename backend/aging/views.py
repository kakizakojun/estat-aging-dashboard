from django.shortcuts import render
from django.http import JsonResponse
import json


data = json.load(open("aging_data.json", "r"))
# Create your views here.

def aging_list(request):
    pref = request.GET.get("pref")
    result = []
    if pref:
        for item in data:
            if item["pref"] == pref:
                result.append(item)
    else:
        result = data
    return JsonResponse(result, json_dumps_params={"ensure_ascii": False}, safe= False)