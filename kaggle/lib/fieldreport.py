"""Command-line field-report client for Gemma4Good.

Run from the repository root:

    python kaggle/lib/fieldreport.py --image demo-images/health_risk/example.jpg --insecure
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://gemma4good.home.complete.tech"
ALLOWED_FIELD_TAGS = {"water_quality", "sanitation", "infrastructure", "health_risk"}


def find_repo_root(start: Path | None = None) -> Path:
    cwd = (start or Path.cwd()).resolve()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / "DOMAIN_CONTEXT.md").exists():
            return candidate
    return cwd


def resolve_path(path: str | Path, repo_root: Path | None = None) -> Path:
    candidate = Path(path).expanduser()
    if candidate.is_absolute():
        return candidate
    root = repo_root or find_repo_root()
    rooted = root / candidate
    if rooted.exists():
        return rooted
    return (Path.cwd() / candidate).resolve()


def detect_image_mime(path: Path) -> str:
    header = path.read_bytes()[:16]
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    return mimetypes.guess_type(path.name)[0] or "image/jpeg"


def image_data_url(path: Path) -> str:
    mime = detect_image_mime(path)
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError(f"Unsupported image type for {path}: {mime}")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def load_sidecar(image_path: Path) -> dict[str, Any]:
    sidecar = image_path.with_suffix(".json")
    if not sidecar.exists():
        return {}
    return json.loads(sidecar.read_text(encoding="utf-8"))


def clean_tags(value: Any) -> list[str]:
    tags = value if isinstance(value, list) else [value] if isinstance(value, str) else []
    return [tag for tag in tags if tag in ALLOWED_FIELD_TAGS]


def build_payload(
    image_path: Path,
    *,
    tag: str | None = None,
    tags: list[str] | None = None,
    city: str | None = None,
    district: str | None = None,
    lat: str | None = None,
    lon: str | None = None,
    note: str | None = None,
    captured_at: str | None = None,
) -> dict[str, Any]:
    metadata = load_sidecar(image_path)
    location = metadata.get("location") if isinstance(metadata.get("location"), dict) else {}
    metadata_tags = clean_tags(metadata.get("categories"))
    selected_tags = clean_tags(tags or [])
    selected_tag = tag if tag in ALLOWED_FIELD_TAGS else None
    all_tags = list(dict.fromkeys([*(selected_tags or metadata_tags), *([selected_tag] if selected_tag else [])]))

    return {
        "imageDataUrl": image_data_url(image_path),
        "tag": selected_tag or (all_tags[0] if all_tags else ""),
        "tags": all_tags,
        "district": district if district is not None else str(location.get("district") or ""),
        "city": city if city is not None else str(location.get("city") or ""),
        "lat": lat if lat is not None else "" if location.get("lat") is None else str(location.get("lat")),
        "lon": lon if lon is not None else "" if location.get("lon") is None else str(location.get("lon")),
        "note": note
        if note is not None
        else str(metadata.get("short_note") or metadata.get("scene_context") or "Notebook field-report analysis run."),
        "capturedAt": captured_at if captured_at is not None else str(metadata.get("timestamp") or ""),
        "capturedAtSource": "demo" if metadata else "manual",
    }


def request_json(
    method: str,
    base_url: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    verify_tls: bool = True,
    timeout: int = 180,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    context = None if verify_tls else ssl._create_unverified_context()
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with HTTP {error.code}: {detail}") from error


def analyze(
    image_path: Path,
    *,
    base_url: str = DEFAULT_BASE_URL,
    verify_tls: bool = True,
    timeout: int = 180,
    **payload_options: Any,
) -> dict[str, Any]:
    payload = build_payload(image_path, **payload_options)
    analysis = request_json("POST", base_url, "/api/fieldreport/analyze", payload, verify_tls=verify_tls, timeout=timeout)
    return {"image": str(image_path), "payload": redact_payload(payload), "analysis": analysis}


def prepare_reviewed_report(payload: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    analysis_category = analysis.get("category")
    payload_tags = clean_tags(payload.get("tags"))
    review_tags = sorted(set(payload_tags + ([analysis_category] if analysis_category in ALLOWED_FIELD_TAGS else [])))
    review_tag = analysis_category if analysis_category in ALLOWED_FIELD_TAGS else payload.get("tag") or "water_quality"
    if review_tag not in ALLOWED_FIELD_TAGS:
        review_tag = "water_quality"

    reviewed = dict(payload)
    reviewed.update(
        {
            "tag": review_tag,
            "tags": review_tags or [review_tag],
            "note": analysis.get("summary") or payload.get("note"),
            "analysis": analysis,
        }
    )
    return reviewed


def submit(
    image_path: Path,
    *,
    base_url: str = DEFAULT_BASE_URL,
    verify_tls: bool = True,
    timeout: int = 180,
    **payload_options: Any,
) -> dict[str, Any]:
    payload = build_payload(image_path, **payload_options)
    analysis = request_json("POST", base_url, "/api/fieldreport/analyze", payload, verify_tls=verify_tls, timeout=timeout)
    reviewed = prepare_reviewed_report(payload, analysis)
    result = request_json("POST", base_url, "/api/fieldreport/submit", reviewed, verify_tls=verify_tls, timeout=timeout)
    return {"image": str(image_path), "payload": redact_payload(reviewed), "analysis": analysis, "submit": result}


def redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(payload)
    if "imageDataUrl" in redacted:
        redacted["imageDataUrl"] = f"<data URL, {len(payload['imageDataUrl'])} chars>"
    return redacted


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze one selected field-report image with Gemma4Good.")
    parser.add_argument("--image", required=True, help="Path to the selected PNG, JPEG, or WebP image.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Field-report service URL. Default: {DEFAULT_BASE_URL}")
    parser.add_argument("--insecure", action="store_true", help="Disable TLS certificate verification.")
    parser.add_argument("--timeout", type=int, default=180, help="Request timeout in seconds.")
    parser.add_argument("--tag", choices=sorted(ALLOWED_FIELD_TAGS), help="Optional primary field-report tag.")
    parser.add_argument("--tags", nargs="*", choices=sorted(ALLOWED_FIELD_TAGS), help="Optional field-report tags.")
    parser.add_argument("--city", help="City override.")
    parser.add_argument("--district", help="District override.")
    parser.add_argument("--lat", help="Latitude override.")
    parser.add_argument("--lon", help="Longitude override.")
    parser.add_argument("--note", help="Reporter note override.")
    parser.add_argument("--captured-at", help="ISO-8601 capture timestamp override.")
    parser.add_argument("--submit", action="store_true", help="Submit the reviewed report after analysis.")
    parser.add_argument("--out", help="Optional output JSON path.")
    parser.add_argument("--compact", action="store_true", help="Print compact JSON instead of indented JSON.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    repo_root = find_repo_root()
    image_path = resolve_path(args.image, repo_root)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    options = {
        "tag": args.tag,
        "tags": args.tags,
        "city": args.city,
        "district": args.district,
        "lat": args.lat,
        "lon": args.lon,
        "note": args.note,
        "captured_at": args.captured_at,
    }
    options = {key: value for key, value in options.items() if value is not None}

    if args.submit:
        result = submit(
            image_path,
            base_url=args.base_url,
            verify_tls=not args.insecure,
            timeout=args.timeout,
            **options,
        )
    else:
        result = analyze(
            image_path,
            base_url=args.base_url,
            verify_tls=not args.insecure,
            timeout=args.timeout,
            **options,
        )

    text = json.dumps(result, separators=(",", ":") if args.compact else None, indent=None if args.compact else 2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
