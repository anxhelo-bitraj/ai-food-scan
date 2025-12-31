from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine as ENGINE
from app.scoring_additives import (
    compute_additives_score,
    extract_organs_and_topics,
    normalize_e_number,
    normalize_risk_level,
)

router = APIRouter(prefix="/additives", tags=["additives"])


def _fetch_additive_row(e_number: str) -> Optional[Dict[str, Any]]:
    q = text(
        """
        SELECT
          e_number, name, risk_level, description, functional_class,
          source_title, source_url, source_date,
          adi, exposure_mean_gt_adi, exposure_p95_gt_adi
        FROM additives
        WHERE e_number = :e
        LIMIT 1
        """
    )
    with ENGINE.connect() as conn:
        row = conn.execute(q, {"e": e_number}).mappings().first()
        return dict(row) if row else None


def _fetch_effect_rows(e_number: str) -> List[Dict[str, Any]]:
    q = text(
        """
        SELECT
          endpoint, effect, species, route, duration_days,
          author, year, value, unit, toxicity,
          source_title, source_url, source_doi
        FROM additive_effects
        WHERE e_number = :e
        ORDER BY year DESC NULLS LAST
        """
    )
    with ENGINE.connect() as conn:
        rows = conn.execute(q, {"e": e_number}).mappings().all()
        return [dict(r) for r in rows]


@router.get("/{e_number}")
def get_additive(e_number: str):
    e = normalize_e_number(e_number)
    if not e:
        raise HTTPException(status_code=400, detail="Invalid e-number")

    base = _fetch_additive_row(e)
    if not base:
        raise HTTPException(status_code=404, detail=f"Additive not found: {e}")

    base["risk_level"] = normalize_risk_level(base.get("risk_level"))

    effects = _fetch_effect_rows(e)
    base["effects"] = effects

    texts: List[str] = []
    if isinstance(base.get("description"), str):
        texts.append(base["description"])
    for ef in effects:
        if isinstance(ef.get("effect"), str):
            texts.append(ef["effect"])
        if isinstance(ef.get("endpoint"), str):
            texts.append(ef["endpoint"])

    organs, topics = extract_organs_and_topics(texts)
    base["organs"] = organs
    base["health_topics"] = topics

    if not organs and not topics:
        base["note"] = (
            "No specific target organ/topic found in structured OpenFoodTox fields for this additive. "
            "Use the EFSA source link for full context."
        )

    return base


class AdditivesBatchRequest(BaseModel):
    e_numbers: List[str] = Field(..., min_items=1, max_items=200)


@router.post("/batch")
def batch_additives(req: AdditivesBatchRequest):
    raw_list = req.e_numbers or []
    normalized: List[str] = []
    for x in raw_list:
        e = normalize_e_number(x)
        if e:
            normalized.append(e)

    seen = set()
    ordered: List[str] = []
    for e in normalized:
        if e not in seen:
            seen.add(e)
            ordered.append(e)

    if not ordered:
        raise HTTPException(status_code=400, detail="No valid e-numbers provided")

    q = text(
        """
        SELECT e_number, name, risk_level
        FROM additives
        WHERE e_number = ANY(:arr)
        """
    )

    with ENGINE.connect() as conn:
        rows = conn.execute(q, {"arr": ordered}).mappings().all()

    by_e: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        rr = dict(r)
        rr["risk_level"] = normalize_risk_level(rr.get("risk_level"))
        by_e[rr["e_number"]] = rr

    out: List[Dict[str, Any]] = []
    for e in ordered:
        if e in by_e:
            out.append(by_e[e])
        else:
            out.append({"e_number": e, "name": e, "risk_level": "unknown"})

    score = compute_additives_score(out)

    return {"additives": out, "score": score}
