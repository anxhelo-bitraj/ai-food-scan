from __future__ import annotations
import os, re
from functools import lru_cache
from typing import Any, Dict, Optional

ICLOUD_DIR = "/Users/angelo/Library/Mobile Documents/com~apple~CloudDocs/AnxheloBitraj/Brunel/Dissertation/data/processed/additives"

def _norm_e(x: str) -> str:
    s = (x or "").strip().upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    if not s:
        return ""
    if not s.startswith("E"):
        s = "E" + s
    return s

def _dir() -> str:
    env = (os.getenv("ADDITIVES_DATA_DIR") or "").strip()
    return env or ICLOUD_DIR

def _fp(name: str) -> str:
    return os.path.join(_dir(), name)

@lru_cache(maxsize=1)
def _load() -> Dict[str, Any]:
    import pyarrow.parquet as pq

    base_fp = _fp("additives_uk_fsa.parquet")
    exp_fp  = _fp("additives_uk_fsa_expanded.parquet")

    base_name: Dict[str, str] = {}
    variants: Dict[str, set[str]] = {}

    if os.path.exists(base_fp):
        t = pq.read_table(base_fp).to_pandas()
        # columns: e_number_raw, name
        for _, r in t.iterrows():
            e = _norm_e(str(r.get("e_number_raw", "") or ""))
            n = str(r.get("name", "") or "").strip()
            if e and n:
                base_name[e] = n

    if os.path.exists(exp_fp):
        t = pq.read_table(exp_fp).to_pandas()
        # columns: e_number_raw, e_number_base, name_variant
        for _, r in t.iterrows():
            base = _norm_e(str(r.get("e_number_base", "") or r.get("e_number_raw", "") or ""))
            v = str(r.get("name_variant", "") or "").strip()
            if base and v:
                variants.setdefault(base, set()).add(v)

    # also allow lookup by raw keys if someone passes "E322I"
    # map raw -> base in a best-effort way
    raw_to_base: Dict[str, str] = {}
    if os.path.exists(exp_fp):
        t = pq.read_table(exp_fp).to_pandas()
        for _, r in t.iterrows():
            raw = _norm_e(str(r.get("e_number_raw", "") or ""))
            base = _norm_e(str(r.get("e_number_base", "") or ""))
            if raw and base:
                raw_to_base[raw] = base

    return {
        "base_fp": base_fp,
        "exp_fp": exp_fp,
        "base_name": base_name,
        "variants": variants,
        "raw_to_base": raw_to_base,
    }

def additives_meta() -> Dict[str, Any]:
    d = _load()
    return {
        "dir": _dir(),
        "base_fp_exists": os.path.exists(d["base_fp"]),
        "expanded_fp_exists": os.path.exists(d["exp_fp"]),
        "base_count": len(d["base_name"]),
        "variants_count": len(d["variants"]),
    }

def lookup_additive(e_number: str) -> Optional[Dict[str, Any]]:
    d = _load()
    key = _norm_e(e_number)
    if not key:
        return None

    base = d["raw_to_base"].get(key, key)
    name = d["base_name"].get(base)
    vars_ = sorted(d["variants"].get(base, set()))

    if not name and vars_:
        name = vars_[0]

    if not name and not vars_:
        return None

    return {
        "e_number": base,
        "name": name,
        "name_variants": vars_,
    }
