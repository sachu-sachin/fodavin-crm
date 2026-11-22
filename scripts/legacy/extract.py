"""Extract the old Excel records into JSON for scripts/legacy/import.mjs.

    python -I scripts/legacy/extract.py <attendance.xlsx> <tasks.xlsx> <out.json> <today YYYY-MM-DD>

Only Praveen (FOD001 / "Gowri Praveen") and Nagulan (FOD002) are taken.
Everything about anyone else (Hari) is skipped entirely. Template rows are
dropped: SAMPLE rows, empty placeholder tasks, days after `today`, and the
second workbook's demo attendance sheet (Sheet2), which isn't real data.

The output holds people's work records: keep it out of git and delete it
after importing.
"""

import datetime as dt
import json
import re
import sys

import openpyxl

ATT, TASKS, OUT, TODAY = sys.argv[1], sys.argv[2], sys.argv[3], dt.date.fromisoformat(sys.argv[4])

PEOPLE = {"FOD001": "praveen", "FOD002": "nagulan"}
STATUS = {
    "P": "present", "A": "absent", "HD": "half_day", "WO": "weekly_off", "HOLIDAY": "holiday",
    "H": "holiday", "SL": "sick_leave", "CL": "casual_leave", "EL": "earned_leave",
    "LWP": "unpaid_leave", "OD": "on_duty", "WFH": "work_from_home",
}


def person_of(name):
    n = str(name or "").lower()
    if "hari" in n:
        return None
    if "praveen" in n:
        return "praveen"
    if "nagulan" in n:
        return "nagulan"
    return None


HARI = re.compile(r"\s*\b(?:with|and|to|from)\s+@?Hari(?:\s+Abiram)?\b", re.IGNORECASE)


def clean(text):
    """Tidy a text cell. Hari is left out entirely, including mentions of him
    in other people's notes ("Collaborate with Hari and ..." -> "Collaborate and ...")."""
    if text is None:
        return None
    s = str(text).replace("�", "'").replace("\r", "").strip()
    s = HARI.sub("", s)
    return s or None


def hhmm(t):
    """A real clock time as HH:MM, else None (placeholders come as 1900 datetimes)."""
    if isinstance(t, dt.time):
        return t.strftime("%H:%M")
    return None


def hours(v):
    if isinstance(v, (int, float)):
        return round(float(v), 2) or None
    if isinstance(v, dt.time):
        return round(v.hour + v.minute / 60, 2) or None
    try:
        return round(float(str(v).strip()), 2) or None
    except (TypeError, ValueError):
        return None


def day(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, str):
        for fmt in ("%d-%m-%Y", "%Y-%m-%d"):
            try:
                return dt.datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                pass
    return None


out = {"attendance": [], "tasks": [], "reports": [], "skipped": []}

# -- Attendance: the register is the real record --------------------------------
wb = openpyxl.load_workbook(ATT, data_only=True)
seen = set()
for r in wb["Daily Attendance Register"].iter_rows(min_row=4, values_only=True):
    date, emp = day(r[1]), r[3]
    if date is None or emp not in PEOPLE:
        continue
    who = PEOPLE[emp]
    remarks = clean(r[15])
    if remarks and "SAMPLE" in remarks.upper():
        out["skipped"].append(f"{date} {who}: sample row")
        continue
    if date > TODAY:
        continue
    status = STATUS.get(str(r[10]).strip().upper()) if r[10] else None
    cin, cout = hhmm(r[8]), hhmm(r[9])
    # Text in a time cell ("Client Visit") is a remark, not a time.
    for cell in (r[8], r[9]):
        if isinstance(cell, str) and cell.strip().upper() not in ("HOLIDAY", ""):
            remarks = "; ".join(x for x in (remarks, cell.strip()) if x)
    if not status and not cin:
        continue
    if (who, date) in seen:
        out["skipped"].append(f"{date} {who}: duplicate row in the register")
        continue
    seen.add((who, date))
    out["attendance"].append({
        "person": who, "date": date.isoformat(), "status": status,
        "check_in": cin, "check_out": cout if cin else None, "remarks": remarks,
    })

# -- Tasks ------------------------------------------------------------------------
STAT = {"done": "done", "in progress": "in_progress", "not started": "todo", "blocked": "todo", "review": "review"}
PRI = {"high": "high", "medium": "medium", "low": "low", "urgent": "urgent"}
wt = openpyxl.load_workbook(TASKS, data_only=True)


def add_task(ref, desc, who, workstream, priority, status, start, due, t_start, t_end, alloc, actual, notes):
    desc = clean(desc)
    if not desc or not who:
        return
    title = " ".join(desc.split())
    if len(title) > 120:
        title = title[:117].rstrip() + "…"
    body = desc
    if clean(notes):
        body += f"\n\nNotes: {clean(notes)}"
    out["tasks"].append({
        "ref": ref, "person": who, "title": title, "description": body,
        "workstream": clean(workstream), "priority": PRI.get(str(priority or "").strip().lower(), "medium"),
        "status": STAT.get(str(status or "").strip().lower(), "todo"),
        "start_date": start.isoformat() if start else None, "due_date": due.isoformat() if due else None,
        "start_time": hhmm(t_start), "end_time": hhmm(t_end),
        "allocated_hours": hours(alloc), "actual_hours": hours(actual),
    })


for r in wt["Sheet1"].iter_rows(min_row=10, values_only=True):
    if not r[1] or not str(r[1]).startswith("TSK"):
        continue
    add_task(r[1], r[2], person_of(r[3]), r[4], r[5], r[6], day(r[7]), day(r[8]), r[9], r[10], r[11], r[12], r[14])

for sheet in wt.sheetnames:
    if sheet.strip().lower() in ("praveen", "nagulan"):
        for i, r in enumerate(wt[sheet].iter_rows(min_row=2, values_only=True), 1):
            if r[1]:
                add_task(f"{sheet.strip()}-{i}", r[1], person_of(r[2]), r[3], r[4], r[5], day(r[6]), day(r[7]), r[8], r[9], None, None, None)

# -- Daily plans and EOD notes (the "Work" sheet) -----------------------------------
# Its dates say 2025 but the entries are the 2026 tasks word for word (e.g. the
# array-methods task is TSK-122 on 2026-10-15), so the year is corrected.
last = None
for r in wb["Work"].iter_rows(min_row=3, values_only=True):
    if r[0] is not None:
        last = day(r[0])
    who = person_of(r[5])
    if not who or last is None or (not r[1] and not r[6]):
        continue
    date = last.replace(year=2026) if last.year == 2025 else last
    if date > TODAY:
        continue
    if clean(r[1]):
        out["reports"].append({"person": who, "date": date.isoformat(), "kind": "morning", "plan": clean(r[1])})
    if clean(r[6]):
        out["reports"].append({"person": who, "date": date.isoformat(), "kind": "eod", "completed": clean(r[6])})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(f"attendance {len(out['attendance'])}, tasks {len(out['tasks'])}, reports {len(out['reports'])}, skipped {len(out['skipped'])}")
for s in out["skipped"]:
    print("  skipped:", s)
