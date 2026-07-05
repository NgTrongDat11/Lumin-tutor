# Canonical demo seed

`demo_v2.py` is the only canonical demo dataset. The current dataset is v3, centered on Vĩnh Long, Cần Thơ, and nearby Mekong locations. It keeps payment, contract,
class registration, and tutor-income records consistent.

Use these commands from `backend/`:

```powershell
$env:LUMIN_RESET_DEMO_CONFIRM = "RESET_LUMIN_DEMO"
$env:LUMIN_RESET_DEMO_SKIP_BACKUP = "1"  # optional for disposable local/test data
uv run python -m app.seed.reset_demo
```

By default the command creates a JSON backup in `backend/.backups/`, truncates application
tables only, creates demo data v3, then validates record counts, Mekong-region locations, and finance
allocation totals. It does not alter the schema, Alembic history, or Supabase
Storage objects.

Main finance scenarios:

- Private IELTS: successful payment, 30/70 split.
- Private Math: partial refund, 50/50 split.
- Group Math and English: successful payments with class contracts.
- Private Physics and group IELTS: pending payments, deliberately not included
  in revenue allocation until payment is confirmed.
