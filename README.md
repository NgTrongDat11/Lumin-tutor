# Lumin Tutor Recommendation

Lumin là hệ thống kết nối học viên với gia sư/lớp học, gồm luồng học 1-1, lớp nhóm, lịch học, thanh toán, đánh giá và gợi ý kết hợp.

## Cấu trúc repo

- `backend/`: FastAPI, SQLAlchemy, Alembic và test backend.
- `frontend/`: React, TypeScript và Vite.
- `docs/`: tài liệu nghiệp vụ, kiến trúc và hướng dẫn kiểm thử.
- `seed/`: dữ liệu demo và minh chứng mẫu.
- `schema.sql`, `schema-powerdesigner.sql`: schema phục vụ triển khai và mô hình hóa.
- `docker-compose.yml`: PostgreSQL local.

Xem mục lục tài liệu tại [docs/README.md](docs/README.md).

## Chạy local

Khởi động PostgreSQL:

```powershell
docker compose up -d
```

Backend:

```powershell
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Health check backend: `GET /api/v1/health`.

## Kiểm tra

```powershell
cd backend
$env:PYTHONPATH = "."
uv run pytest

cd ../frontend
npm run build
```

File lịch sử, snapshot và source tham khảo cục bộ được gom trong `archived/`; thư mục này không tham gia runtime và được Git bỏ qua.
