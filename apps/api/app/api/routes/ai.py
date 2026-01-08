from __future__ import annotations

from typing import List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.image_index import ImageIndexNotReady, load_image_index, search_by_embedding

router = APIRouter(prefix="/ai", tags=["ai"])


class SearchRequest(BaseModel):
    embedding: List[float] = Field(..., description="Query embedding vector (float list). Must match index dimension.")
    k: int = Field(5, ge=1, le=50)


@router.get("/status")
def status():
    try:
        index, meta = load_image_index()
        return {
            "ok": True,
            "dim": int(getattr(index, "d", 0) or 0),
            "ntotal": int(getattr(index, "ntotal", 0) or 0),
            "meta_rows": int(len(meta)),
            "index_path": "app/ai_assets/image_index/image_index.faiss",
            "meta_path": "app/ai_assets/image_index/image_index_meta.parquet",
        }
    except ImageIndexNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/search")
def search(req: SearchRequest):
    try:
        emb = np.asarray(req.embedding, dtype="float32")
        return search_by_embedding(emb, k=req.k)
    except ImageIndexNotReady as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI search failed: {e}")


@router.get("/selftest")
def selftest(k: int = 5):
    """
    SAFE selftest (no reconstruct). Loads index+meta and runs a simple search.
    This avoids FAISS calls that can segfault on some index types.
    """
    try:
        from pathlib import Path
        import numpy as np
        import pandas as pd
        import faiss

        api_dir = Path(__file__).resolve().parents[3]  # .../apps/api
        index_path = api_dir / "app/ai_assets/image_index/image_index.faiss"
        meta_path  = api_dir / "app/ai_assets/image_index/image_index_meta.parquet"

        if not index_path.exists():
            return {"ok": False, "error": f"missing index: {index_path}"}
        if not meta_path.exists():
            return {"ok": False, "error": f"missing meta: {meta_path}"}

        index = faiss.read_index(str(index_path))
        meta = pd.read_parquet(meta_path)

        d = int(getattr(index, "d", 0) or 0)
        ntotal = int(getattr(index, "ntotal", 0) or 0)
        kk = max(1, min(int(k), 10))

        # deterministic random query
        rng = np.random.default_rng(0)
        q = rng.standard_normal((1, d)).astype("float32")
        # normalize for inner-product indexes (harmless otherwise)
        q /= (np.linalg.norm(q, axis=1, keepdims=True) + 1e-12)

        D, I = index.search(q, kk)

        results = []
        for rank, idx in enumerate(I[0].tolist()):
            if idx is None or int(idx) < 0:
                continue
            idx = int(idx)
            row = meta.iloc[idx].to_dict() if idx < len(meta) else {"i": idx}
            row["distance"] = float(D[0][rank])
            row["i"] = idx
            results.append(row)

        return {
            "ok": True,
            "dim": d,
            "ntotal": ntotal,
            "k": kk,
            "index_path": str(index_path),
            "meta_path": str(meta_path),
            "results": results,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
