# Lumin Seed Assets

Thu muc nay chua cac file minh chung demo duoc `backend/app/seed/run.py`
upload len S3/R2 khi chay seed.

- `qualification-evidence/`: minh chung bang cap/chung chi gia su.
- Neu cau hinh S3/R2 day du, seed se upload cac file nay vao bucket theo key
  `certificates/seed/tutor-{id}/{filename}` va luu public URL vao DB.
- Neu chua cau hinh S3/R2, seed van chay va luu mock path dang
  `/seed/qualification-evidence/{filename}` de phuc vu local dev.

Tat ca file trong thu muc nay la du lieu gia lap, khong phai tai lieu that.
