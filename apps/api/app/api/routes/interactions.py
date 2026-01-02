from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/interactions", tags=["interactions"])


API_DIR = Path(__file__).resolve().parents[3]  # .../ai-food-scan/apps/api
DATA_DIR = API_DIR / "data"
DB_PATH = Path(os.environ.get("RISK_DB_PATH", str(DATA_DIR / "risk.db")))


# ----------------------------
# Models
# ----------------------------
class CheckRequest(BaseModel):
    e_numbers: List[str] = Field(default_factory=list)


class SourceOut(BaseModel):
    source_id: str
    title: str = ""
    url: str = ""
    year: str = ""
    notes: str = ""


class AdditiveOut(BaseModel):
    e_number: str
    name: str = ""
    group: str = ""
    basic_risk_level: str = ""
    adi_mg_per_kg_bw_day: Optional[float] = None
    simple_user_message: str = ""
    source_url: str = ""


class MatchOut(BaseModel):
    combo_id: str
    severity: str
    risk_weight_0to3: int
    matched_e_numbers: List[str]
    health_outcome_short: str = ""
    context: str = ""
    sources: List[SourceOut] = Field(default_factory=list)


class SummaryOut(BaseModel):
    score: int
    grade: str
    matches: int
    method: str


class CheckResponse(BaseModel):
    inputs: List[str]
    additives: List[AdditiveOut]
    summary: SummaryOut
    matches: List[MatchOut]


