# Deployment – Homework Management System

> Trạng thái: file triển khai đã có đủ (Dockerfile, docker-compose, Nginx, script). **Chưa triển khai lên Internet** vì môi trường phát triển không có Docker daemon, không có quyền truy cập dịch vụ hosting/tunnel, và chưa có thông tin hosting từ chủ dự án (xem §8).

## 1. Kiến trúc triển khai

```
Internet ──HTTPS──▶ Nginx (80/443, duy nhất được mở)
                     ├─ /api/*  ──▶ api  (NestJS, cổng 4000, không publish)
                     └─ /*      ──▶ web  (Next.js standalone, cổng 3000, không publish)
                                     api ──▶ postgres (16, volume pgdata, không publish)
                                     api ──▶ storage (volume uploads) hoặc S3-compatible bucket private
```

- PostgreSQL, API và web **không** mở cổng ra host; chỉ Nginx nhận traffic.
- Ba role DB: `hms_owner` (migration), `hms_app` (runtime, chịu RLS), `hms_system` (platform/scheduler). Container Postgres tự tạo role khi khởi tạo lần đầu (`docker/postgres/init-roles.sh`).
- Không cần Redis ở MVP (scheduler chạy trong API, an toàn khi nhiều instance – xem IMPLEMENTATION-ROADMAP §3).

## 2. Thành phần đã chuẩn bị

| File | Vai trò |
|---|---|
| `apps/api/Dockerfile` | Image API (node:22-bookworm-slim, Prisma, chạy user `node`, healthcheck) |
| `apps/web/Dockerfile` | Image web (Next.js standalone, user `node`) |
| `docker-compose.yml` | `postgres`, `api`, `web`, `nginx` + công cụ `migrate`, `seed` (profile `tools`) |
| `docker/nginx/*.conf` | Reverse proxy, giới hạn tần suất, header bảo mật, khối HTTPS mẫu |
| `docker/postgres/init-roles.sh` + `scripts/sql/roles.sql` | Tạo role và database |
| `.env.docker.example` | Biến môi trường cho compose |
| `scripts/deploy-staging.sh` | Build → migrate → (seed) → start, idempotent |
| `scripts/db-setup.sh` | Thiết lập DB khi không dùng Docker (PostgreSQL có sẵn) |

Đã kiểm chứng trong môi trường phát triển: `docker compose config` hợp lệ; bản Next.js standalone chạy độc lập và proxy sang API; API build và chạy với role `hms_app` (từ chối khởi động nếu role có BYPASSRLS/superuser). **Chưa build được image Docker** ở đây (không có daemon).

## 3. Triển khai staging trên một VPS (khuyến nghị)

Yêu cầu: VPS Linux 2 vCPU / 4 GB RAM, Docker Engine + Compose plugin, domain trỏ về IP VPS.

```bash
git clone https://github.com/tamcb2708/homework-management-system.git && cd homework-management-system
cp .env.docker.example .env.docker      # điền mọi giá trị (openssl rand -hex 32 cho secret)
SEED_DEMO=1 ./scripts/deploy-staging.sh  # build, migrate, seed demo, start
```

HTTPS:
1. Lấy chứng chỉ (ví dụ certbot standalone hoặc DNS-01) vào `docker/nginx/certs/fullchain.pem` + `privkey.pem`.
2. Bỏ comment khối `listen 443` và dòng `return 301` trong `docker/nginx/nginx.conf`.
3. Đặt `APP_ORIGINS=https://<domain>` và `COOKIE_SECURE=true` trong `.env.docker`, rồi `docker compose --env-file .env.docker up -d`.

Cập nhật phiên bản: `git pull && ./scripts/deploy-staging.sh` (migration chạy trước khi khởi động API mới).

## 4. Phương án PaaS (Render / Railway / Fly.io)

