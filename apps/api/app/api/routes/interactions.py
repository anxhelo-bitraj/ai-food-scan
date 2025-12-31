from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Tuple, Optional
import re

from sqlalchemy import text
from app.db.session import engine

router = APIRouter(prefix="/interactions", tags=["interactions"])

class InteractionCheckRequest(BaseModel):
    items: List[str] = Field(min_length=1)

SWEETENER_PATTERNS = [
    r"aspartame", r"\bE951\b",
    r"acesulfame[ -]?k", r"\bE950\b",
    r"sucralose", r"\bE955\b",
    r"saccharin", r"\bE954\b",
    r"cyclamate", r"\bE952\b",
]

SUGAR_PATTERNS = [
    r"sugar", r"sucrose", r"glucose", r"fructose",
    r"high fructose corn syrup", r"\bhfcs\b",
]

FAT_PATTERNS = [
    r"fat", r"high[- ]?fat",
    r"palm oil", r"butter", r"cream", r"oil",
]

def _safe_match(pattern: str, item: str) -> bool:
    p = (pattern or "").strip()
    s = (item or "").strip()
    if not p or not s:
        return False
    try:
        return re.search(p, s, flags=re.IGNORECASE) is not None
    except re.error:
        return p.lower() in s.lower()

def _count_any(patterns: List[str], items: List[str]) -> int:
    hits = set()
    for it in items:
        for p in patterns:
            if _safe_match(p, it):
                hits.add(it.lower())
                break
    return len(hits)

def _match_special_token(token: str, items: List[str]) -> Optional[str]:
    t = (token or "").strip()

    if t == "INTENSE_SWEETENER_GROUP":
        # match when user has 2+ distinct sweetener items
        n = _count_any(SWEETENER_PATTERNS, items)
        return f"{n} sweeteners" if n >= 2 else None

    if t == "high_fat_sugar_matrix":
        # match when at least one sugar-ish AND one fat-ish item is present
        has_sugar = _count_any(SUGAR_PATTERNS, items) >= 1
        has_fat = _count_any(FAT_PATTERNS, items) >= 1
        return "high fat + sugar context" if (has_sugar and has_fat) else None

    return None

def _severity_rank(sev: str) -> int:
    v = (sev or "").strip().lower()
    if v == "high":
        return 3
    if v == "medium":
        return 2
    return 1

@router.post("/check")
def check_interactions(payload: InteractionCheckRequest) -> Dict[str, Any]:
    items = [x.strip() for x in payload.items if x and x.strip()]

    with engine.connect() as c:
        rules = c.execute(text("""
            SELECT id, title, severity, confidence, why, what_to_do
            FROM interaction_rules
            ORDER BY id
        """)).mappings().all()

        pats = c.execute(text("""
            SELECT rule_id, item_key
            FROM interaction_rule_items
            WHERE item_type = 'pattern'
            ORDER BY rule_id, id
        """)).mappings().all()

        srcs = c.execute(text("""
            SELECT irs.rule_id, es.label, es.url, es.publisher
            FROM interaction_rule_sources irs
            JOIN evidence_sources es ON es.id = irs.source_id
            ORDER BY irs.rule_id, es.id
        """)).mappings().all()

    patterns_by_rule: Dict[int, List[str]] = {}
    for r in pats:
        patterns_by_rule.setdefault(int(r["rule_id"]), []).append(r["item_key"])

    sources_by_rule: Dict[int, List[Dict[str, Any]]] = {}
    for s in srcs:
        rid = int(s["rule_id"])
        sources_by_rule.setdefault(rid, []).append({
            "label": s["label"],
            "url": s["url"],
            "publisher": s["publisher"],
        })

    matches: List[Dict[str, Any]] = []

    for rule in rules:
        rid = int(rule["id"])
        patterns = patterns_by_rule.get(rid, [])
        if not patterns:
            continue

        matched_on: List[Tuple[str, str]] = []
        ok = True

        # AND logic: each pattern must match something (either a user item or a special token condition)
        for pat in patterns:
            special_hit = _match_special_token(pat, items)
            if special_hit is not None:
                matched_on.append((pat, special_hit))
                continue

            hit_item = None
            for it in items:
                if _safe_match(pat, it):
                    hit_item = it
                    break

            if hit_item is None:
                ok = False
                break

            matched_on.append((pat, hit_item))

        if ok:
            matches.append({
                "id": rid,
                "title": rule["title"],
                "severity": rule["severity"],
                "confidence": rule["confidence"],
                "why": rule["why"],
                "what_to_do": rule["what_to_do"],
                "matched_on": [{"pattern": p, "item": i} for p, i in matched_on],
                "sources": sources_by_rule.get(rid, []),
            })

    matches.sort(key=lambda x: _severity_rank(x.get("severity")), reverse=True)

    return {
        "input_items": items,
        "match_count": len(matches),
        "matches": matches,
    }