# ----------------------------
# Helpers
# ----------------------------
def _connect(db_path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    return con


def _norm_e(x: str) -> str:
    s = (x or "").strip().upper()
    if not s:
        return ""
    if s[0].isdigit():
        s = "E" + s
    return s


def _expand_e(e: str) -> Set[str]:
    """
    Expand OFF variants like E322I -> {E322I, E322}
    Keep valid letter-suffix E-numbers like E150D as-is, but still include base (E150).
    """
    out = set()
    e = _norm_e(e)
    if not e:
        return out
    out.add(e)
    m = re.match(r"^(E)(\d+)([A-Z]+)?$", e)
    if m:
        base = f"E{m.group(2)}"
        out.add(base)
    return out


def _pat_match(pattern: str, token: str) -> bool:
    p = (pattern or "").strip()
    t = (token or "").strip()
    if not p or not t:
        return False
    # treat CSV patterns as regex when possible
    try:
        return re.search(p, t, flags=re.IGNORECASE) is not None
    except re.error:
        return p.lower() in t.lower()


def _severity(weight: int) -> str:
    if weight >= 3:
        return "high"
    if weight == 2:
        return "medium"
    if weight == 1:
        return "low"
    return "info"


def _grade(score: int) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    if score >= 40:
        return "D"
    return "E"


def _score_from_weights(weights: List[int]) -> Tuple[int, str]:
    # keep your existing v1 logic but clamp to [0,100]
    score = 100 - 15 * sum(weights)
    score = max(0, min(100, score))
    return score, "v1: 100 - 15*sum(risk_weight_0to3)"


def _split_ids(x: str) -> List[str]:
    s = (x or "").strip()
    if not s:
        return []
    return [t.strip() for t in s.split(",") if t.strip()]


# ----------------------------
# Route
# ----------------------------
@router.post("/check", response_model=CheckResponse)
def check(req: CheckRequest) -> CheckResponse:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Risk DB not found at {DB_PATH}. Ensure apps/api/data/risk.db exists (you imported it).",
        )

    # normalize + unique inputs (but keep deterministic order)
    cleaned: List[str] = []
    seen: Set[str] = set()
    for raw in req.e_numbers or []:
        e = _norm_e(raw)
        if not e:
            continue
        if e not in seen:
            seen.add(e)
            cleaned.append(e)

    con = _connect(DB_PATH)
    cur = con.cursor()

    # --- Additive info (always return something useful)
    additives: List[AdditiveOut] = []
    if cleaned:
        qmarks = ",".join(["?"] * len(cleaned))
        rows = cur.execute(
            f"""
            SELECT e_number, name, "group", basic_risk_level, adi_mg_per_kg_bw_day, simple_user_message, source_url
            FROM additives_info
            WHERE UPPER(e_number) IN ({qmarks})
            """,
            [e.upper() for e in cleaned],
        ).fetchall()

        by_e: Dict[str, sqlite3.Row] = {str(r["e_number"]).upper(): r for r in rows}
        for e in cleaned:
            r = by_e.get(e.upper())
            if r:
                additives.append(
                    AdditiveOut(
                        e_number=e,
                        name=str(r["name"] or ""),
                        group=str(r["group"] or ""),
                        basic_risk_level=str(r["basic_risk_level"] or ""),
                        adi_mg_per_kg_bw_day=r["adi_mg_per_kg_bw_day"],
                        simple_user_message=str(r["simple_user_message"] or ""),
                        source_url=str(r["source_url"] or ""),
                    )
                )
            else:
                additives.append(AdditiveOut(e_number=e))

    # --- Combo matches
    # Build tokens per input additive so patterns can match E322I/E322 etc.
    tokens_by_input: Dict[str, Set[str]] = {e: _expand_e(e) for e in cleaned}

    combo_rows = cur.execute(
        """
        SELECT
          combo_id,
          ingredient_1_pattern,
          ingredient_2_pattern,
          context,
          health_outcome_short,
          risk_weight_0to3,
          primary_source_id,
          extra_source_ids
        FROM risk_combinations
        """
    ).fetchall()

    # Preload sources
    src_rows = cur.execute(
        "SELECT source_id, title, url, year, notes FROM risk_sources"
    ).fetchall()
    src_map: Dict[str, sqlite3.Row] = {str(r["source_id"]): r for r in src_rows}

    matches: List[MatchOut] = []
    used_combo_ids: Set[str] = set()
    weights: List[int] = []

    # For each combo row, see if pattern1 matches one input and pattern2 matches a *different* input
    for row in combo_rows:
        combo_id = str(row["combo_id"])
        if combo_id in used_combo_ids:
            continue

        p1 = str(row["ingredient_1_pattern"] or "").strip()
        p2 = str(row["ingredient_2_pattern"] or "").strip()
        if not p1 or not p2:
            continue

        # find matched inputs
        matched_inputs_1: List[str] = []
        matched_inputs_2: List[str] = []

        for e, toks in tokens_by_input.items():
            if any(_pat_match(p1, t) for t in toks):
                matched_inputs_1.append(e)
            if any(_pat_match(p2, t) for t in toks):
                matched_inputs_2.append(e)

        found_pair: Optional[Tuple[str, str]] = None
        for a in matched_inputs_1:
            for b in matched_inputs_2:
                if a != b:
                    found_pair = (a, b)
                    break
            if found_pair:
                break

        if not found_pair:
            # also allow swapped order (pattern1 could match B and pattern2 could match A)
            found_pair_swapped: Optional[Tuple[str, str]] = None
            for a in matched_inputs_2:
                for b in matched_inputs_1:
                    if a != b:
                        found_pair_swapped = (a, b)
                        break
                if found_pair_swapped:
                    break
            if found_pair_swapped:
                found_pair = found_pair_swapped

        if not found_pair:
            continue

        a, b = found_pair
        w = int(row["risk_weight_0to3"] or 0)
        sev = _severity(w)

        # build source list (primary + extra)
        src_ids = []
        primary = str(row["primary_source_id"] or "").strip()
        if primary:
            src_ids.append(primary)
        src_ids.extend(_split_ids(str(row["extra_source_ids"] or "")))

        sources: List[SourceOut] = []
        for sid in src_ids:
            sr = src_map.get(sid)
            if not sr:
                continue
            sources.append(
                SourceOut(
                    source_id=sid,
                    title=str(sr["title"] or ""),
                    url=str(sr["url"] or ""),
                    year=str(sr["year"] or ""),
                    notes=str(sr["notes"] or ""),
                )
            )

        matches.append(
            MatchOut(
                combo_id=combo_id,
                severity=sev,
                risk_weight_0to3=w,
                matched_e_numbers=[a, b],
                health_outcome_short=str(row["health_outcome_short"] or ""),
                context=str(row["context"] or ""),
                sources=sources,
            )
        )
        used_combo_ids.add(combo_id)
        weights.append(w)

    # Summary scoring
    score, method = _score_from_weights(weights)
    grade = _grade(score)

    con.close()

    return CheckResponse(
        inputs=cleaned,
        additives=additives,
        summary=SummaryOut(score=score, grade=grade, matches=len(matches), method=method),
        matches=matches,
    )
