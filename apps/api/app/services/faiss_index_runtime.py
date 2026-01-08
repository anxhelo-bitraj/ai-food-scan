from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import faiss


APP_DIR = Path(__file__).resolve().parents[1]  # .../app
INDEX_PATH = APP_DIR / "ai_assets" / "image_index" / "image_index.faiss"
META_PATH = APP_DIR / "ai_assets" / "image_index" / "image_index_meta.parquet"


def _l2norm(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n <= 0:
        return v
    return v / n


@lru_cache(maxsize=1)
def _load() -> Tuple[Any, pd.DataFrame]:
    index = faiss.read_index(str(INDEX_PATH))
    meta = pd.read_parquet(META_PATH)
    return index, meta


def status() -> Dict[str, Any]:
    index, meta = _load()
    dim = getattr(index, "d", None)
    ntotal = getattr(index, "ntotal", None)
    return {
        "ok": True,
        "dim": dim,
        "ntotal": int(ntotal) if ntotal is not None else None,
        "meta_rows": int(len(meta)),
        "index_path": str(INDEX_PATH),
        "meta_path": str(META_PATH),
    }


def search(vec: np.ndarray, k: int = 5) -> List[Dict[str, Any]]:
    index, meta = _load()
    v = np.asarray(vec, dtype="float32").reshape(1, -1)
    v[0] = _l2norm(v[0])

    D, I = index.search(v, k)
    out: List[Dict[str, Any]] = []
    for dist, idx in zip(D[0].tolist(), I[0].tolist()):
        if idx < 0:
            continue
        row = meta.iloc[int(idx)].to_dict()
        row["distance"] = float(dist)
        row["i"] = int(idx)
        out.append(row)
    return out
