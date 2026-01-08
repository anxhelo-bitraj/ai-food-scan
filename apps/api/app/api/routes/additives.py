from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/additives", tags=["additives"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]  # .../apps/api
DB_PATH = PROJECT_ROOT / "data" / "risk.db"

# Optional override (if you discover the exact table name)
# Example: export AI_FOODSCAN_EVIDENCE_TABLE="additives_effects"
EVIDENCE_TABLE_OVERRIDE = os.environ.get("AI_FOODSCAN_EVIDENCE_TABLE", "").strip() or None

# ------------------------------------------------------------
# DB helpers
# ------------------------------------------------------------
def _conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Missing DB: {DB_PATH}")
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def _objs(c: sqlite3.Connection) -> List[Tuple[str, str]]:
    rows = c.execute(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    out: List[Tuple[str, str]] = []
    for r in rows:
        try:
            out.append((str(r["name"]), str(r["type"])))
        except Exception:
            pass
    return out


def _cols(c: sqlite3.Connection, table: str) -> List[str]:
    rows = c.execute(f"PRAGMA table_info('{table}')").fetchall()
    out: List[str] = []
    for r in rows:
        try:
            out.append(str(r["name"]))
        except Exception:
            pass
    return out


def _safe_json(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, (int, float, bool)):
        return v
    s = str(v).strip()
    if not s:
        return None
    if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
        try:
            return json.loads(s)
        except Exception:
            return s
    return s


def _norm_e(x: str) -> str:
    return str(x or "").strip().upper().replace(" ", "")


def _digits(x: str) -> str:
    return re.sub(r"\D", "", str(x or ""))


def _base_e(x: str) -> str:
    s = _norm_e(x)
    m = re.match(r"^(E\d{3,4})", s)
    return m.group(1) if m else s


def _norm_expr(col: str) -> str:
    # Uppercase + strip spaces, cast safe for ints
    return f"UPPER(REPLACE(CAST({col} AS TEXT),' ',''))"


# ------------------------------------------------------------
# Evidence discovery
# ------------------------------------------------------------
_EVIDENCE_CACHE: Optional[Dict[str, Any]] = None

def _discover_evidence(c: sqlite3.Connection) -> Optional[Dict[str, Any]]:
    """
    Pick the best table/view that looks like your curated evidence dataset.
    """
    global _EVIDENCE_CACHE
    if _EVIDENCE_CACHE is not None:
        return _EVIDENCE_CACHE

    ignore = {"additives_info", "risk_sources", "risk_combinations", "sqlite_sequence"}

    # If user explicitly sets override, use it if it exists
    if EVIDENCE_TABLE_OVERRIDE:
        for name, typ in _objs(c):
            if name == EVIDENCE_TABLE_OVERRIDE:
                cs = _cols(c, name)
                colset = set(cs)
                e_cols = [x for x in cs if x.lower() in ("e_number","e","eno","enumber","e_no","e_num")]
                if not e_cols:
                    break
                _EVIDENCE_CACHE = {"table": name, "type": typ, "e_col": e_cols[0], "cols": cs, "score": 999}
                return _EVIDENCE_CACHE

    candidates: List[Tuple[int, str, str, str, List[str]]] = []

    for name, typ in _objs(c):
        if name in ignore:
            continue
        cs = _cols(c, name)
        colset = set(cs)

        e_cols = [x for x in cs if x.lower() in ("e_number","e","eno","enumber","e_no","e_num")]
        if not e_cols:
            continue

        score = 0
        # Strong signals
        for k in ["risk_level", "description", "functional_class", "source_url", "source_title"]:
            if k in colset:
                score += 3
        # Nice-to-have signals
        for k in ["adi", "effects", "organs", "health_topics", "note", "source_date", "name"]:
            if k in colset:
                score += 1

        candidates.append((score, name, typ, e_cols[0], cs))

    if not candidates:
        _EVIDENCE_CACHE = None
        return None

    candidates.sort(reverse=True, key=lambda x: x[0])
    best = candidates[0]
    if best[0] <= 0:
        _EVIDENCE_CACHE = None
        return None

    _EVIDENCE_CACHE = {"score": best[0], "table": best[1], "type": best[2], "e_col": best[3], "cols": best[4]}
    return _EVIDENCE_CACHE


def _row_by_e(c: sqlite3.Connection, table: str, e_col: str, e_value: str) -> Optional[sqlite3.Row]:
    e_norm = _norm_e(e_value)
    e_base = _base_e(e_norm)
    e_digits = _digits(e_norm)

    q = f"""
      SELECT * FROM '{table}'
      WHERE {_norm_expr(e_col)} IN (?,?,?)
      LIMIT 1
    """
    row = c.execute(q, (e_norm, e_base, e_digits)).fetchone()
    return row


def _lookup_additive(c: sqlite3.Connection, e_value: str) -> Optional[Dict[str, Any]]:
    e_norm = _norm_e(e_value)

    # 1) curated evidence (if exists)
    ev = _discover_evidence(c)
    if ev:
        row = _row_by_e(c, ev["table"], ev["e_col"], e_norm)
        if row:
            d = dict(row)

            def g(k: str, default=None):
                return d.get(k, default)

            out: Dict[str, Any] = {
                "e_number": g("e_number", g("e", g("eno", e_norm))),
                "name": g("name", e_norm),
                "risk_level": g("risk_level", "unknown"),
                "description": g("description", g("simple_user_message", None)),
                "functional_class": g("functional_class", None),
                "source_title": g("source_title", None),
                "source_url": g("source_url", None),
                "source_date": g("source_date", None),
                "adi": g("adi", None),
                "exposure_mean_gt_adi": g("exposure_mean_gt_adi", None),
                "exposure_p95_gt_adi": g("exposure_p95_gt_adi", None),
                "effects": _safe_json(g("effects", [])) or [],
                "organs": _safe_json(g("organs", [])) or [],
                "health_topics": _safe_json(g("health_topics", [])) or [],
                "note": g("note", None),
            }

            sources = _safe_json(g("sources", None))
            if isinstance(sources, list):
                out["sources"] = sources

            return out

    # 2) fallback: additives_info
    row2 = c.execute(
        'SELECT e_number, name, "group", basic_risk_level, adi_mg_per_kg_bw_day, simple_user_message, source_url '
        'FROM additives_info WHERE UPPER(REPLACE(e_number," ","")) = ? LIMIT 1',
        (e_norm,),
    ).fetchone()

    if not row2:
        e_base = _base_e(e_norm)
        row2 = c.execute(
            'SELECT e_number, name, "group", basic_risk_level, adi_mg_per_kg_bw_day, simple_user_message, source_url '
            'FROM additives_info WHERE UPPER(REPLACE(e_number," ","")) = ? LIMIT 1',
            (e_base,),
        ).fetchone()

    if row2:
        g = dict(row2)
        grp = g.get("group") or "unclassified"
        msg = g.get("simple_user_message") or f"Authorised food additive ({grp}). Evidence details not curated yet."
        src = g.get("source_url") or "https://data.food.gov.uk/regulated-products/id/food-additives/authorisation.csv"

        return {
            "e_number": g.get("e_number") or e_norm,
            "name": g.get("name") or (g.get("e_number") or e_norm),
            "risk_level": (g.get("basic_risk_level") or "unknown"),
            "description": msg,
            "functional_class": None,
            "source_title": "UK Food Standards Agency – Food additives authorisation list",
            "source_url": src,
            "source_date": None,
            "adi": g.get("adi_mg_per_kg_bw_day") or None,
            "exposure_mean_gt_adi": None,
            "exposure_p95_gt_adi": None,
            "effects": [],
            "organs": [],
            "health_topics": [],
            "note": "Fallback entry from the authorisation list (name/group). Risk/effects will be added when curated evidence is available.",
        }

    return None


# ------------------------------------------------------------
# Batch score (simple v1)
# ------------------------------------------------------------
def _score_from_levels(levels: List[str]) -> Dict[str, Any]:
    lv = [str(x or "").lower().strip() for x in levels]
    high = sum(1 for x in lv if x == "high")
    medium = sum(1 for x in lv if x == "medium")
    low = sum(1 for x in lv if x == "low")
    unknown = len(lv) - high - medium - low

    score = 100 - high * 30 - medium * 15 - low * 5 - unknown * 8
    score = max(0, min(100, score))

    if score >= 85:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 55:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "E"

    return {"score": score, "grade": grade, "counts": {"high": high, "medium": medium, "low": low, "unknown": unknown}}


class BatchRequest(BaseModel):
    e_numbers: List[str] = Field(default_factory=list)


@router.get("/{e_number}")
def get_additive(e_number: str) -> Dict[str, Any]:
    e = _norm_e(e_number)
    with _conn() as c:
        out = _lookup_additive(c, e)
        if not out:
            raise HTTPException(status_code=404, detail=f"Additive not found: {e}")
        return out


@router.post("/batch")
def get_additives_batch(req: BatchRequest) -> Dict[str, Any]:
    e_numbers = [x for x in (req.e_numbers or []) if str(x).strip()]
    if not e_numbers:
        return {"additives": [], "score": _score_from_levels([])}

    rows: List[Dict[str, Any]] = []
    levels: List[str] = []

    with _conn() as c:
        for e in e_numbers:
            item = _lookup_additive(c, e) or {"e_number": _norm_e(e), "name": _norm_e(e), "risk_level": "unknown"}
            rows.append(
                {
                    "e_number": item.get("e_number"),
                    "name": item.get("name"),
                    "risk_level": item.get("risk_level", "unknown"),
                }
            )
            levels.append(item.get("risk_level", "unknown"))

    return {"additives": rows, "score": _score_from_levels(levels)}

