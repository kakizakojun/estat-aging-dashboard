from statistics import geometric_mean
from django.http import JsonResponse, HttpResponse
from .models import AgingRecord, Municipality
from django.core.serializers import serialize

def aging_list(request):
    pref = request.GET.get("pref")
    record = AgingRecord.objects.all()
    if pref:
        record = record.filter(pref=pref)
    result = list(record.values("area_code", "pref", "city", "aging_rate", "area_type"))
    return JsonResponse(result, json_dumps_params={"ensure_ascii": False}, safe= False)

def cities_list(request):
    pref = request.GET.get("pref")
    record = Municipality.objects.all()
    if pref:
        record = record.filter(pref=pref)
    result = serialize("geojson", record, geometry_field="geom", fields=["code", "name", "aging_rate"])
    return HttpResponse(result, content_type="application/json")
