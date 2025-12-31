from __future__ import annotations

import re
import inspect
from typing import Any

from fastapi.routing import APIRoute
from starlette.routing import request_response

from fastapi import HTTPException

from app.additives_store import lookup_additive, additives_meta

_ADD_PATH_RE = re.compile(r"^/additives/\{[^}]+\}$")

def apply_additives_patch(app) -> int:
    patched = 0

    for r in getattr(app, "routes", []):
        if not isinstance(r, APIRoute):
            continue
        if not _ADD_PATH_RE.match(getattr(r, "path", "") or ""):
            continue

        methods = set(getattr(r, "methods", []) or [])
        if "GET" not in methods:
            continue

        orig = getattr(r, "endpoint", None)
        if not orig or getattr(orig, "__additives_wrapped__", False):
            continue

        if inspect.iscoroutinefunction(orig):
            async def wrapped(*args, __orig=orig, **kwargs):
                e = kwargs.get("e_number") or kwargs.get("eNumber") or (args[0] if args else "")
                row = lookup_additive(str(e))
                try:
                    res = await __orig(*args, **kwargs)
                except HTTPException as exc:
                    if exc.status_code == 404 and row:
                        return {"e_number": row["e_number"], "uk_fsa": row, "uk_fsa_meta": additives_meta()}
                    raise
                if row and isinstance(res, dict):
                    res.setdefault("uk_fsa", row)
                    res.setdefault("uk_fsa_meta", additives_meta())
                return res
        else:
            def wrapped(*args, __orig=orig, **kwargs):
                e = kwargs.get("e_number") or kwargs.get("eNumber") or (args[0] if args else "")
                row = lookup_additive(str(e))
                try:
                    res = __orig(*args, **kwargs)
                except HTTPException as exc:
                    if exc.status_code == 404 and row:
                        return {"e_number": row["e_number"], "uk_fsa": row, "uk_fsa_meta": additives_meta()}
                    raise
                if row and isinstance(res, dict):
                    res.setdefault("uk_fsa", row)
                    res.setdefault("uk_fsa_meta", additives_meta())
                return res

        wrapped.__additives_wrapped__ = True

        # IMPORTANT: APIRoute needs dependant/app rebuilt, not just endpoint swapped
        r.endpoint = wrapped
        r.dependant.call = wrapped
        r.app = request_response(r.get_route_handler())

        patched += 1

    return patched
