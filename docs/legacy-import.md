# Importing the old Excel records

Before the CRM had attendance, tasks and daily reports, the team kept them in
two workbooks: `Employee_Attendance_Management_System.xlsx` and
`Task management and Attendance Management.xlsx`. `scripts/legacy/` brings
**Praveen's and Nagulan's** history across. **Hari is left out entirely**:
his rows are skipped, and mentions of him in other people's notes are removed.

## What is taken, and what isn't

| Source | Becomes | Notes |
|---|---|---|
| Attendance workbook → *Daily Attendance Register* | Attendance days | Check-in/out times, status (P, A, HD, WO, Holiday, SL…), remarks. The `SAMPLE` rows, days after the run date and empty pre-filled rows are skipped. A duplicated row (Praveen, 18 Nov) is taken once. Text in a time cell ("Client Visit") becomes a remark. |
| Task workbook → *Sheet1*, *Praveen*, *Nagulan* | Tasks (no project) | Title, full description plus the sheet's notes, workstream, priority, status, due date, allocated/actual hours, start/finish times. Empty placeholder rows (no description) are skipped. Each task keeps its old reference, e.g. `TSK-114`. |
| Attendance workbook → *Work* | Daily reports | "Task observation" → morning plan; "EOD TASK" → end-of-day report. Its dates say 2025 but match the 2026 tasks word for word, so they are read as 2026. |
| Task workbook → *Sheet2* | Nothing | Template filler (Sundays marked present, future dates). The register is the real record. |

## Running it

```bash
# 1. Excel -> JSON (keep the JSON out of git; delete it afterwards)
python -I scripts/legacy/extract.py <attendance.xlsx> <tasks.xlsx> legacy.json 2026-11-23

# 2. Dry run, then apply. Test project first, always.
node --env-file=.env.test.local scripts/legacy/import.mjs legacy.json
node --env-file=.env.test.local scripts/legacy/import.mjs legacy.json --apply
```

On production, run step 2 on the server from the app folder with
`--env-file=.env.local` (it prints the database project first). The import
only adds rows. Re-running it adds nothing new: existing days and reports are
left alone, and tasks are matched on their old reference.
