import csv
import re
from pathlib import Path
from sqlalchemy import text
from app.db.session import engine

REPO_ROOT = Path(__file__).resolve().parents[3]
MANUAL_DIR = REPO_ROOT / "cloud_pack" / "manual"

ADD_CSV = MANUAL_DIR / "additives_info.csv"
SRC_CSV = MANUAL_DIR / "risk_sources.csv"
RULE_CSV = MANUAL_DIR / "risk_combinations.csv"

def severity_from_weight(w: str) -> str:
    try:
        x = int(float(w))
    except Exception:
        return "Medium"
    if x <= 1:
        return "Low"
    if x == 2:
        return "Medium"
    return "High"

def confidence_from_strength(s: str) -> str:
    v = (s or "").strip().lower()
    if any(k in v for k in ["strong", "high"]):
        return "High"
    if any(k in v for k in ["moderate", "medium"]):
        return "Medium"
    if v:
        return "Low"
    return "Low"

def upsert_sources_return_id_map():
    """
    Seeds evidence_sources from risk_sources.csv and returns mapping:
    source_id (e.g., SRC_...) -> evidence_sources.id
    """
    if not SRC_CSV.exists():
        raise FileNotFoundError(f"Missing {SRC_CSV}")

    # Build source_id -> (title,url,publisher)
    src_rows = []
    with SRC_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            sid = (r.get("source_id") or "").strip()
            title = (r.get("title") or "").strip()
            url = (r.get("url") or "").strip()
            publisher = (r.get("organisation_or_journal") or r.get("publisher") or "").strip() or None
            if not sid or not url:
                continue
            src_rows.append((sid, title or "Source", url, publisher))

    with engine.begin() as conn:
        for sid, title, url, publisher in src_rows:
            conn.execute(text("""
                INSERT INTO evidence_sources (label, url, publisher)
                VALUES (:label, :url, :publisher)
                ON CONFLICT (url) DO UPDATE SET
                    label = EXCLUDED.label,
                    publisher = COALESCE(EXCLUDED.publisher, evidence_sources.publisher)
            """), {"label": title, "url": url, "publisher": publisher})

        # Map url -> id
        url_to_id = {row["url"]: row["id"] for row in conn.execute(text("SELECT id, url FROM evidence_sources")).mappings()}

    # Map source_id -> id via url
    sid_to_id = {}
    for sid, title, url, publisher in src_rows:
        dbid = url_to_id.get(url)
        if dbid:
            sid_to_id[sid] = dbid

    return sid_to_id

def upsert_additives():
    if not ADD_CSV.exists():
        raise FileNotFoundError(f"Missing {ADD_CSV}")
    with engine.begin() as conn:
        with ADD_CSV.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                e = (r.get("e_number") or r.get("E_number") or r.get("eNumber") or "").strip()
                if not e:
                    continue
                name = (r.get("name") or r.get("additive_name") or "").strip() or None
                risk = (r.get("risk_level") or r.get("risk") or "").strip() or None
                desc = (r.get("description") or r.get("explanation") or r.get("why") or "").strip() or None

                conn.execute(text("""
                    INSERT INTO additives (e_number, name, risk_level, description)
                    VALUES (:e, :name, :risk, :desc)
                    ON CONFLICT (e_number) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, additives.name),
                        risk_level = COALESCE(EXCLUDED.risk_level, additives.risk_level),
                        description = COALESCE(EXCLUDED.description, additives.description),
                        updated_at = now()
                """), {"e": e, "name": name, "risk": risk, "desc": desc})

def reset_interactions():
    # wipe only interaction tables so re-seeding is clean
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE interaction_rule_sources, interaction_rule_items, interaction_rules RESTART IDENTITY"))

def seed_rules(sid_to_source_dbid: dict):
    if not RULE_CSV.exists():
        raise FileNotFoundError(f"Missing {RULE_CSV}")

    with engine.begin() as conn:
        with RULE_CSV.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                p1 = (r.get("ingredient_1_pattern") or "").strip()
                p2 = (r.get("ingredient_2_pattern") or "").strip()
                if not p1 or not p2:
                    continue

                combo_id = (r.get("combo_id") or "").strip()
                outcome = (r.get("health_outcome_short") or "").strip()
                title = outcome or combo_id or f"{p1} + {p2}"

                severity = severity_from_weight(r.get("risk_weight_0to3") or "")
                confidence = confidence_from_strength(r.get("evidence_strength") or "")

                why_parts = []
                for k in ["context", "interaction_type", "mechanism_notes", "typical_food_context", "vulnerable_groups"]:
                    v = (r.get(k) or "").strip()
                    if v:
                        why_parts.append(v)
                why = "\n\n".join(why_parts) if why_parts else None

                rule_id = conn.execute(text("""
                    INSERT INTO interaction_rules (title, severity, confidence, why, what_to_do)
                    VALUES (:title, :severity, :confidence, :why, :what)
                    RETURNING id
                """), {
                    "title": title,
                    "severity": severity,
                    "confidence": confidence,
                    "why": why,
                    "what": "Placeholder: reduce combined exposure; pick alternatives; consult clinician if symptoms occur."
                }).scalar_one()

                # store patterns as items
                for pat in [p1, p2]:
                    conn.execute(text("""
                        INSERT INTO interaction_rule_items (rule_id, item_type, item_key)
                        VALUES (:rid, :typ, :key)
                        ON CONFLICT ON CONSTRAINT uq_rule_item DO NOTHING
                    """), {"rid": rule_id, "typ": "pattern", "key": pat})

                # link sources by source_id codes
                source_ids = []
                primary = (r.get("primary_source_id") or "").strip()
                if primary:
                    source_ids.append(primary)

                extra = (r.get("extra_source_ids") or "").strip()
                if extra:
                    source_ids.extend([x.strip() for x in re.split(r"[;,|]", extra) if x.strip()])

                for sid in source_ids:
                    dbid = sid_to_source_dbid.get(sid)
                    if not dbid:
                        continue
                    conn.execute(text("""
                        INSERT INTO interaction_rule_sources (rule_id, source_id)
                        VALUES (:rid, :sid)
                        ON CONFLICT ON CONSTRAINT uq_rule_source DO NOTHING
                    """), {"rid": rule_id, "sid": dbid})

def main():
    print("Manual dir:", MANUAL_DIR)
    sid_to_dbid = upsert_sources_return_id_map()
    print("✅ sources", len(sid_to_dbid))
    upsert_additives()
    print("✅ additives")
    reset_interactions()
    print("✅ reset interactions")
    seed_rules(sid_to_dbid)
    print("✅ interaction rules seeded")

if __name__ == "__main__":
    main()
