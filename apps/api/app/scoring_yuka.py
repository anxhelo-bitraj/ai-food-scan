from typing import Any, Dict, Optional, Tuple

# V1 mapping (simple + predictable).
# Later you can compute Nutri-Score points directly from nutrition facts (closer to Yuka),
# but for now we map the grade to a score.
_NUTRISCORE_TO_SCORE = {
    "a": 100,
    "b": 85,
    "c": 70,
    "d": 50,
    "e": 25,
}

# If ecoscore_score is missing, we can approximate from grade.
_ECOSCORE_GRADE_TO_SCORE = {
    "a": 90,
    "b": 75,
    "c": 60,
    "d": 45,
    "e": 30,
    "not-applicable": None,
    "unknown": None,
}

# "Yuka-like" weights: 60/30/10.
# Yuka uses 10% organic bonus; we use EcoScore as the 10% in v1.
_WEIGHTS = {
    "nutrition": 0.6,
    "additives": 0.3,
    "eco": 0.1,
}

def _clamp_0_100(x: Optional[Any]) -> Optional[int]:
    if x is None:
        return None
    try:
        v = float(x)
    except Exception:
        return None
    if v != v:  # NaN
        return None
    if v < 0:
        v = 0
    if v > 100:
        v = 100
    return int(round(v))

def _nutrition_score(product: Dict[str, Any]) -> Optional[int]:
    g = product.get("nutriscore_grade")
    if not g:
        return None
    return _NUTRISCORE_TO_SCORE.get(str(g).strip().lower())

def _eco_score(product: Dict[str, Any]) -> Optional[int]:
    # Prefer numeric ecoscore_score from OFF
    s = _clamp_0_100(product.get("ecoscore_score"))
    if s is not None:
        return s
    g = product.get("ecoscore_grade")
    if not g:
        return None
    approx = _ECOSCORE_GRADE_TO_SCORE.get(str(g).strip().lower())
    return _clamp_0_100(approx)

def _additives_score(product: Dict[str, Any]) -> Optional[int]:
    return _clamp_0_100(
        product.get("additive_score")
        if product.get("additive_score") is not None
        else product.get("additives_score")
    )

def _weighted_overall(parts: Tuple[Tuple[str, Optional[int]], ...]) -> Optional[int]:
    # Re-normalize weights if some parts are missing (eco often missing).
    used = []
    for name, score in parts:
        if score is None:
            continue
        w = _WEIGHTS.get(name, 0.0)
        if w > 0:
            used.append((w, float(score)))

    if not used:
        return None

    total_w = sum(w for w, _ in used)
    if total_w <= 0:
        return None

    v = sum(w * s for w, s in used) / total_w
    return _clamp_0_100(v)

def enrich_scores(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mutates and returns the product dict.

    Adds:
      - eco_score (0..100) derived from ecoscore_score/grade
      - health_score (0..100) derived from nutrition + additives + eco (reweighted if missing)
    """
    nutrition = _nutrition_score(product)
    additives = _additives_score(product)
    eco = _eco_score(product)

    # Keep component score available for UI
    product["eco_score"] = eco

    # Overall "health_score" (Yuka-like 60/30/10, reweighted if eco missing)
    overall = _weighted_overall((
        ("nutrition", nutrition),
        ("additives", additives),
        ("eco", eco),
    ))
    product["health_score"] = overall

    return product
