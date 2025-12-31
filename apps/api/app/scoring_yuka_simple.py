from __future__ import annotations
from typing import Any, Dict, Optional

def _clamp(x: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(x))))

# fallback nutrition from nutriscore_grade (since your API already returns it)
_GRADE_TO_NUTR = {"a": 100, "b": 80, "c": 55, "d": 25, "e": 0}

def _nutrition_score(p: Dict[str, Any]) -> int:
    g = (p.get("nutriscore_grade") or "").strip().lower()
    return _GRADE_TO_NUTR.get(g, 0)

def _additives_score(p: Dict[str, Any]) -> int:
    adds = p.get("additives") or []
    if isinstance(adds, str):
        adds = [adds]
    uniq = {str(a).strip().upper() for a in adds if str(a).strip()}
    return _clamp(100 - 10 * len(uniq))

def _eco_score(p: Dict[str, Any]) -> Optional[int]:
    v = p.get("ecoscore_score")
    if isinstance(v, (int, float)):
        return _clamp(v)
    g = (p.get("ecoscore_grade") or "").strip().lower()
    if not g or g == "not-applicable":
        return None
    return {"a": 90, "b": 75, "c": 55, "d": 35, "e": 15}.get(g)

def _organic_score(p: Dict[str, Any]) -> int:
    tags = p.get("labels_tags") or []
    if not isinstance(tags, list):
        return 0
    s = " ".join(str(x).lower() for x in tags)
    return 100 if "organic" in s else 0

def enrich_scores(p: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(p)
    nutr = _nutrition_score(out)
    add = _additives_score(out)
    org = _organic_score(out)

    # Yuka-style weights: 60% nutrition + 30% additives + 10% organic
    health = _clamp(0.6 * nutr + 0.3 * add + 0.1 * org)

    out["health_score"] = health
    out["additive_score"] = add
    out["eco_score"] = _eco_score(out)
    return out
