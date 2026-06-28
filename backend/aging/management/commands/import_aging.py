from django.core.management.base import BaseCommand
from aging.models import AgingRecord
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        data = json.load(open("aging_data.json"))
        AgingRecord.objects.all().delete()
        for item in data:
            AgingRecord.objects.create(**item)
        self.stdout.write(f"{AgingRecord.objects.count()}件取り込み完了")