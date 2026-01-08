from __future__ import annotations

import json
import os
import re
import sqlite3
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/products", tags=["products"])

OFF_BASE = os.environ.get("AI_FOODSCAN_OFF_BASE", "https://world.openfoodfacts.org").rstrip("/")
OFF_TIMEOUT_SEC = float(os.environ.get("AI_FOODSCAN_OFF_TIMEOUT_SEC", "10"))

OFF_FIELDS = [
    "code",
    "product_name",
    "product_name_en",
    "brands",
    "image_front_url",
    "ingredients_text",
    "ingredients_text_en",
    "allergens_tags",
    "traces_tags",
    "additives_tags",
    "additives_original_tags",
    "nutriscore_grade",
    "ecoscore_grade",
    "ecoscore_score",
]

def _find_db_path() -> Optional[Path]:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[4] / "data" / "risk.db",  # .../apps/api/data/risk.db (most common)
        here.parents[3] / "data" / "risk.db",  # fallback
        here.parents[5] / "data" / "risk.db",  # fallback
        Path.cwd() / "data" / "risk.db",       # if started from apps/api
    ]
    for c in candidates:
        try:
            if c.exists():
                return c
        except Exception:
            pass
    return None

DB_PATH = _find_db_path()

def _conn() -> sqlite3.Connection:
    if not DB_PATH or not DB_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Missing risk DB (risk.db). Looked for it near route file and CWD. DB_PATH={DB_PATH}")
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c

def _norm_e(x: str) -> str:
    return str(x or "").strip().upper().replace(" ", "")

def _base_e(x: str) -> str:
    s = _norm_e(x)
    m = re.match(r"^(E\d{3,4})", s)
    return m.group(1) if m else s

def _tag_tail(tag: str) -> str:
    return str(tag or "").strip().lower().split(":")[-1]  # "en:e150d" -> "e150d"

def _parse_additive_tag(tag: str) -> Optional[str]:
    core = _tag_tail(tag)  # e150d
    if not core.startswith("e"):
        return None
    m = re.match(r"^e(\d{3,4})([a-z])?$", core)
    if not m:
        return None
    digits = m.group(1)
    suf = (m.group(2) or "").upper()
    return f"E{digits}{suf}"

def _parse_allergen_tag(tag: str) -> Optional[str]:
    core = _tag_tail(tag)  # milk
    core = core.strip()
    return core or None

def _fetch_off(barcode: str) -> Dict[str, Any]:
    url = f"{OFF_BASE}/api/v2/product/{barcode}.json?fields=" + ",".join(OFF_FIELDS)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ai-food-scan/1.0"})
        with urllib.request.urlopen(req, timeout=OFF_TIMEOUT_SEC) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenFoodFacts fetch failed: {e}")

def _risk_bucket(risk_raw: str) -> str:
    s = str(risk_raw or "").strip().lower()
    if not s:
        return "unknown"
    if s in ("high",):
        return "high"
    if s in ("moderate", "medium", "low_to_moderate", "emerging_concern"):
        return "medium"
    if s in ("low",):
        return "low"
    return "unknown"

def _score_from_counts(counts: Dict[str, int]) -> int:
    # simple v1 score: 100 minus penalties
    # tweak later; this is just to avoid "always A" when additives exist
    high = int(counts.get("high", 0))
    med = int(counts.get("medium", 0))
    low = int(counts.get("low", 0))
    unk = int(counts.get("unknown", 0))
    score = 100 - (high * 25 + med * 10 + low * 3 + unk * 6)
    if score < 0:
        score = 0
    if score > 100:
        score = 100
    return score

def _grade_from_score(score: Optional[int]) -> str:
    if score is None:
        return "A"
    if score >= 80:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    if score >= 20:
        return "D"
    return "E"

def _lookup_additive_info(c: sqlite3.Connection, e_number: str) -> Optional[Dict[str, Any]]:
    e_norm = _norm_e(e_number)
    e_base = _base_e(e_norm)

    row = c.execute(
        """
        SELECT e_number, name, basic_risk_level, adi_mg_per_kg_bw_day, simple_user_message, source_url
        FROM additives_info
        WHERE UPPER(REPLACE(e_number,' ','')) IN (?,?)
        LIMIT 1
        """,
        (e_norm, e_base),
    ).fetchone()

    if not row:
        return None

    d = dict(row)
    return {
        "e_number": d.get("e_number") or e_norm,
        "name": d.get("name"),
        "risk_level": d.get("basic_risk_level") or "unknown",
        "adi": d.get("adi_mg_per_kg_bw_day"),
        "description": d.get("simple_user_message"),
        "source_url": d.get("source_url"),
    }

