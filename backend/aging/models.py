from django.db import models

# Create your models here.
class AgingRecord(models.Model):
    area_code = models.CharField(max_length=10)
    pref = models.CharField(max_length=20)
    city = models.CharField(max_length=50)
    aging_rate = models.FloatField()
    area_type = models.CharField(max_length=10)
