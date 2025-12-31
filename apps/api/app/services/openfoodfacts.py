import os
from typing import Any, Dict, List, Optional

import httpx

OFF_BASE_URL = os.getenv("OFF_BASE_URL", "https://world.openfoodfacts.org").rstrip("/")
OFF_USER_AGENT = os.getenv("OFF_USER_AGENT", "AI-Food-Scan/0.1")

# Pull only what we need (fast + stable)
OFF_FIELDS = ",".join([
    "code",
    "product_name",
    "generic_name",
    "brands",
    "selected_images",
    "image_front_url",
    "ingredients_text",
    "ingredients_analysis_tags",
    "allergens_tags",
    "traces_tags",
    "additives_tags",
    "nutriscore_grade",
    "ecoscore_grade",
    "ecoscore_score",
])

def _strip_lang(tags: List[Any]) -> List[str]:
    out: List[str] = []
    for t in tags or []:
        if not isinstance(t, str):
            continue
        out.append(t.split(":", 1)[1] if ":" in t else t)
    return out

def _to_e_number(tag: str) -> str:
    # OFF uses e150d, e338 etc → convert to E150D, E338
    t = tag.strip()
    if t.startswith("e") and len(t) >= 2 and t[1].isdigit():
        return "E" + t[1:].upper()
    return t.upper()

def _front_image(product: Dict[str, Any]) -> Optional[str]:
    sel = product.get("selected_images") or {}
    # try english, then any
    try:
        en = sel.get("front", {}).get("display", {}).get("en")
        if en:
            return en
        disp = sel.get("front", {}).get("display", {}) or {}
        if isinstance(disp, dict):
            for _, v in disp.items():
                if v:
                    return v
    except Exception:
        pass
    return product.get("image_front_url") or None

def _diet_flags(analysis_tags: List[str]) -> Dict[str, Optional[bool]]:
    tags = set(analysis_tags or [])
    vegan = True if "vegan" in tags else (False if "non-vegan" in tags else None)
    vegetarian = True if "vegetarian" in tags else (False if "non-vegetarian" in tags else None)
    return {"vegan": vegan, "vegetarian": vegetarian}

async def fetch_off_product(barcode: str) -> Dict[str, Any]:
    url = f"{OFF_BASE_URL}/api/v2/product/{barcode}.json"
    async with httpx.AsyncClient(
        timeout=15.0,
        headers={"User-Agent": OFF_USER_AGENT},
    ) as client:
        r = await client.get(url, params={"fields": OFF_FIELDS})

    r.raise_for_status()
    payload = r.json()
    product = payload.get("product") or {}

    name = product.get("product_name") or product.get("generic_name") or None
    brand = product.get("brands") or None
    image_url = _front_image(product)
    ingredients_text = product.get("ingredients_text") or None

    allergens = _strip_lang(product.get("allergens_tags") or [])
    traces = _strip_lang(product.get("traces_tags") or [])
    additives_raw = _strip_lang(product.get("additives_tags") or [])
    additives = [_to_e_number(a) for a in additives_raw]

    analysis_tags = _strip_lang(product.get("ingredients_analysis_tags") or [])
    analysis = [t.replace("-", " ") for t in analysis_tags]
    diet_flags = _diet_flags(analysis_tags)

    return {
        "barcode": str(barcode),
        "name": name,
        "brand": brand,
        "image_url": image_url,
        "ingredients_text": ingredients_text,
        "allergens": allergens,
        "traces": traces,
        "additives": additives,
        "analysis": analysis,
        "diet_flags": diet_flags,
        "nutriscore_grade": product.get("nutriscore_grade"),
        "ecoscore_grade": product.get("ecoscore_grade"),
        "ecoscore_score": product.get("ecoscore_score"),
    }
