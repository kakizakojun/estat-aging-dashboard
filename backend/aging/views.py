from django.shortcuts import render
from django.http import JsonResponse

# Create your views here.
def aging_list(request):
    data = [{"city": "大分市", "aging_rate": 0.31},{"city": "別府市", "aging_rate": 0.36}, {"city": "中津市", "aging_rate": 0.33}]
    return JsonResponse(data, json_dumps_params={"ensure_ascii": False}, safe= False)