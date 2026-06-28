from django.http import JsonResponse
from .models import AgingRecord

def aging_list(request):
    pref = request.GET.get("pref")
    record = AgingRecord.objects.all()
    if pref:
        record = record.filter(pref=pref)
    result = list(record.values("area_code", "pref", "city", "aging_rate", "area_type"))
    return JsonResponse(result, json_dumps_params={"ensure_ascii": False}, safe= False)