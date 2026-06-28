from django.contrib.gis.db import models

# Create your models here.
class AgingRecord(models.Model):
    area_code = models.CharField(max_length=10)
    pref = models.CharField(max_length=20)
    city = models.CharField(max_length=50)
    aging_rate = models.FloatField()
    area_type = models.CharField(max_length=10)

class Municipality(models.Model):
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=50)
    pref = models.CharField(max_length=20)
    aging_rate = models.FloatField(null=True)
    geom = models.MultiPolygonField(srid=4326)