| Thành phần | Cấu hình |
|---|---|
| API | Docker service từ `apps/api/Dockerfile`, health check `/api/health/ready`, chạy `npx prisma migrate deploy` (với `DATABASE_URL=$MIGRATION_DATABASE_URL`) làm pre-deploy command |
| Web | Docker service từ `apps/web/Dockerfile`, biến `API_INTERNAL_URL` = URL nội bộ của API |
| PostgreSQL | Managed PostgreSQL 16. Chạy `scripts/sql/roles.sql` bằng tài khoản admin (policy `system_access` không cần BYPASSRLS nên chạy được trên managed DB) |
| File | S3-compatible private bucket (Cloudflare R2, Backblaze B2, AWS S3) – `STORAGE_DRIVER=s3` |
| Domain | Web và API phải cùng origin: định tuyến `/api/*` sang API ở tầng proxy của nền tảng, hoặc để web proxy (route `src/app/api/[...path]`) |

Lưu ý: khi không có Nginx phía trước, rate limit theo IP của API sẽ thấy IP của proxy web; nên bật định tuyến `/api` trực tiếp ở tầng edge.

## 5. Biến môi trường

### API (`apps/api/.env.example`)

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `NODE_ENV` | ✔ | `production` trên staging/production |
| `PORT` | | Mặc định 4000 |
| `APP_ORIGINS` | ✔ | Origin hợp lệ của trình duyệt (phân cách dấu phẩy) – kiểm tra Origin cho request ghi |
| `COOKIE_SECURE` | ✔ | `true` khi HTTPS → cookie `Secure` + tiền tố `__Host-` |
| `DATABASE_URL` | ✔ | Kết nối role `hms_app` |
| `DATABASE_SYSTEM_URL` | ✔ | Kết nối role `hms_system` |
| `MIGRATION_DATABASE_URL` | ✔ (deploy) | Kết nối role `hms_owner` – chỉ dùng khi migrate |
| `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `CSRF_SECRET` | ✔ | ≥ 32 ký tự, khác nhau; API từ chối khởi động nếu còn giá trị mẫu |
| `STORAGE_DRIVER` | | `local` (mặc định) hoặc `s3` |
| `STORAGE_LOCAL_DIR` | | Thư mục lưu file riêng tư (driver local) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | khi `s3` | Bucket **private** |
| `AI_PROVIDER` | | Luôn `disabled` cho tới khi có phê duyệt D11 (`fake` bị cấm ở production) |
| `AI_GRADING_MODEL` | | Dành cho sau phê duyệt |
| `LOGIN_RATE_LIMIT` | | Số lần đăng nhập/phút/IP (mặc định 30) |
| `SCHEDULER_ENABLED` | | Mặc định `true` |
| `AUTH_BEARER_ENABLED` | | Mặc định `false` (D2.3) |
| `DEMO_PASSWORD_*` | staging | Mật khẩu tài khoản demo khi seed |

### Web

| Biến | Mô tả |
|---|---|
| `API_INTERNAL_URL` | URL nội bộ của API cho proxy runtime (mặc định `http://localhost:4000`) |
| `PORT`, `HOSTNAME` | Cổng/địa chỉ lắng nghe (image: 3000, 0.0.0.0) |

## 6. Migration và dữ liệu demo

```bash
# Không dùng Docker (PostgreSQL có sẵn):
cp apps/api/.env.example apps/api/.env   # điền giá trị
pnpm install && pnpm -r build
bash scripts/db-setup.sh                 # tạo role + database + migrate (cần ADMIN_DATABASE_URL hoặc quyền user postgres)
cd apps/api && set -a && . ./.env && set +a && node dist/scripts/seed-demo.js
# Platform Admin thật (không dùng cho demo):
PLATFORM_ADMIN_EMAIL=ops@truong.vn PLATFORM_ADMIN_PASSWORD='...' node dist/scripts/create-platform-admin.js
```

Seed chạy lại an toàn (kiểm tra theo khóa duy nhất trước khi tạo); từ chối chạy khi `NODE_ENV=production` trừ khi đặt `ALLOW_DEMO_SEED=true` (chỉ dùng cho staging).

## 7. Vận hành

| Hạng mục | Cách làm |
|---|---|
| Health | `GET /api/health/live`, `GET /api/health/ready` (DB) |
| Log | JSON (pino) trên stdout, có `requestId`; cookie/Authorization/CSRF được loại khỏi log |
| Backup | `docker compose exec postgres pg_dump -U postgres -Fc hms > hms-$(date +%F).dump` (hằng ngày, lưu ngoài máy) + sao lưu volume `uploads` hoặc bucket |
| Khôi phục | `pg_restore -U postgres -d hms --clean hms-YYYY-MM-DD.dump` rồi khởi động lại API |
| Rollback | Triển khai lại commit trước; migration chỉ thêm (không xóa cột) nên tương thích lùi một phiên bản |

