from django.core.management.base import BaseCommand
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.conf import settings
from aging.models import Municipality, AgingRecord
import json, os, glob

class Command(BaseCommand):
    def handle(self, *args, **options):
        rates = {r.area_code: r.aging_rate
            for r in AgingRecord.objects.filter(area_type="市区町村")}
        
        Municipality.objects.all().delete()
        cities_dir = os.path.join(settings.BASE_DIR, "..", "frontend", "public", "cities")
        count = 0
        for path in glob.glob(os.path.join(cities_dir, "*.json")):
            data = json.load(open(path))
            for f in data["features"]:
                p = f["properties"]
                geom = GEOSGeometry(json.dumps(f["geometry"]))
                if geom.geom_type == "Polygon":
                    geom = MultiPolygon(geom)
                
                Municipality.objects.create(
                    code=p["N03_007"],
                    name=p["N03_004"],
                    pref=p["N03_001"],
                    aging_rate=rates.get(p["N03_007"]),

                    geom=geom,
                )
                count += 1
        self.stdout.write(f"{count}件 取り込み完了")