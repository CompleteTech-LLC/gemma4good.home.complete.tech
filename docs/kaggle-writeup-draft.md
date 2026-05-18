# Gemma4Good Field Report

## Subtitle

Local Gemma 4 vision triage for faster, safer water and sanitation response.

## Selected Tracks

- Main Track
- Impact Track: Global Resilience / Safety & Trust
- Special Technology Track: llama.cpp

## Writeup

In a field response, the first report is often the most fragile piece of the system. A community worker may see brown water at a public tap, sewage runoff near a collection point, or a broken pipe flooding the road. They may have only a phone, a weak connection, and a few seconds to capture what is happening. The difference between a vague note and a structured, actionable report can determine whether a local team responds today or loses the signal in a queue.

Gemma4Good Field Report is a local-first reporting workflow for water, sanitation, infrastructure, and health-risk triage. The app lets a field worker capture an image, location, time, and short note. Gemma 4 analyzes the image and metadata, then proposes a structured report: category, severity, summary, observed issues, recommended actions, escalation flag, and confidence. The human stays in control: every AI draft is reviewed and corrected before submission.

The live demo is intentionally simple. The first screen is the real workflow, not a slide deck: capture image, confirm location, analyze with Gemma 4, review, submit. A companion Mission Control view aggregates reviewed reports and approved demo records into map points, severity distributions, category detections, and operational alerts. This shows the complete loop from observation to triage to response planning.

The technical center is Gemma 4 running locally through llama.cpp. The current deployment uses the `ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M` multimodal model behind a private llama.cpp Vulkan runtime. The browser never talks to the raw model endpoint. Instead, it calls a narrow same-origin Field Report API that validates requests, resizes image payloads, sends a constrained prompt to Gemma 4, repairs malformed JSON when possible, normalizes the result against a schema, and returns only the fields needed for review.

This design is deliberate. Public-health and infrastructure reporting often involves sensitive places, vulnerable communities, and unreliable connectivity. A local model reduces dependence on distant services, keeps raw model access off the public internet, and makes the system more realistic for constrained environments. The API boundary also lets us enforce operational guardrails: no medical diagnosis, no invented engineering certainty, no unsupported epidemiological claims, and lower confidence when the image is unclear.

The Gemma 4 prompt is short and field-safe. It tells the model to return strict JSON only, choose from known categories, use one severity value, and provide concrete next steps. The schema restricts output to actionable fields: `summary`, `severity`, `category`, `categories`, `observedIssues`, `recommendedActions`, `needsEscalation`, and `confidence`. If Gemma 4 fails to return valid structured output, the API falls back to a conservative review-required analysis rather than pretending the model was certain.

A key engineering challenge was preventing stale AI results from entering a human report. Field users often retake or replace an image. The interface now invalidates previous analysis when the image changes, waits until the new image data is ready before enabling analysis, ignores stale model responses, and clears old draft content when a new capture starts. This matters because the safest workflow is not merely "AI can analyze an image"; it is "AI cannot silently attach yesterday's result to today's report."

To support repeatable demos and evaluation, the project includes a 300-record Somalia field-report image dataset. Each record has a paired image and JSON sidecar covering combinations of water quality, sanitation, infrastructure, and health-risk categories across realistic locations. The current verification report shows 300 images, 300 JSON files, 15 category variations, 300 unique prompts, and all records marked approved for both generation and quality status. The dataset is used as demo and QA evidence for Mission Control, not as a hidden benchmark or a claim of real incident ground truth.

The project is built for verification. The submission source package includes the browser workflow, Field Report API, system prompt, request fixture, JSON schemas, Kaggle criteria notes, license notice, and a Kaggle-ready evidence notebook. The notebook is standalone; it does not require access to the private model server. It documents architecture, links, dataset provenance, schema expectations, and optional live API checks. The winning-submission materials are licensed under CC-BY 4.0, while third-party models, runtimes, and datasets remain under their own licenses.

For impact, Gemma4Good targets a narrow but high-leverage problem: turning messy field observations into structured, reviewable action signals. In a crisis, a photo of a broken water point should become more than a saved image. It should become a prioritized report with location, severity, evidence, recommended next action, and enough confidence information for a human coordinator to decide what happens next.

The result is a functional proof of concept for privacy-aware, local frontier intelligence in civic response. It uses Gemma 4 where the model is strongest: multimodal understanding, grounded summarization, and structured reasoning over messy real-world context. It avoids replacing field teams. Instead, it gives them a faster first draft, a safer review process, and a clearer path from evidence to action.

## Submission Attachments To Add In Kaggle UI

- Live demo: `https://gemma4good.home.complete.tech/menu/fieldreport/`
- Mission Control: `https://gemma4good.home.complete.tech/menu/missioncontrol/`
- Public code: attach the public repository or Kaggle Notebook link after publishing.
- Video: attach the public YouTube link, 3 minutes or less.
- Cover image: attach in the Media Gallery.
