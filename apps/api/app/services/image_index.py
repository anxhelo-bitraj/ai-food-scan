from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
import pandas as pd

try:
    import faiss  # type: ignore
except Exception:
    faiss = None  # type: ignore


ASSETS_DIR = Path(__file__).resolve().parents[1] / "ai_assets" / "image_index"
INDEX_PATH = ASSETS_DIR / "image_index.faiss"
META_PATH = ASSETS_DIR / "image_index_meta.parquet"


class ImageIndexNotReady(RuntimeError):
    pass


@lru_cache(maxsize=1)
def load_image_index() -> Tuple["faiss.Index", "pd.DataFrame"]:
    if faiss is None:
        raise ImageIndexNotReady("faiss is not installed in this API environment.")
    if not INDEX_PATH.exists():
        raise ImageIndexNotReady(f"Missing FAISS index: {INDEX_PATH}")
    if not META_PATH.exists():
        raise ImageIndexNotReady(f"Missing meta parquet: {META_PATH}")

    index = faiss.read_index(str(INDEX_PATH))
    meta = pd.read_parquet(META_PATH)

    ntotal = int(getattr(index, "ntotal", 0))
    if ntotal and len(meta) != ntotal:
        print(f"[ai] WARNING: meta rows ({len(meta)}) != index.ntotal ({ntotal})")

    return index, meta


def search_by_embedding(embedding: np.ndarray, k: int = 5) -> Dict[str, Any]:
    index, meta = load_image_index()

    if embedding.ndim == 1:
        embedding = embedding[None, :]
    embedding = np.asarray(embedding, dtype="float32")

    d = getattr(index, "d", None)
    if d is not None and embedding.shape[1] != int(d):
        raise ValueError(f"Embedding dim mismatch: got {embedding.shape[1]} expected {int(d)}")

    distances, indices = index.search(embedding, int(k))

    # Metric label (best-effort)
    metric = "l2"
    try:
        if getattr(index, "metric_type", None) == faiss.METRIC_INNER_PRODUCT:
            metric = "inner_product"
    except Exception:
        pass

    results = []
    for dist, idx in zip(distances[0].tolist(), indices[0].tolist()):
        if idx is None or int(idx) < 0:
            continue
        row = meta.iloc[int(idx)].to_dict()
        row["distance"] = float(dist)
        row["i"] = int(idx)
        results.append(row)

    return {
        "metric": metric,
        "k": int(k),
        "results": results,
    }
