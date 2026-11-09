#!/usr/bin/env python3
"""CI check: every localization key referenced in C++ exists in HRStrings.csv, Arabic is filled,
and {N} placeholders match between Arabic and English. Exit code 1 on any problem."""
import csv, os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "Source", "HeistResponse")
CSV = os.path.join(ROOT, "Content", "Localization", "Raw", "HRStrings.csv")

patterns = [
    r'HRText\("([^"]+)"\)',
    r'(?:NotifyAll|NotifyTeam|ClientNotify|Fail)\((?:\s*EHRTeam::\w+,|\s*[A-Za-z]+->GetTeam\(\),|[^,()]*\?\s*)?\s*TEXT\("([A-Za-z]+\.[A-Za-z0-9.]+)"\)',
    r'TEXT\("((?:Key|Interact|Zone|CCTV|Error|Notify|Negotiation|Settings)\.[A-Za-z0-9.]+)"\)',
]
dynamic = (
    [f"Deal.{k}.{i}" for k in ("Name", "Desc", "Proposed", "Accepted") for i in range(1, 6)]
    + [f"NegResult.{i}" for i in range(1, 10)]
    + [f"Reason.{i}" for i in range(0, 10)]
    + [f"Zone.{z}" for z in ("harbor", "onramp", "carpark", "rail")]
    + [f"Item.{n}" for n in ("Lockpick", "ThermalDrill", "VaultKeycard", "Zipties", "SmokeGrenade", "SpikeStrip", "MedKit")]
)

used = set(dynamic)
for dirpath, _, files in os.walk(SRC):
    for fn in files:
        if fn.endswith((".h", ".cpp")):
            text = open(os.path.join(dirpath, fn), encoding="utf-8").read()
            for p in patterns:
                used.update(re.findall(p, text))

with open(CSV, encoding="utf-8-sig") as f:
    rows = {r["Key"]: r for r in csv.DictReader(f)}

errors = []
for k in sorted(used):
    if k not in rows:
        errors.append(f"missing key: {k}")
for k, r in rows.items():
    if k != "Reason.0" and not r["ar"].strip():
        errors.append(f"empty Arabic: {k}")
    ph_ar = sorted(set(re.findall(r"\{\d\}", r["ar"])))
    ph_en = sorted(set(re.findall(r"\{\d\}", r["en"])))
    if ph_ar != ph_en:
        errors.append(f"placeholder mismatch {k}: ar={ph_ar} en={ph_en}")
unused = sorted(set(rows) - used)
print(f"{len(rows)} strings, {len(used)} referenced, {len(unused)} unreferenced")
for e in errors:
    print("ERROR", e)
sys.exit(1 if errors else 0)
