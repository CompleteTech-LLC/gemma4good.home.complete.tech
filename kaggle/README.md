# Gemma4Good Kaggle Helpers

Analyze one selected field image with the live Gemma4Good field-report API:

```bash
python kaggle/lib/fieldreport.py --image "demo-images/health_risk/g4g_20240109T184800Z_mogadishu-wadajir_health_risk_medium_03.jpg" --insecure
```

Replace the `--image` value with the selected PNG, JPEG, or WebP path. If a matching `.json` sidecar exists next to the image, the command uses it for location, tags, timestamp, and note metadata.

Add `--submit` only when you want to write the reviewed report to `/api/fieldreport/submit`.
