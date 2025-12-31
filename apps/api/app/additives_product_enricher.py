from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
import re

from sqlalchemy import create_engine, text, bindparam

from app.scoring_additives import (
    compute_additives_score,
    normalize_e_number,
    normalize_risk_level,
)

_BASE_RE = re.compile(r"^(E\d{3,4})([A-Z])?$", re.IGNORECASE)


def _base_e(e: str) -> str:
    """
    E322I -> E322
    E150D -> E150D (kept, because letter is part of official E-number for many colours)
    """
    m = _BASE_RE.match(e or "")
    if not m:
        return e
    num = (m.group(1) or "").upper()
    suf = (m.group(2) or "").upper()

    # Heuristic:
    # - Some additives use letter variants officially (e.g., E150D)
    # - Some are subtypes like E322I (lecithins) where DB often stores base E322
    # Keep 1-letter suffix ONLY for common official families E100.. (unknown list),
    # but for E322X specifically, collapse to E322.
    if num == "E322":
        return "E322"
    return (num + suf) if suf else num


def _get_engine():
    # Prefer app's configured engine if present
    try:
        from app.db.session import engine  # type: ignore
        return engine
    except Exception:
        pass

    db_url = (os.getenv("DATABASE_URL") or "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL not set and app.db.session.engine not available")
    return create_engine(db_url, pool_pre_ping=True, future=True)


def _fetch_additives_basic(e_numbers: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Returns dict keyed by additives.e_number
    """
    if not e_numbers:
        return {}

    eng = _get_engine()
    q = text(
        """
        SELECT
          e_number, name, risk_level, description, functional_class,
          source_title, source_url, source_date,
          adi, exposure_mean_gt_adi, exposure_p95_gt_adi
        FROM additives
        WHERE e_number IN :arr
        """
    ).bindparams(bindparam("arr", expanding=True))

    with eng.connect() as conn:
        rows = conn.execute(q, {"arr": e_numbers}).mappings().all()

    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        d = dict(r)
        d["risk_level"] = normalize_risk_level(d.get("risk_level"))
        out[d["e_number"]] = d
    return out


def enrich_product_payload(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mutates/returns product dict:
      - adds: additives_info (list of additive rows per product additive)
      - sets: additive_score (0..100 int)
      - adds: additive_grade, additives_score_breakdown
    """
    if not isinstance(product, dict):
        return product

    raw_adds = product.get("additives") or []
    if not isinstance(raw_adds, list) or not raw_adds:
        # still set deterministic defaults
        product.setdefault("additives_info", [])
        product.setdefault("additive_score", 100)
        product.setdefault("additive_grade", "A")
        product.setdefault("additives_score_breakdown", {
            "counts": {"high": 0, "medium": 0, "low": 0, "unknown": 0},
            "method": "v1_penalty_100_minus_sum",
        })
        return product

    # normalize -> canonical E-numbers
    normalized: List[str] = []
    for x in raw_adds:
        e = normalize_e_number(str(x))
        if e:
            normalized.append(e)

    if not normalized:
        product.setdefault("additives_info", [])
        product.setdefault("additive_score", 100)
        product.setdefault("additive_grade", "A")
        product.setdefault("additives_score_breakdown", {
            "counts": {"high": 0, "medium": 0, "low": 0, "unknown": 0},
            "method": "v1_penalty_100_minus_sum",
        })
        return product

    # map each additive to a DB lookup key (base heuristic)
    lookup_keys: List[str] = []
    key_for: Dict[str, str] = {}
    for e in normalized:
        k = _base_e(e)
        key_for[e] = k
        if k not in lookup_keys:
            lookup_keys.append(k)

    db_rows = _fetch_additives_basic(lookup_keys)

    # preserve original order for UI
    additives_info: List[Dict[str, Any]] = []
    for e in normalized:
        k = key_for[e]
        row = db_rows.get(k)
        if row:
            item = dict(row)
            if e != k:
                item["matched_from"] = e
            additives_info.append(item)
        else:
            additives_info.append({
                "e_number": k,
                "name": k,
                "risk_level": "unknown",
                "matched_from": (e if e != k else None),
            })

    # scoring should NOT double-penalize duplicates; score unique E-numbers only
    uniq_for_score: List[Dict[str, Any]] = []
    seen = set()
    for a in additives_info:
        k = a.get("e_number")
        if not k or k in seen:
            continue
        seen.add(k)
        uniq_for_score.append({
            "e_number": k,
            "name": a.get("name") or k,
            "risk_level": a.get("risk_level") or "unknown",
        })

    score = compute_additives_score(uniq_for_score)

    product["additives_info"] = additives_info
    product["additive_score"] = int(score["score"])
    product["additive_grade"] = score["grade"]
    product["additives_score_breakdown"] = {
        "counts": score["counts"],
        "method": score["method"],
        "penalties": score["penalties"],
    }
    return product
