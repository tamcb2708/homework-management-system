#!/usr/bin/env python3
"""Generates docs/api-specification.md from the running API's OpenAPI document.
Usage: python3 scripts/gen-api-spec.py http://localhost:4000/api/docs-json > docs/api-specification.md"""
import json, sys, urllib.request

src = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000/api/docs-json'
d = json.load(open(src)) if not src.startswith('http') else json.load(urllib.request.urlopen(src))
tags = {}
for path, ops in d['paths'].items():
    for method, op in ops.items():
        t = (op.get('tags') or ['other'])[0]
        tags.setdefault(t, []).append((method.upper(), path, (op.get('summary') or op.get('description') or '').split('\n')[0]))
schemas = d.get('components', {}).get('schemas', {})
out = ["# API Specification – Homework Management System", "",
"> **Sinh tự động** từ OpenAPI của API đang chạy (`GET /api/docs-json`) bằng `scripts/gen-api-spec.py`, nên khớp với code. Swagger UI tương tác: `/api/docs`.", "",
"## 1. Quy ước chung", "",
"| Hạng mục | Quy ước |", "|---|---|",
"| Base path | `/api` (cùng origin với web; Nginx hoặc proxy runtime của web chuyển tiếp) |",
"| Định dạng | JSON (UTF-8); upload dùng `multipart/form-data` |",
"| Xác thực | Cookie httpOnly: realm trường `hms_at`/`hms_rt`, realm nền tảng `hmsp_at`/`hmsp_rt` (tiền tố `__Host-` khi `COOKIE_SECURE=true`) |",
"| CSRF | Mọi `POST/PUT/PATCH/DELETE` sau đăng nhập phải có header `X-CSRF-Token` = giá trị cookie `hms_csrf` (hoặc `hmsp_csrf`); header `Origin` (nếu có) phải thuộc `APP_ORIGINS` |",
"| Tenant | Xác định từ token đã ký (claim `tid`) – client không gửi `tenant_id` |",
"| Idempotency | `POST /api/student/submissions/{id}/submit` bắt buộc header `Idempotency-Key` (8–100 ký tự) |",
"| Lỗi | `{ \"error\": { \"code\", \"message\", \"details\"?, \"requestId\" } }` – 400 dữ liệu sai, 401 chưa đăng nhập/phiên hết hạn, 403 thiếu quyền hoặc CSRF, 404 không tồn tại **hoặc ngoài phạm vi** (không lộ sự tồn tại), 409 xung đột trạng thái, 410 bài đã thu hồi, 422 vi phạm nghiệp vụ, 429 giới hạn tần suất |",
"| Phân trang | `?page=&pageSize=` (tối đa 100); response `{ total, page, pageSize, items }` |",
"| Thời gian | ISO 8601 UTC; giao diện hiển thị theo `Asia/Ho_Chi_Minh` |", "",
f"## 2. Danh sách endpoint ({sum(len(v) for v in tags.values())})", ""]
for t in sorted(tags):
    out += [f"### {t}", "", "| Method | Path | Mô tả |", "|---|---|---|"]
    for m, p, s in sorted(tags[t], key=lambda x: (x[1], x[0])):
        out.append(f"| `{m}` | `{p}` | {s.replace('|', '/')} |")
    out.append("")
out += ["## 3. Schema request (DTO)", "", "Trường bắt buộc được **in đậm**. Mọi trường không khai báo đều bị từ chối (`whitelist` + `forbidNonWhitelisted`).", ""]
def typ(v):
    if '$ref' in v: return v['$ref'].split('/')[-1]
    t = v.get('type', 'object')
    if t == 'array': return typ(v.get('items') or {}) + '[]'
    if 'enum' in v: return t + ' ∈ {' + ', '.join(map(str, v['enum'])) + '}'
    return t
for name in sorted(schemas):
    sc = schemas[name]; req = set(sc.get('required', []))
    props = sc.get('properties', {})
    if not props: continue
    out.append(f"- **{name}** – " + ', '.join(f"{'**'+k+'**' if k in req else k}: `{typ(v)}`" for k, v in props.items()))
print('\n'.join(out))
