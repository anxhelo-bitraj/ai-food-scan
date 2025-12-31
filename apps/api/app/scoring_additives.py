from typing import Any, Dict, List, Optional, Tuple
import re

_RISK_CANON = {"low", "medium", "high", "unknown"}

_PENALTY = {
    "high": 35,
    "medium": 15,
    "low": 0,
    "unknown": 5,
}

def normalize_e_number(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None

    s = re.sub(r"^en:\s*", "", s, flags=re.IGNORECASE)
    s = s.upper().replace(" ", "")

    if re.match(r"^\d", s):
        s = "E" + s

    m = re.match(r"^E(\d{3,4})([A-Z]?)$", s)
    if not m:
        return s

    num = m.group(1)
    suf = m.group(2) or ""
    return "E" + num + suf

def normalize_risk_level(raw: Optional[str]) -> str:
    if not raw:
        return "unknown"
    s = str(raw).strip().lower()
    if s in _RISK_CANON:
        return s
    if "high" in s:
        return "high"
    if "med" in s or "moderate" in s:
        return "medium"
    if "low" in s or "no risk" in s or "none" in s:
        return "low"
    return "unknown"

def risk_label(risk_level: str) -> str:
    rl = normalize_risk_level(risk_level)
    if rl == "high":
        return "High"
    if rl == "medium":
        return "Medium"
    if rl == "low":
        return "Low"
    return "Unknown"

def grade_from_score(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "E"

def compute_additives_score(additives_info: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    total_penalty = 0

    for a in additives_info or []:
        rl = normalize_risk_level(a.get("risk_level") if isinstance(a, dict) else None)
        counts[rl] += 1
        total_penalty += _PENALTY[rl]

    score = 100 - total_penalty
    score = max(0, min(100, score))

    return {
        "score": int(score),
        "grade": grade_from_score(int(score)),
        "counts": counts,
        "penalties": dict(_PENALTY),
        "method": "v1_penalty_100_minus_sum",
    }

_ORGAN_PATTERNS = [
    ("liver", r"\bliver\b|hepatic"),
    ("kidney", r"\bkidney\b|renal"),
    ("brain", r"\bbrain\b|neuro|neurolog"),
    ("heart", r"\bheart\b|cardio"),
    ("gut", r"\bgut\b|intestinal|gastro"),
    ("blood", r"\bblood\b|hemat|haemat"),
    ("thyroid", r"\bthyroid\b"),
    ("reproductive", r"\brepro|fertil|testis|ovary|uter"),
]

_TOPIC_PATTERNS = [
    ("genotoxicity", r"\bgenotox|dna damage|mutagen"),
    ("cancer", r"\bcancer|carcinogen|tumou?r"),
    ("allergy", r"\ballerg|hypersens"),
    ("hyperactivity", r"\bhyperactiv|adhd"),
    ("development", r"\bdevelopment|prenatal|postnatal"),
]

def extract_organs_and_topics(texts: List[str]) -> Tuple[List[str], List[str]]:
    blob = " \n ".join([t for t in (texts or []) if isinstance(t, str)]).lower()

    organs: List[str] = []
    topics: List[str] = []

    for name, pat in _ORGAN_PATTERNS:
        if re.search(pat, blob, flags=re.IGNORECASE):
            organs.append(name)

    for name, pat in _TOPIC_PATTERNS:
        if re.search(pat, blob, flags=re.IGNORECASE):
            topics.append(name)

    return sorted(set(organs)), sorted(set(topics))
