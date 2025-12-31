from __future__ import annotations
import json
import inspect
from typing import Any, Callable

from starlette.responses import JSONResponse, Response

from app.scoring_yuka_simple import enrich_scores

def _apply_scoring(result: Any) -> Any:
    # dict return
    if isinstance(result, dict):
        return enrich_scores(result)

    # JSONResponse return
    if isinstance(result, JSONResponse):
        try:
            data = json.loads(result.body.decode("utf-8"))
            if isinstance(data, dict):
                data = enrich_scores(data)
                return JSONResponse(
                    content=data,
                    status_code=result.status_code,
                    headers=dict(result.headers),
                    media_type=result.media_type,
                )
        except Exception:
            return result

    # anything else
    return result

def apply_scoring_patch(app) -> int:
    patched = 0
    for r in getattr(app, "routes", []):
        if getattr(r, "path", None) == "/products/{barcode}" and "GET" in (getattr(r, "methods", []) or []):
            orig = getattr(r, "endpoint", None)
            if not orig or getattr(orig, "__scoring_wrapped__", False):
                continue

            if inspect.iscoroutinefunction(orig):
                async def wrapped(*args, __orig=orig, **kwargs):
                    res = await __orig(*args, **kwargs)
                    return _apply_scoring(res)
            else:
                def wrapped(*args, __orig=orig, **kwargs):
                    res = __orig(*args, **kwargs)
                    return _apply_scoring(res)

            wrapped.__scoring_wrapped__ = True
            r.endpoint = wrapped
            patched += 1

    return patched
