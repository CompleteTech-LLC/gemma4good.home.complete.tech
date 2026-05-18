# Gemma4Good Field Report Demo Images

Exhaustive photorealistic-natural demo dataset for Somalia humanitarian water and sanitation field-report workflows.

## Counts

- Total dataset images: 300
- Total sidecar JSON files: 300
- Images per category variation: 20
- Category variations: 15 non-empty combinations of water_quality, sanitation, infrastructure, and health_risk

## Category Variations

- `water_quality`: 20 images
- `sanitation`: 20 images
- `infrastructure`: 20 images
- `health_risk`: 20 images
- `water_quality+sanitation`: 20 images
- `water_quality+infrastructure`: 20 images
- `water_quality+health_risk`: 20 images
- `sanitation+infrastructure`: 20 images
- `sanitation+health_risk`: 20 images
- `infrastructure+health_risk`: 20 images
- `water_quality+sanitation+infrastructure`: 20 images
- `water_quality+sanitation+health_risk`: 20 images
- `water_quality+infrastructure+health_risk`: 20 images
- `sanitation+infrastructure+health_risk`: 20 images
- `water_quality+sanitation+infrastructure+health_risk`: 20 images

## Filename Pattern

```text
g4g_<YYYYMMDDTHHMMSSZ>_<city-district>_<variation>_<severity>_<01-20>.jpg
g4g_<YYYYMMDDTHHMMSSZ>_<city-district>_<variation>_<severity>_<01-20>.json
```

Example:

```text
g4g_20240314T111500Z_mogadishu-hodan_water_quality+sanitation_high_07.jpg
```

## Sidecar JSON Fields

- `variation`: category combination, using `+` between categories
- `timestamp`: varied ISO timestamp across 2024
- `location`: city, district, region, country, lat, lon
- `categories`: included Gemma4Good report categories
- `severity`: low, medium, high, or critical
- `short_note`: compact field-report note
- `composition`: single photo or contact-sheet panel count

## Locations Covered

- Adado, Adado, Galguduud
- Afgooye, Afgooye, Lower Shabelle
- Baidoa, Baidoa, Bay
- Bardera, Bardera, Gedo
- Beledweyne, Beledweyne, Hiraan
- Borama, Borama, Awdal
- Burao, Burao, Togdheer
- Dhobley, Dhobley, Lower Juba
- Doolow, Doolow, Gedo
- Erigavo, Erigavo, Sanaag
- Galkayo, Galkayo, Mudug
- Garowe, Garowe, Nugaal
- Hargeisa, Hargeisa, Maroodi Jeex
- Luuq, Luuq, Gedo
- Marka, Marka, Lower Shabelle
- Mogadishu, Daynile, Banaadir
- Mogadishu, Kahda, Banaadir
- Mogadishu, Wadajir, Banaadir
- Qardho, Qardho, Bari
- Wanlaweyn, Wanlaweyn, Lower Shabelle

## Visual Rules

- `water_quality`: turbid, brown, cloudy, oily, or sediment-heavy water in containers, wells, or taps.
- `sanitation`: standing wastewater, poor drainage, litter, open runoff, muddy public water points, non-graphic sanitation issues.
- `infrastructure`: leaking pipe, broken tap, damaged valve, cracked tank, broken hand pump, wet ground from water-system failure.
- `health_risk`: unsafe collection areas, muddy puddles, crowding risk, open containers near poor drainage; no visible illness or injury.

## Generation Notes

The dataset uses photorealistic category source panels generated for Gemma4Good, then assembles single-category photos and multi-category clean contact sheets without text, labels, UI, logos, watermarks, political content, military content, gore, injury, or visible disease symptoms.

For multi-category variations, each image contains only the requested categories. Unused category quadrants are not included.