class ProductResponse(BaseModel):
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    ingredients_text: Optional[str] = None
    allergens: List[str] = []
    traces: List[str] = []
    additives: List[str] = []
    analysis: List[Any] = []
    diet_flags: Dict[str, Optional[bool]] = {"vegan": None, "vegetarian": None}
    nutriscore_grade: Optional[str] = None
    ecoscore_grade: Optional[str] = None
    ecoscore_score: Optional[float] = None
    health_score: Optional[float] = None
    eco_score: Optional[float] = None
    additive_score: Optional[float] = None
    additives_info: List[Dict[str, Any]] = []
    additive_grade: str = "A"
    additives_score_breakdown: Dict[str, Any] = {"counts": {"high": 0, "medium": 0, "low": 0, "unknown": 0}, "method": "v1_penalty_100_minus_sum"}

@router.get("/{barcode}", response_model=ProductResponse)
def get_product(barcode: str) -> ProductResponse:
    code = str(barcode or "").strip()
    if not re.fullmatch(r"\d{8,14}", code):
        raise HTTPException(status_code=400, detail="Invalid barcode (expected 8–14 digits).")

    data = _fetch_off(code)
    product = data.get("product") or None
    if not product:
        # OFF returns status fields, but keep this robust
        raise HTTPException(status_code=404, detail=f"Product not found on OpenFoodFacts: {code}")

    name = (product.get("product_name_en") or product.get("product_name") or "").strip() or None
    brand = (product.get("brands") or "").strip() or None
    image_url = (product.get("image_front_url") or "").strip() or None
    ingredients = (product.get("ingredients_text_en") or product.get("ingredients_text") or "").strip() or None

    allergens_tags = product.get("allergens_tags") or []
    traces_tags = product.get("traces_tags") or []

    allergens: List[str] = []
    for t in allergens_tags if isinstance(allergens_tags, list) else []:
        v = _parse_allergen_tag(str(t))
        if v:
            allergens.append(v)

    traces: List[str] = []
    for t in traces_tags if isinstance(traces_tags, list) else []:
        v = _parse_allergen_tag(str(t))
        if v:
            traces.append(v)

    # additives: prefer original tags if present
    raw_add_tags = product.get("additives_original_tags") or product.get("additives_tags") or []
    additives: List[str] = []
    if isinstance(raw_add_tags, list):
        for t in raw_add_tags:
            e = _parse_additive_tag(str(t))
            if e and e not in additives:
                additives.append(e)

    nutri = product.get("nutriscore_grade")
    eco_grade = product.get("ecoscore_grade")
    eco_score = product.get("ecoscore_score")

    # enrich additive info + compute simple score breakdown
    counts = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    info: List[Dict[str, Any]] = []
    try:
        c = _conn()
        for e in additives:
            row = _lookup_additive_info(c, e)
            if row:
                info.append(row)
                bucket = _risk_bucket(row.get("risk_level"))
            else:
                bucket = "unknown"
                info.append({"e_number": e, "name": None, "risk_level": "unknown", "adi": None, "description": None, "source_url": None})
            counts[bucket] += 1
    except Exception:
        # don’t break product fetch if DB isn’t available; just return product basics
        pass

    additive_score = _score_from_counts(counts) if additives else None
    additive_grade = _grade_from_score(int(additive_score) if additive_score is not None else None)

    return ProductResponse(
        barcode=code,
        name=name,
        brand=brand,
        image_url=image_url,
        ingredients_text=ingredients,
        allergens=allergens,
        traces=traces,
        additives=additives,
        analysis=[],
        diet_flags={"vegan": None, "vegetarian": None},
        nutriscore_grade=str(nutri).strip() if nutri else None,
        ecoscore_grade=str(eco_grade).strip() if eco_grade else None,
        ecoscore_score=float(eco_score) if isinstance(eco_score, (int, float)) else None,
        health_score=None,
        eco_score=None,
        additive_score=float(additive_score) if additive_score is not None else None,
        additives_info=info,
        additive_grade=additive_grade,
        additives_score_breakdown={"counts": counts, "method": "v1_penalty_100_minus_sum"},
    )
