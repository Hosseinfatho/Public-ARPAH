#!/usr/bin/env python3
"""
Generate notes_manifest.json for a patient folder.

Scans SpanTrex_OP/*.json under a patient folder
Infers lane from path (md/rn/pt/ot/slp/sw/unidentified)
Infers date from filename (YYYY-MM-DD) or JSON content fallback
Writes notes_manifest.json in the dashboard format: {"files":[{"path","lane","date"}]}

Output format:
{
  "files": [
    {"path": "data/<patient>/.../SpanTrex_OP/<file>.json", "lane": "MD", "date": "YYYY-MM-DD"},
    ...
  ]
}

Usage:
python3 generate_note_manifest.py \
  --patient-dir data/UIC_Falls__10707 \
  --data-root data \
  --include-settings inpatient

"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

LANE_FROM_DISCIPLINE = {
    "md": "MD",
    "rn": "RN",
    "pt": "PT",
    "ot": "OT",
    "slp": "SLP",
    "sw": "SW",
    # Keep legacy behavior used in this repo's patient-1 manifest.
    "unidentified": "SW",
}

ISO_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _infer_date_from_json_payload(payload: dict[str, Any]) -> str | None:
    # Try common metadata keys first.
    for key in ("date", "note_date", "service_date", "encounter_date", "doc_date"):
        value = payload.get(key)
        if isinstance(value, str):
            m = ISO_DATE_RE.search(value)
            if m:
                return m.group(1)

    # Fall back to DATE entities and their "cui" field.
    entities = payload.get("entities")
    if isinstance(entities, dict):
        for item in entities.values():
            if not isinstance(item, dict):
                continue
            if str(item.get("type", "")).upper() != "DATE":
                continue
            cui = item.get("cui")
            if isinstance(cui, str):
                m = ISO_DATE_RE.search(cui)
                if m:
                    return m.group(1)
    return None


def _infer_lane_from_path(span_file: Path, patient_dir: Path) -> str | None:
    rel_parts = span_file.relative_to(patient_dir).parts
    rel_parts_lower = [p.lower() for p in rel_parts]

    # Look for discipline folder before setting folder (e.g., md/INPATIENT/SpanTrex_OP/...).
    for i, part in enumerate(rel_parts_lower):
        if part in {"inpatient", "outpatient"} and i > 0:
            return LANE_FROM_DISCIPLINE.get(rel_parts_lower[i - 1])

    # Otherwise use first matching folder token in relative path.
    for part in rel_parts_lower:
        if part in LANE_FROM_DISCIPLINE:
            return LANE_FROM_DISCIPLINE[part]
    return None


def _build_manifest_entries(
    patient_dir: Path,
    data_root: Path,
    include_settings: set[str] | None,
    fail_on_missing: bool,
) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    errors: list[str] = []

    for span_file in sorted(patient_dir.rglob("SpanTrex_OP/*.json")):
        rel_to_patient = span_file.relative_to(patient_dir)
        rel_lower = [p.lower() for p in rel_to_patient.parts]

        # Optional filtering by setting (INPATIENT / OUTPATIENT)
        if include_settings:
            setting_found = None
            for p in rel_lower:
                if p in {"inpatient", "outpatient"}:
                    setting_found = p
                    break
            if setting_found and setting_found not in include_settings:
                continue

        lane = _infer_lane_from_path(span_file, patient_dir)
        if not lane:
            msg = f"Could not infer lane from path: {span_file}"
            if fail_on_missing:
                errors.append(msg)
                continue
            lane = "SW"

        date_match = ISO_DATE_RE.search(span_file.name)
        date = date_match.group(1) if date_match else None
        if not date:
            payload = _read_json(span_file)
            date = _infer_date_from_json_payload(payload)
        if not date:
            msg = f"Could not infer date for file: {span_file}"
            if fail_on_missing:
                errors.append(msg)
                continue
            date = "1970-01-01"

        rel_to_data_root = span_file.relative_to(data_root).as_posix()
        entries.append(
            {
                "path": f"data/{rel_to_data_root}",
                "lane": lane,
                "date": date,
            }
        )

    if errors:
        raise ValueError("Manifest generation failed:\n- " + "\n- ".join(errors))

    entries.sort(key=lambda x: (x["date"], x["lane"], x["path"]))
    return entries


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create notes_manifest.json from patient SpanTrex_OP notes."
    )
    parser.add_argument(
        "--patient-dir",
        required=True,
        help="Absolute or relative path to patient folder (e.g. data/UIC_Falls__10707).",
    )
    parser.add_argument(
        "--data-root",
        default="data",
        help="Path to data root used to build relative manifest paths (default: data).",
    )
    parser.add_argument(
        "--output",
        default="notes_manifest.json",
        help="Output file path (default: <patient-dir>/notes_manifest.json).",
    )
    parser.add_argument(
        "--include-settings",
        nargs="*",
        choices=["inpatient", "outpatient"],
        default=None,
        help="Optional filter by setting folder(s). Example: --include-settings inpatient",
    )
    parser.add_argument(
        "--allow-missing-fields",
        action="store_true",
        help="Allow missing lane/date and fill with defaults instead of failing.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    patient_dir = Path(args.patient_dir).resolve()
    if not patient_dir.exists() or not patient_dir.is_dir():
        raise FileNotFoundError(f"Patient folder not found: {patient_dir}")

    data_root = Path(args.data_root).resolve()
    if not data_root.exists() or not data_root.is_dir():
        raise FileNotFoundError(f"Data root not found: {data_root}")

    if args.output == "notes_manifest.json":
        output_path = patient_dir / "notes_manifest.json"
    else:
        output_path = Path(args.output).resolve()

    include_settings = set(args.include_settings) if args.include_settings else None
    files = _build_manifest_entries(
        patient_dir=patient_dir,
        data_root=data_root,
        include_settings=include_settings,
        fail_on_missing=not args.allow_missing_fields,
    )

    payload = {"files": files}
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(files)} entries to {output_path}")


if __name__ == "__main__":
    main()
