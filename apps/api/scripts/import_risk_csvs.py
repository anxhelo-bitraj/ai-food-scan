import csv
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # ~/Desktop/ai-food-scan
DATA_DIR = ROOT / "apps" / "api" / "data"

ADD_INFO = DATA_DIR / "additives_info.csv"
COMBOS = DATA_DIR / "risk_combinations.csv"
SOURCES = DATA_DIR / "risk_sources.csv"

DB_PATH = Path(os.environ.get("RISK_DB_PATH", str(DATA_DIR / "risk.db")))

def must_exist(p: Path):
    if not p.exists():
        raise SystemExit(f"Missing file: {p}")

def read_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def norm_e(x: str) -> str:
    s = (x or "").strip().upper()
    if not s:
        return ""
    if s[0].isdigit():
        s = "E" + s
    return s

def to_float(x):
    s = (x or "").strip()
    if s == "":
        return None
    try:
        return float(s)
    except:
        return None

def to_int(x):
    s = (x or "").strip()
    if s == "":
        return None
    try:
        return int(float(s))
    except:
        return None

def main():
    must_exist(ADD_INFO)
    must_exist(COMBOS)
    must_exist(SOURCES)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(str(DB_PATH))
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    cur = con.cursor()

    # Tables
    cur.execute("""
    CREATE TABLE IF NOT EXISTS additives_info (
      e_number TEXT PRIMARY KEY,
      name TEXT,
      "group" TEXT,
      basic_risk_level TEXT,
      adi_mg_per_kg_bw_day REAL,
      simple_user_message TEXT,
      source_url TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS risk_sources (
          source_id TEXT PRIMARY KEY,
          title TEXT,
          year TEXT,
          organisation_or_journal TEXT,
          reference_type TEXT,
          url TEXT,
          notes TEXT
        );
""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS risk_combinations (
      combo_id TEXT PRIMARY KEY,
      ingredient_1_pattern TEXT,
      ingredient_2_pattern TEXT,
      context TEXT,
      health_outcome_short TEXT,
      risk_weight_0to3 INTEGER,
      primary_source_id TEXT,
      extra_source_ids TEXT
    );
    """)

    # Clear + reload (keeps it deterministic)
    cur.execute("DELETE FROM additives_info;")
    cur.execute("DELETE FROM risk_sources;")
    cur.execute("DELETE FROM risk_combinations;")

    # Load additives_info.csv
    add_rows = read_rows(ADD_INFO)
    for r in add_rows:
        e = norm_e(r.get("e_number", ""))
        if not e:
            continue
        cur.execute("""
          INSERT INTO additives_info (e_number, name, "group", basic_risk_level, adi_mg_per_kg_bw_day, simple_user_message, source_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            e,
            (r.get("name") or "").strip(),
            (r.get("group") or "").strip(),
            (r.get("basic_risk_level") or "").strip(),
            to_float(r.get("adi_mg_per_kg_bw_day")),
            (r.get("simple_user_message") or "").strip(),
            (r.get("source_url") or "").strip(),
        ))

    # Load risk_sources.csv
    src_rows = read_rows(SOURCES)
    for r in src_rows:
        sid = (r.get("source_id") or "").strip()
        if not sid:
            continue
        cur.execute("""
          INSERT INTO risk_sources (source_id, title, year, organisation_or_journal, reference_type, url, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            sid,
            (r.get("title") or "").strip(),
            (r.get("year") or "").strip(),
            (r.get("organisation_or_journal") or "").strip(),
            (r.get("reference_type") or "").strip(),
            (r.get("url") or "").strip(),
            (r.get("notes") or "").strip(),
        ))

    # Load risk_combinations.csv
    combo_rows = read_rows(COMBOS)
    for r in combo_rows:
        cid = (r.get("combo_id") or "").strip()
        if not cid:
            continue
        cur.execute("""
          INSERT INTO risk_combinations (
            combo_id, ingredient_1_pattern, ingredient_2_pattern, context, health_outcome_short,
            risk_weight_0to3, primary_source_id, extra_source_ids
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cid,
            (r.get("ingredient_1_pattern") or "").strip(),
            (r.get("ingredient_2_pattern") or "").strip(),
            (r.get("context") or "").strip(),
            (r.get("health_outcome_short") or "").strip(),
            to_int(r.get("risk_weight_0to3")) or 0,
            (r.get("primary_source_id") or "").strip(),
            (r.get("extra_source_ids") or "").strip(),
        ))

    con.commit()

    # Print counts
    def count(table):
        return cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    print("DB:", DB_PATH)
    print("additives_info:", count("additives_info"))
    print("risk_sources:", count("risk_sources"))
    print("risk_combinations:", count("risk_combinations"))

    con.close()

if __name__ == "__main__":
    main()
