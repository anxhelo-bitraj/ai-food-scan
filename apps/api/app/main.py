from fastapi import FastAPI
from sqlalchemy import text

from app.db.session import engine
from app.api.routes import products
from app.api.routes.additives import router as additives_router
from app.api.routes.interactions import router as interactions_router

app = FastAPI(title="AI Food Scan API")

app.include_router(products.router)
app.include_router(additives_router)
app.include_router(interactions_router)

@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"ok": True}

# AUTO_PRODUCTS_ADDITIVES_ENRICH_START
try:
    import json
    from fastapi import Request
    from fastapi.responses import JSONResponse
    from starlette.responses import Response

    @app.middleware("http")
    async def _products_additives_enrich(request: Request, call_next):
        resp = await call_next(request)

        if request.method != "GET":
            return resp
        if not request.url.path.startswith("/products/"):
            return resp

        ctype = (resp.headers.get("content-type") or "").lower()
        if "application/json" not in ctype:
            return resp

        body = b""
        async for chunk in resp.body_iterator:
            body += chunk

        try:
            data = json.loads(body.decode("utf-8"))
        except Exception:
            # return original response unchanged
            headers = dict(resp.headers)
            headers.pop("content-length", None)
            return Response(content=body, status_code=resp.status_code, headers=headers, media_type=resp.media_type)

        if isinstance(data, dict):
            try:
                from app.additives_product_enricher import enrich_product_payload
                data = enrich_product_payload(data)
            except Exception:
                pass

        headers = dict(resp.headers)
        headers.pop("content-length", None)
        return JSONResponse(data, status_code=resp.status_code, headers=headers)
except Exception as _e:
    print("[products] additives enrich middleware not installed:", _e)
# AUTO_PRODUCTS_ADDITIVES_ENRICH_END
