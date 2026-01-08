from __future__ import annotations

import io
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image

from app.services.clip_embedder import embed_pil
from app.services.faiss_index_runtime import search as faiss_search, status as faiss_status


router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/recognize/status")
def recognize_status():
    # quick sanity that index files are reachable (and gives dim/ntotal)
    return faiss_status()


@router.post("/recognize")
async def recognize(
    image: UploadFile = File(...),
    k: int = Query(5, ge=1, le=50),
):
    try:
        data = await image.read()
        img = Image.open(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    vec = embed_pil(img)  # 512-dim float32 (normalized)
    results = faiss_search(vec, k=k)
    return {"ok": True, "k": k, "results": results}
