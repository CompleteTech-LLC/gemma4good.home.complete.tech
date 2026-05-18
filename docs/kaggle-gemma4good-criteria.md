# Kaggle Gemma 4 Good Criteria

Source checked: Kaggle competition pages for `gemma-4-good-hackathon` on 2026-05-18.

Primary links:

- Competition: https://www.kaggle.com/competitions/gemma-4-good-hackathon
- Projects/writeups: https://www.kaggle.com/competitions/gemma-4-good-hackathon/projects
- Gemma 4 model page: https://www.kaggle.com/models/google/gemma-4

## Competition Shape

- Title: The Gemma 4 Good Hackathon.
- Host: Google DeepMind.
- Competition ID: `134561`.
- Final submission deadline: 2026-05-18 23:59 UTC.
- Team size: up to 5.
- Each team may submit one final Kaggle Writeup. Draft/unsubmitted writeups are not considered.
- Kaggle currently reports required writeup assets: video, project links, and a cover/card image.

## Valid Submission Requirements

A valid final submission must be a submitted Kaggle Writeup with:

- Public video attached in the Media Gallery.
- Public code repository link under Writeup attachments / Project Links. Kaggle says this is the source of truth and is non-negotiable.
- Live demo URL or files under Project Links or Files, if applicable.
- Media Gallery assets, including a required cover image.
- Selected track on the writeup.
- Writeup length at or below 1,500 words to avoid penalty.

Video requirements:

- Published to YouTube.
- Direct link provided.
- Viewable by judges without login.
- 3 minutes or less.
- Demonstrates the project in action and tells the story of the problem and solution.

Code requirements:

- Publicly accessible without login or paywall.
- Well documented.
- Clearly shows the Gemma 4 implementation.
- Enough architecture, training/inference, and environment detail for judges to verify the demo is backed by real engineering.

## Judging Rubric

| Criterion | Points | What Kaggle Says It Rewards |
| --- | ---: | --- |
| Impact & Vision | 40 | Clear, compelling solution to a significant real-world problem with tangible potential for positive change. |
| Video Pitch & Storytelling | 30 | Exciting, engaging, well-produced video that tells a powerful story. |
| Technical Depth & Execution | 30 | Innovative use of Gemma 4 features, functional real technology, strong engineering, and no fake demo. |

## Relevant Tracks

Main Track:

- Overall prizes for exceptional vision, technical execution, and real-world impact.

Impact Track:

- Health & Sciences.
- Global Resilience.
- Future of Education.
- Digital Equity & Inclusivity.
- Safety & Trust.

Special Technology Track:

- Cactus.
- LiteRT.
- llama.cpp.
- Ollama.
- Unsloth.

For this project, the strongest current fit is likely:

- Impact: Global Resilience and/or Safety & Trust.
- Technology: llama.cpp, because the deployed runtime uses Gemma 4 through a local llama.cpp Vulkan service.
- Technology: Unsloth only if we complete and publish a fine-tuned Gemma 4 model.

## Notebook Implications

The notebook should not be treated as a Kaggle leaderboard submission. It should act as one public, reproducible evidence artifact for the Writeup:

- Do not require the private/live server for the notebook to execute.
- State the live demo URL.
- State the public repository URL.
- Show the architecture and exact Gemma 4 usage.
- Include environment and dependency notes for local llama.cpp/Vulkan deployment.
- Include schema and request/response examples for the Field Report workflow.
- Include data provenance and status checks.
- Keep live API/server checks optional and skipped by default.
- Avoid claiming the rebuilt `demo-images` dataset is final training data until its metadata is no longer pending regeneration / needs review.
- Include any fine-tuning section only after there are approved records and published model artifacts.
