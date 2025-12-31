from __future__ import annotations
from typing import Any, Optional

def _clamp(x: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(x))))

# Nutrition proxy using OFF nutriscore_grade (since your API already returns it)
_GRADE_TO_SCORE = {"a": 100, "b": 80, "c": 55, "d": 25, "e": 0}

def _nutrition_score(p: dict) -> int:
    g = (p.get("nutriscore_grade") or "").strip().lower()
    return _GRADE_TO_SCORE.get(g, 0)

def _additives_score(p: dict) -> int:
    adds = p.get("additives") or []
    if isinstance(adds, str):
        adds = [adds]
    # Count-based until you add per-additive risk levels
    return max(0, 100 - 10 * len(adds))

def _eco_score(p: dict) -> Optional[int]:
    # Prefer numeric ecoscore_score if present
    v = p.get("ecoscore_score")
    if isinstance(v, (int, float)):
        return _clamp(v)
    g = (p.get("ecoscore_grade") or "").strip().lower()
    if not g or g == "not-applicable":
        return None
    return {"a": 100, "b": 80, "c": 60, "d": 40, "e": 20}.get(g, None)

def enrich_scores(obj: Any) -> Any:
    # Safe: if not dict, leave unchanged
    if not isinstance(obj, dict):
        return obj

    out = dict(obj)

    nutrition = _nutrition_score(out)
    additives = _additives_score(out)

    # Yuka-style weights idea: 60% nutrition, 30% additives, 10% organic (we don't have organic yet => 0)
    organic = 0
    health = round(0.6 * nutrition + 0.3 * additives + 0.1 * organic)

    out["health_score"] = _clamp(health)
    out["additive_score"] = _clamp(additives)
    out["eco_score"] = _eco_score(out)

    return out
