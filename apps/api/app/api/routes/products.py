from app.scoring_food import enrich_scores
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Product, ProductScore
from app.services.openfoodfacts import fetch_off_product

router = APIRouter(prefix="/products", tags=["products"])

REFRESH_TTL = timedelta(days=7)

def _now():
    return datetime.now(timezone.utc)

def _safe_list(v) -> List[Any]:
    return v if isinstance(v, list) else []

def _safe_dict(v) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}

def _as_aware_utc(dt):
    if dt is None:
        return None
    # If DB returns naive datetime, assume UTC
    if getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def _needs_refresh(p: Product) -> bool:
    synced = _as_aware_utc(getattr(p, "off_last_synced_at", None))

    # Refresh if never synced
    if synced is None:
        return True

    # Refresh if key fields still missing
    if not getattr(p, "name", None) or not getattr(p, "image_url", None):
        return True

    if getattr(p, "ingredients_text", None) is None:
        return True

    # Refresh if TTL expired
    try:
        if _now() - synced > REFRESH_TTL:
            return True
    except Exception:
        return True

    return False


async def _fetch_off_product_raw(barcode: str) -> dict:
    import httpx
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
    except Exception:
        return {}
    if r.status_code != 200:
        return {}
    data = r.json() or {}
    return data.get("product") or {}

@router.get("/{barcode}")
async def get_product(barcode: str, include_off: bool = False, db: Session = Depends(get_db)):
    barcode = (barcode or "").strip()

    product = db.execute(select(Product).where(Product.barcode == barcode)).scalar_one_or_none()
    if product is None:
        product = Product(barcode=barcode)
        db.add(product)
        db.flush()

    # Refresh from OFF if needed (never crash)
    if _needs_refresh(product):
        try:
            off = await fetch_off_product(barcode)
        except Exception:
            off = {}

        if off:
            product.name = off.get("name")
            product.brand = off.get("brand")
            product.image_url = off.get("image_url")

            product.ingredients_text = off.get("ingredients_text")
            product.allergens = off.get("allergens") or []
            product.traces = off.get("traces") or []
            product.additives = off.get("additives") or []
            product.analysis = off.get("analysis") or []
            product.diet_flags = off.get("diet_flags") or {"vegan": None, "vegetarian": None}

            product.nutriscore_grade = off.get("nutriscore_grade")
            product.ecoscore_grade = off.get("ecoscore_grade")
            product.ecoscore_score = off.get("ecoscore_score")

            product.off_last_synced_at = _now()

        try:
            db.commit()
            db.refresh(product)
        except Exception:
            db.rollback()

    score = db.execute(select(ProductScore).where(ProductScore.product_id == product.id)).scalar_one_or_none()

    out = {
        "barcode": product.barcode,
        "name": product.name,
        "brand": product.brand,
        "image_url": product.image_url,
        "ingredients_text": getattr(product, "ingredients_text", None),

        # ALWAYS arrays (mobile safe)
        "allergens": _safe_list(getattr(product, "allergens", None)),
        "traces": _safe_list(getattr(product, "traces", None)),
        "additives": _safe_list(getattr(product, "additives", None)),
        "analysis": _safe_list(getattr(product, "analysis", None)),

        "diet_flags": _safe_dict(getattr(product, "diet_flags", None)) or {"vegan": None, "vegetarian": None},

        "nutriscore_grade": getattr(product, "nutriscore_grade", None),
        "ecoscore_grade": getattr(product, "ecoscore_grade", None),
        "ecoscore_score": getattr(product, "ecoscore_score", None),

        "health_score": getattr(score, "health_score", None),
        "eco_score": getattr(score, "eco_score", None),
        "additive_score": getattr(score, "additive_score", None),
    }


    if include_off:
        try:
            raw = await _fetch_off_product_raw(barcode)
            out["off"] = _off_summary(raw)
        except Exception:
            out["off"] = {}
    return out
@router.get("/{barcode}/off_raw")
async def off_raw_product(barcode: str, product_only: bool = False):
    """
    Debug: return raw OpenFoodFacts payload for this barcode.
    If product_only=true, return only the OFF 'product' object.
    """
    import httpx
    from fastapi import HTTPException

    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"OFF request failed: {str(e)}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OFF returned HTTP {r.status_code}")

    data = r.json()
    return (data.get("product") or {}) if product_only else data

def _off_summary(p: dict) -> dict:
    return {
        "nova_group": p.get("nova_group"),
        "nutriscore_grade": p.get("nutriscore_grade"),
        "nutriscore_data": p.get("nutriscore_data"),
        "nutriments": p.get("nutriments"),
        "nutrition_data_per": p.get("nutrition_data_per"),
        "serving_size": p.get("serving_size"),
        "ecoscore_grade": p.get("ecoscore_grade"),
        "ecoscore_data": p.get("ecoscore_data"),
        "packaging": p.get("packaging"),
        "packaging_tags": p.get("packaging_tags") or [],
        "packaging_materials_tags": p.get("packaging_materials_tags") or [],
        "categories_tags": p.get("categories_tags") or [],
        "labels_tags": p.get("labels_tags") or [],
        "origins_tags": p.get("origins_tags") or [],
        "countries_tags": p.get("countries_tags") or [],
        "stores_tags": p.get("stores_tags") or [],
    }