## 8. Điều kiện để có URL staging công khai

Môi trường phát triển hiện tại **không thể** tạo URL công khai: không có Docker daemon, và proxy mạng từ chối kết nối tới các dịch vụ tunnel/hosting (Cloudflare Tunnel, ngrok, localhost.run, Railway, Render). Để triển khai cần **một** trong các lựa chọn:

1. **VPS** (khuyến nghị): địa chỉ IP + quyền SSH (hoặc chủ dự án tự chạy `scripts/deploy-staging.sh`) + một domain/subdomain.
2. **Tài khoản PaaS** (Render/Railway/Fly.io) có gói phù hợp + API token, kèm phê duyệt chi phí nếu có.
3. Cho phép môi trường phát triển kết nối tới dịch vụ tunnel (ví dụ thêm host của Cloudflare Tunnel vào allowlist mạng) để tạo **URL tạm thời** từ bản đang chạy ở đây.

## 9. Render + Neon (gói miễn phí)

Một web service trên Render chạy cả API và web trong cùng container (`Dockerfile.render`, entrypoint `scripts/render-start.sh`); cơ sở dữ liệu là một project PostgreSQL miễn phí trên Neon. Cấu hình nằm trong `render.yaml` (Blueprint).

### 9.1 Neon
1. Tạo tài khoản tại neon.tech → **New project**, region **AWS Asia Pacific (Singapore)**, PostgreSQL 16 hoặc 17.
2. **Connect** → tắt **Connection pooling** → sao chép connection string của role `neondb_owner` (dạng `postgresql://neondb_owner:...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`).

### 9.2 Render
1. Tạo tài khoản tại render.com (đăng nhập bằng GitHub) → **New → Blueprint** → chọn repository này, nhánh chứa `render.yaml`.
2. Render hỏi các giá trị `sync: false`:
   - `ADMIN_DATABASE_URL` = connection string Neon ở trên.
   - `DEMO_PASSWORD_PLATFORM / ADMIN / TEACHER / STUDENT` = mật khẩu tài khoản demo (≥ 12 ký tự, tự đặt).
3. **Apply**. Lần build đầu mất khoảng 5–10 phút. Các secret còn lại (`JWT_SECRET`, mật khẩu role DB…) do Render tự sinh.
4. URL: `https://homework-management.onrender.com` (Render thêm hậu tố nếu tên đã có người dùng). `APP_ORIGINS` tự lấy từ `RENDER_EXTERNAL_URL`.

### 9.3 Mỗi lần khởi động container
`render-start.sh` tạo/đồng bộ ba role DB (`scripts/sql/roles.sql`, chạy được với admin không phải superuser như `neondb_owner`), chạy migration bằng `hms_owner`, seed demo nếu `SEED_DEMO=true` (idempotent), rồi chạy API ở `127.0.0.1:4000` và web ở `$PORT`. Đã kiểm chứng trên cụm PostgreSQL 16 với admin chỉ có `CREATEROLE CREATEDB`, chạy lại lần hai và khi mật khẩu role đổi.

### 9.4 Giới hạn của gói miễn phí
| Hạng mục | Ảnh hưởng |
|---|---|
| Render free ngủ sau 15 phút không có truy cập | Lần mở đầu tiên sau đó chờ khoảng 30–60 giây |
| Ổ đĩa Render free là tạm thời | Tệp tải lên (đính kèm, bài nộp dạng tệp) mất khi deploy lại hoặc khi service khởi động lại. Dùng lâu dài: đặt `STORAGE_DRIVER=s3` với bucket private |
| Neon free tự tạm dừng compute khi rảnh | Truy vấn đầu tiên chậm thêm vài giây (`connect_timeout=30` đã được đặt) |
| Rate limit đăng nhập theo IP | API thấy IP thật của người dùng qua `X-Forwarded-For` do Render thêm vào |
