# Homework Management System

Nền tảng SaaS multi-tenant quản lý bài tập cho trường học: giáo viên tạo và giao bài, học sinh làm, lưu nháp và nộp bài trực tuyến, hệ thống chấm tự động phần trắc nghiệm, giáo viên chấm theo rubric, nhận xét và công bố điểm. AI hỗ trợ chấm được thiết kế sẵn nhưng **tắt** cho tới khi có phê duyệt (D11).

## Cấu trúc

```
apps/api     NestJS + Prisma (REST, Swagger /api/docs)
apps/web     Next.js (giao diện 4 vai trò)
e2e          Playwright (workflow A/B/C)
docker       Nginx, khởi tạo PostgreSQL
scripts      db-setup, deploy-staging, sinh tài liệu API
docs         Phân tích, thiết kế, triển khai, bàn giao
```

## Chạy nhanh (PostgreSQL 16 có sẵn)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # điền mật khẩu DB, secret
bash scripts/db-setup.sh                    # role + database + migration
pnpm -r build
cd apps/api && set -a && . ./.env && set +a && node dist/scripts/seed-demo.js && node dist/main.js
# terminal khác:
cd apps/web && API_INTERNAL_URL=http://localhost:4000 npx next start -p 3000
```

Mở http://localhost:3000 – mã trường `demo`. Tài khoản demo: xem `docs/FINAL-DELIVERY.md` §12 (mật khẩu ở `.demo-credentials.local`, không commit).

## Kiểm thử

```bash
pnpm typecheck && pnpm lint
cd apps/api && npx jest                     # unit + integration (PostgreSQL thật)
npx playwright test -c e2e/playwright.config.ts
```

## Triển khai

Docker Compose + Nginx: `docs/deployment.md`.

## Tài liệu

[docs/README.md](docs/README.md) · Bàn giao: [docs/FINAL-DELIVERY.md](docs/FINAL-DELIVERY.md) · Hướng dẫn sử dụng: [docs/user-guide.md](docs/user-guide.md)
