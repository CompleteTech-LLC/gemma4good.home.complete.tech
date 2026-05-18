# Gemma4Good Schemas

These schemas describe the Field Report data contracts.

## Files

- `fieldreport-analysis.schema.json` describes the normalized Gemma4 analysis response.
- `reviewed-fieldreport.schema.json` describes a submitted, human-reviewed field report record.
- `examples/fieldreport-analysis.example.json` shows a model response with multiple suggested categories.
- `examples/reviewed-fieldreport.example.json` shows the final stored report shape after the user accepts or edits the draft.

## Category Rules

`analysis.category` is the primary model-selected category and remains for backward compatibility.

`analysis.categories` is the full list of model-suggested categories.

`tag` is the primary human-reviewed category and remains for backward compatibility.

`tags` is the final human-reviewed category list from the selected UI chips.
