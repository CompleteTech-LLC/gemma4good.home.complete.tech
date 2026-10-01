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

- `id`: filename stem shared by the image and JSON sidecar
- `image_file`: paired JPG or PNG filename in the same variation folder
- `variation`: category combination, using `+` between categories
- `timestamp`: varied ISO timestamp across 2024
- `location`: city, district, region, country, lat, lon
- `categories`: included Gemma4Good report categories
- `severity`: low, medium, high, or critical
- `short_note`: compact field-report note
- `composition`: intended visual composition
- `prompt`: source-of-truth image regeneration prompt object
- `generation_status`: current regeneration state
- `quality_status`: QA state for Mission Control display preference

## JSON-as-Prompt Workflow

Each sidecar JSON is the source of truth for its paired image. The prompt object is built from the record's own location, categories, severity, and short note so images can be regenerated as direct per-record field photos.

Prompt fields:

- `prompt_version`: prompt schema/version identifier.
- `scene`: location-specific Somalia 2024 humanitarian field-report setting.
- `required_visuals`: category-specific visual evidence that must appear.
- `composition`: one realistic smartphone field photo; no contact sheet unless explicitly stated.
- `style`: photorealistic natural daylight mobile-photo treatment.
- `avoid`: excluded content such as text, logos, identifiable faces, children, gore, illness, military, and political imagery.
- `generation_status`: `pending_regeneration`, `generated`, `regenerated`, or `approved`.
- `quality_status`: `needs_review`, `approved`, or `rejected`.

Regeneration flow:

1. Read a JSON record.
2. Generate the paired image from only that record's prompt object.
3. Save the new JPG/PNG to the exact `image_file` path beside the JSON.
4. Set `generation_status` to `regenerated`.
5. Review the result against the JSON metadata and set `quality_status` to `approved` or `rejected`.
6. Run `node scripts/verify-demo-images.mjs` and review `docs/demo-images-verification-report.json`.
7. Run `node scripts/verify-demo-images.mjs --strict` before treating the dataset as complete.

Dry-run the bulk regeneration queue:

```bash
node scripts/regenerate-demo-images.mjs --dry-run --limit 5
```

Run regeneration when `OPENAI_API_KEY` is available:

```bash
OPENAI_API_KEY=... node scripts/regenerate-demo-images.mjs --limit 20
```

By default the script uses `OPENAI_IMAGE_MODEL=gpt-image-1.5`, `OPENAI_IMAGE_SIZE=1024x1536`, and `OPENAI_IMAGE_QUALITY=medium`. These can be overridden with environment variables.

If local ComfyUI is running, regenerate through its API instead:

```bash
COMFYUI_URL=http://127.0.0.1:8188 node scripts/regenerate-demo-images-comfyui.mjs --limit 20
```

The ComfyUI path defaults to `COMFYUI_CHECKPOINT=v1-5-pruned-emaonly.ckpt` and can be dry-run with `--dry-run`.

Check available generation backends before running a batch:

```bash
node scripts/check-demo-image-generation-prereqs.mjs
```

See `docs/demo-images-generation-runbook.md` for backend repair, generation, and QA completion steps.

Mark a reviewed image:

```bash
node scripts/update-demo-image-quality.mjs --id g4g_20240125T122600Z_garowe-garowe_water_quality_high_01 --status approved
```

Add `--dry-run` to preview QA changes without writing JSON files.

Build a browser QA sheet:

```bash
node scripts/build-demo-image-qa-index.mjs
```

The generated sheet is written to `docs/demo-images-qa-index.html` and includes review commands for each record.

Bulk-mark only regenerated records after review:

```bash
node scripts/update-demo-image-quality.mjs --all --regenerated-only --status approved
```

Current state: prompt objects are present and unique for all 300 records. All 300 paired images have been directly regenerated from their sidecar JSON prompts and marked approved after the demo QA pass. Run `node scripts/verify-demo-images.mjs --strict` to confirm completion.

## Mission Control Preference

Mission Control should prefer records where `quality_status` is `approved` and `generation_status` is `regenerated` or `approved`. Records marked `needs_review` are usable as pre-QA demo data, but should be visually distinguished or ranked below approved records when approved replacements are available. Records marked `rejected` should be hidden from normal demo rotation.

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

The dataset previously used photorealistic category source panels generated for Gemma4Good, then assembled single-category photos and multi-category contact sheets. The current workflow replaces that with direct per-record generation from each sidecar JSON prompt.

For multi-category variations, each regenerated image should be one realistic smartphone field photo containing only the requested categories. Unused categories must not be added.
