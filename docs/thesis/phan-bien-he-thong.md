# Tài liệu phản biện hệ thống — TastyVietnam Platform

> **Mục đích:** Giúp bạn hiểu tường tận hệ thống để tự tin đối đáp mọi câu hỏi phản biện.
> **Gu của thầy:** ít quan tâm kỹ năng code thuần; xoáy vào (1) đóng góp nghiệp vụ, (2) mở rộng/điều độ/cân bằng tải khi user tăng, (3) bảo mật web, (4) hướng phát triển tương lai, (5) đối phó sự cố (bị tấn công xâm nhập, mất điện…), (6) kiểm thử phi chức năng. Thầy sẽ **xoáy sâu thêm** sau mỗi câu.
>
> **Nguyên tắc vàng khi trả lời:** luôn phân biệt rõ **"đã làm thật trong code"** vs **"hướng phát triển"**. Thầy sẽ bắt bài nếu bạn nói quá. Chủ động thừa nhận giới hạn + nêu lộ trình khắc phục = ăn điểm. Mọi luận điểm trong tài liệu này đều kèm **file/dòng/commit thật** để bạn "chứng minh được".
>
> **⚑ Cập nhật quan trọng (hệ thống HIỆN TẠI):**
> 1. **Đã DEPLOY thật lên cloud managed** (không còn chỉ localhost): Frontend **Vercel**, Backend **Render**, AI **Hugging Face Space**, DB + Object Storage **Supabase**, Redis **Upstash**. AI chạy qua HTTP (`AI_BACKEND=http`), có token bảo vệ. → Có thể nói "em đã deploy end-to-end", có URL thật.
> 2. **Đã có số liệu load-test trên cloud thật** (không còn là "hướng phát triển"): ngưỡng an toàn ~15 người đồng thời, p50 ~0,7s, p95 ~1,9s, 0% lỗi; quá 15 thì lỗi do trần kết nối Supabase gói free — xem **B3/E1**.
> 3. **ĐÃ BỎ fallback OpenAI Vision.** Khi model không đủ tin cậy → báo thẳng "không nhận diện được" (không gọi bên thứ 3). Các câu liên quan (Luồng A, D4, F3) đã cập nhật.

---

# PHẦN 1 — HIỂU TƯỜNG TẬN HỆ THỐNG

## 1.1. Bức tranh nghiệp vụ — bài toán thật là gì?

**Bài toán:** Người Việt nấu ăn hằng ngày thường (a) không biết món trong ảnh/trên bàn là món gì và nấu thế nào, (b) bơi trong biển công thức chất lượng lẫn lộn trên mạng, (c) khó lên kế hoạch bữa ăn cả tuần + đi chợ.

**Dữ liệu gốc:** ~22.000 công thức crawl từ Cookpad (`source=cookpad`, đã import vào DB, `scripts/import_recipes.py`). Đây là **UGC thô**: trùng lặp, thiếu khẩu phần, chất lượng không đều.

**Đóng góp nghiệp vụ cốt lõi — "trục canonical" (điểm khác biệt lớn nhất):**
Thay vì để user bơi trong 22k công thức lộn xộn, hệ thống xây một **trục xương sống 103 món chuẩn Việt Nam** (canonical dishes), mỗi món có công thức chuẩn được kiểm duyệt. Cả 3 tính năng lớn đều bám trục này:

- **AI ⊆ Lookup (bất biến quan trọng):** Mọi lớp AI nhận diện được **đều** trỏ về một canonical dish có thật trong DB — enforce ở code, không phải lời hứa. `ai_service._find_canonical_for_class(slug)` query `canonical_dish_slug == slug AND is_canonical` → trả recipe có `id` thật; frontend link thẳng `/recipes/<id>`. Đã verify **103/103 lớp AI resolve, 0 đứt link**. → Câu chuyện mạch lạc: "AI nhận diện được món nào thì chắc chắn tra cứu được công thức món đó."
- **Taxonomy 6 hạng mục** (Vùng miền / Dịp nấu / Loại món / Chế độ ăn / Nguyên liệu / Cách nấu) crawl từ monngonmoingay.com, tag lên canonical → filter đúng chuẩn ẩm thực Việt, không tự bịa.

**Ba nhóm tính năng nghiệp vụ:**
1. **AI nhận diện món ăn → gợi ý công thức:** chụp/upload ảnh → model phân loại → hiện công thức chuẩn + gợi ý liên quan.
2. **Meal-plan + grocery list:** lên lịch bữa ăn theo ngày, sinh danh sách đi chợ.
3. **Cộng đồng có kiểm duyệt:** user đăng công thức → pipeline duyệt (admin) → rating/comment/save. UGC lên sóng nhưng **được gác cổng**, không loãng như forum.

**Vì sao khác các công cụ có sẵn (Cookpad, Google Lens):** Cookpad không nhận diện ảnh→công thức Việt; Google Lens nhận diện chung chung không gắn công thức chuẩn tiếng Việt + không có meal-plan. Điểm bán hàng = **AI chuyên biệt món Việt + trục canonical + trọn vòng đời "thấy món → biết công thức → lên lịch → đi chợ".**

---

## 1.2. Kiến trúc tổng thể

```
                    ┌─────────────────────────────────────────────┐
   Trình duyệt ───▶ │  FRONTEND — Next.js 16 (App Router) :3000    │
                    │  React 19 · TS · Tailwind v4 · shadcn/ui     │
                    │  proxy.ts gác route cần auth (JWT ở cookie)  │
                    └───────────────┬─────────────────────────────┘
                                    │  HTTPS/REST  /api/v1/*
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  BACKEND — FastAPI (async) :8000             │
                    │  ├─ api/v1/*  (router: recipes, auth, ai…)   │
                    │  ├─ services/* (business logic)              │
                    │  ├─ core/ (config, security, deps, rate_limit│
                    │  │         database pool, exceptions)         │
                    │  └─ ai/ (factory → local | http predictor)   │
                    └───┬───────────────┬───────────────┬──────────┘
                        │               │               │
              ┌─────────▼───┐  ┌────────▼───────┐  ┌────▼──────────────┐
              │ PostgreSQL  │  │ Object storage │  │ AI inference      │
              │ 16 (Docker) │  │ local | S3/R2  │  │ local (in-proc)   │
              │ :5432       │  │ (pluggable)    │  │  | http (HF Space)│
              └─────────────┘  └────────────────┘  └──────────────────┘

   AI không đủ tin cậy (nhóm <0.5 hoặc món <0.6) → báo "không nhận diện
   được" (ĐÃ BỎ fallback OpenAI Vision — xem F3).
```

**Triển khai production HIỆN TẠI (managed cloud):** cùng codebase, chỉ bật toggle env:

| Thành phần | Chạy trên | Ghi chú |
|---|---|---|
| Frontend | **Vercel** (edge/CDN) | build từ nhánh `feat/scalability` |
| Backend FastAPI | **Render** (Starter, có LB nội bộ) | `AI_BACKEND=http`, `STORAGE_BACKEND=s3`, Redis + CORS qua env |
| AI inference | **Hugging Face Space** (Docker, torch-CPU) | endpoint `/predict` + `/health`, token bảo vệ (`API_TOKEN`) |
| PostgreSQL + Object Storage | **Supabase** | 25.375 recipe, 103/103 lớp; bucket `uploads` public |
| Redis (rate-limit) | **Upstash** | `rediss://` chia sẻ counter |

> Điểm mạnh để nói: "Thiết kế scale-ready **không chỉ trên giấy** — em đã deploy thật, mỗi rào cản (state/file/model/counter) đều được gỡ bằng đúng toggle đã chuẩn bị: ảnh → Supabase Storage, AI → HF, rate-limit → Upstash, DB → Supabase pooler."

**Các tầng & công nghệ (bảng tra nhanh):**

| Tầng | Công nghệ | Vì sao |
|---|---|---|
| Frontend | Next.js 16 App Router, React 19, TS, Tailwind v4, shadcn/ui | SSR/streaming, SEO, DX tốt |
| Backend | FastAPI (Python 3.11), async, asyncpg | I/O non-blocking, hợp AI ecosystem Python |
| DB | PostgreSQL 16 (Docker) | ACID, full-text search (`tsvector`), ARRAY, JSONB |
| Auth | JWT tự handle (python-jose), bcrypt | **Stateless** → scale ngang không cần session store |
| Storage | Local disk **hoặc** S3/R2 (toggle) | Pluggable — chuyển cloud không sửa business logic |
| AI | PyTorch EfficientNet 2 tầng, **hoặc** service HTTP | Tách được microservice để scale độc lập |
| AI fail-safe | Báo "không nhận diện được" (**đã bỏ** OpenAI fallback) | Không đoán bừa, không phụ thuộc bên thứ 3 |
| Rate-limit | slowapi, in-memory **hoặc** Redis (toggle) | Chống brute-force; Redis để chia sẻ counter đa-instance |

**Điểm mấu chốt cho câu hỏi scale:** 4 điểm "biết co giãn" đều làm theo **cùng một khuôn: adapter + toggle bằng biến môi trường**, mặc định `local` để dev không đổi hành vi, bật `cloud/http/redis` khi cần scale:
- DB pool cấu hình được — `config.py:39-41` (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_RECYCLE_SECONDS`)
- Rate-limit storage — `config.py:34` (`RATE_LIMIT_STORAGE_URI`, để trống=in-memory, đặt Redis URI=shared)
- Object storage — `config.py:46-52` (`STORAGE_BACKEND=local|s3` + cấu hình S3/R2)
- AI backend — `config.py:26-29` (`AI_BACKEND=local|http` + `AI_SERVICE_URL/TOKEN/TIMEOUT`)

---

## 1.3. Các luồng chính

### Luồng A — AI nhận diện ảnh → công thức
1. User chụp (`CameraCapture.tsx`) hoặc upload/dán URL ảnh → `POST /api/v1/ai/recognize`.
2. `ai_service.recognize_image(db, predictor, image_bytes)`:
   - `predictor.predict(pil_image) -> dict` — **2 tầng phân cấp**: EfficientNet-B0 phân **nhóm** (BANH/BUN_PHO/COM…) ở 224×224 → nếu đủ tự tin (≥0.5) thì EfficientNet-B2 phân **món cụ thể** trong nhóm ở 260×260 (`ai/inference.py`).
   - Trả `top5`, `predicted_class`, `class_confidence`, và cờ `needs_fallback`.
3. Nếu `needs_fallback=True` (nhóm <0.5 hoặc món <0.6) → **báo "không nhận diện được"** (fail-safe, không đoán bừa). *Trước đây gọi OpenAI Vision — đã bỏ để không phụ thuộc bên thứ 3, xem F3.*
4. `dish_resolver.resolve_vnfood` → tìm canonical dish → build công thức chuẩn inline + gợi ý recipe liên quan → ghi `ai_logs`.
5. Frontend `RecognitionResult` hiện overview (57 món đa biến thể có thẻ "Giới thiệu món") + link `/recipes/<id>`.

> **Tách bạch quan trọng:** phần *suy luận model* (predict) tách khỏi phần *resolve DB* (gợi ý recipe). Đây chính là lý do có thể đẩy model ra service HTTP riêng mà không đụng logic nghiệp vụ — xem Nhóm B & F.

### Luồng B — Pipeline duyệt công thức (state machine)
`private` → (user gửi duyệt) → `pending_admin` → admin **publish** (`approved`, lên browse) **hoặc** **admin-reject** (`rejected`). Sửa công thức đã duyệt → quay lại chờ duyệt. Enforce server-side ở `recipe_service.py`, mỗi transition có `_assert_status` (trả 409 nếu sai tầng). → Trả lời được câu "làm sao đảm bảo chất lượng nội dung cộng đồng".

### Luồng C — Auth / sliding session
Login → cấp `access_token` (ngắn hạn) + `refresh_token`. `/auth/refresh` trả **cả access + refresh mới** (sliding session). Frontend `SessionKeepAlive` chủ động refresh trước hạn; interceptor `api.ts` bắt 401 → single-flight refresh → retry, chỉ logout khi thật sự hết phiên (`isSessionDead`). JWT gắn field `type` chống dùng nhầm access↔refresh.

---

## 1.4. Quyết định thiết kế & đánh đổi (thầy hay hỏi "vì sao chọn X")

| Quyết định | Vì sao | Đánh đổi / giới hạn |
|---|---|---|
| **JWT stateless** thay vì server session | Scale ngang không cần sticky session / session store chung | Khó thu hồi token tức thì (giảm nhẹ: TTL ngắn + refresh) |
| **Trục canonical + AI⊆Lookup** | Câu chuyện mạch lạc, không loãng | Công sức curate 103 món + tag taxonomy |
| **Adapter + toggle** cho 4 điểm scale | Dev đơn giản (local), prod bật cloud, blast radius nhỏ | Có code cho cả 2 nhánh (phức tạp hơn 1 chút) |
| **AI 2 tầng phân cấp** (nhóm→món) | Chia bài toán 103 lớp khó thành nhiều bài dễ hơn; mỗi sub-model chỉ lo ~10-30 lớp | Lỗi tầng nhóm lan xuống tầng món |
| **Fail-safe "không nhận diện được"** (đã bỏ OpenAI fallback) | Không "bịa" khi model không chắc, **không phụ thuộc bên thứ 3** | ~14% ca khó không có gợi ý (đánh đổi để tự chủ) |
| **PostgreSQL managed (Supabase)** | ACID mạnh, backup/PITR sẵn, pooler cho serverless | Gói free giới hạn ~15 kết nối đồng thời (thấy ở load-test) |
| **Monorepo, chưa CI/CD** | Tập trung làm tính năng trước | Kiểm thử/triển khai còn thủ công — hướng phát triển |

---

# PHẦN 2 — PHỤ LỤC Q&A

> Định dạng mỗi câu: **🎓 Câu thầy có thể hỏi** → **💬 Trả lời mẫu (có dẫn chứng)** → **🔍 Câu xoáy sâu + đáp**.

---

## NHÓM A — ĐÓNG GÓP NGHIỆP VỤ

### A1. 🎓 "Hệ thống của em giải quyết vấn đề gì mà các công cụ có sẵn chưa làm được?"
💬 Ba điểm: (1) **AI nhận diện món Việt chuyên biệt** — Google Lens/Cookpad không nhận diện món Việt rồi gắn thẳng công thức chuẩn tiếng Việt. (2) **Trục canonical 103 món + bất biến AI⊆Lookup** — nhận diện được món nào thì chắc chắn có công thức món đó, không dẫn tới ngõ cụt. (3) **Trọn vòng đời**: thấy món → biết công thức → lên meal-plan → sinh grocery list. Không công cụ đơn lẻ nào gộp cả ba.

🔍 *"AI⊆Lookup là em nói hay có enforce thật?"* → Enforce ở code: `_find_canonical_for_class` query theo `canonical_dish_slug`, verify 103/103 lớp resolve, 0 đứt link. Nếu thêm lớp AI mới mà chưa có canonical → link sẽ hụt, nên đây là ràng buộc dữ liệu chặt, không phải lời hứa suông.

### A2. 🎓 "Vì sao cần 22k công thức nếu chỉ dùng 103 món chuẩn?"
💬 22k là **kho tra cứu rộng** (browse/search full-text) cho người dùng khám phá; 103 canonical là **xương sống chất lượng** để AI và filter bám vào. Hai lớp bổ sung nhau: bề rộng (22k) + độ sâu chuẩn (103). `/recipes` mặc định thu về ~529 (103 món + biến thể) để không loãng, nhưng search vẫn chạm tới toàn kho.

🔍 *"Chất lượng 22k Cookpad không kiểm soát thì sao?"* → Đúng, nên chúng chỉ vào pool tra cứu/gợi ý, **không** vào trục canonical và **không** là nguồn công thức "chuẩn" hiển thị. Công thức chuẩn của mỗi món lấy từ canonical đã curate.

### A3. 🎓 "Cộng đồng đăng bài thì kiểm soát chất lượng thế nào?"
💬 State machine duyệt 2 trạng thái chờ (`recipe_service.py`): user đăng → `private` → gửi duyệt → `pending_admin` → admin publish/reject. Chỉ bài `approved` mới lên browse. Có rating/comment/save + admin ẩn comment vi phạm. → Cộng đồng mở nhưng có gác cổng.

🔍 *"Một admin duyệt tay thì có nghẽn khi user tăng không?"* → Có, đó là giới hạn hiện tại. Hướng phát triển: (a) auto-pre-filter bằng LLM/heuristic (trùng lặp, thiếu bước, ảnh không hợp lệ) đẩy lên hàng đợi ưu tiên; (b) reviewer nhiều cấp; (c) trust-score user cao được fast-track.

---

## NHÓM B — MỞ RỘNG, ĐIỀU ĐỘ & CÂN BẰNG TẢI (trọng tâm của thầy)

### B1. 🎓 "Khi số người dùng tăng gấp 10, 100 lần, kiến trúc của em mở rộng thế nào?"
💬 Trả lời theo **con đường scale ngang (horizontal)** đã chuẩn bị sẵn trong code:
1. **Tầng web stateless** — JWT không lưu session server (`core/security.py`), nên **nhân bản N instance FastAPI** sau **load balancer** (nginx/HAProxy/cloud LB) là được, không cần sticky session.
2. **DB connection pool cấu hình được** — `config.py:39-41`, `database.py` (`pool_size`, `max_overflow`, `pool_recycle`). Khi nhiều instance, chỉnh pool + thêm **PgBouncer** để gom kết nối.
3. **Rate-limit chia sẻ qua Redis** — `RATE_LIMIT_STORAGE_URI` (`config.py:34`, `core/rate_limit.py`): dev để trống (in-memory), prod trỏ Redis để counter dùng chung giữa các instance.
4. **Object storage tách khỏi máy chủ** — `STORAGE_BACKEND=s3` (`config.py:46-52`, `upload_service.py`): ảnh không nằm trên đĩa 1 máy → nhiều instance đọc/ghi chung S3/R2 (đây là điều kiện *bắt buộc* để scale ngang tầng web).
5. **AI tách microservice riêng** — `AI_BACKEND=http` (`ai/factory.py`, `ai/http_predictor.py`, thư mục `ai-service/`): tầng suy luận nặng GPU scale **độc lập** với tầng web nhẹ.

> Điểm nhấn: **hệ thống đã được thiết kế "scale-ready"** — 4 rào cản kinh điển (state, file cục bộ, model in-process, counter cục bộ) đều đã có đường thoát bằng toggle config, không phải viết lại.

🔍 *"Em bảo stateless, nhưng upload ảnh lưu ở đâu?"* → Chính xác đó là mấu chốt: nếu lưu đĩa cục bộ (`local`) thì **không** stateless thật (instance A lưu, instance B không thấy). Nên có `STORAGE_BACKEND=s3` — chuyển ảnh sang object storage dùng chung; lúc đó tầng web mới stateless hoàn toàn. Đã tách interface `upload_service` sẵn (`test_upload_storage.py`).

### B2. 🎓 "Cân bằng tải (load balancing) em làm ở đâu, thuật toán gì?"
💬 Ở tầng **reverse proxy / LB** đứng trước cụm FastAPI. **Thực tế đã deploy: Render** tự cung cấp load balancer + health check trước các instance backend (bật autoscale N replica là toggle trả phí). Vì web stateless nên dùng được **round-robin** hoặc **least-connections** — không cần session affinity. Cách chung (self-host): nginx/cloud LB → N × Uvicorn worker. Health check trỏ `/api/v1/health` (đã ping DB thật, `main.py`, commit `ad49885`) để tự loại instance hỏng.

🔍 *"Least-connection hay round-robin tốt hơn cho hệ của em?"* → Request browse/read khá đồng đều → round-robin đủ. Nhưng endpoint AI (nếu để chung) thời gian xử lý lệch lớn → **least-connections** công bằng hơn. Đó cũng là lý do tách AI ra tier riêng: để 2 loại tải (nhẹ/đều vs nặng/lệch) không giành tài nguyên nhau và được LB theo chính sách phù hợp.

### B3. 🎓 "Điểm nghẽn (bottleneck) đầu tiên khi tải tăng là gì? Em đã đo chưa?"
💬 **Đã đo thật trên bản deploy cloud** bằng Locust nhắm hot path đọc (`/recipes` list, `/recipes/{id}` detail, `/recipes/featured`, `/recipes/search`; **tránh endpoint AI** vì thuộc tier riêng). Kết quả:
- **≤ 15 người đồng thời:** 0% lỗi, p50 ~0,7s, p95 ~1,9s, ~15 req/s → ổn định.
- **Tăng dần:** bão hòa ~**15 kết nối đồng thời**; từ 16 người bắt đầu lỗi (3%), 20 người ~31%, 50 người ~30% lỗi 500.
- **Bottleneck xác định rõ:** trần ~15 = **giới hạn kết nối của Supabase pooler gói free**, KHÔNG phải kiến trúc (SQLAlchemy pool cho 25-30). Query `featured` nặng (~700ms) giữ connection lâu càng làm cạn nhanh.

Thứ tự bottleneck: (1) **kết nối DB** (trần free tier) → nâng pool/tier + PgBouncer + read-replica; (2) **query nặng** → đã chống N+1 (audit `docs/superpowers/notes/2026-07-11-n-plus-one-audit.md`, 0 gap) + cache Redis cho `featured`/list; (3) **AI inference** → đã tách tier HF + hướng thêm queue.

🔍 *"Số khiêm tốn thế, hệ em yếu à?"* → Trung thực: số phản ánh **giới hạn hạ tầng MIỄN PHÍ** (Render Starter 0,5 vCPU + Supabase free ~15 kết nối + đo từ 1 máy qua Internet), không phải giới hạn thiết kế. Vì backend **stateless** nên chỉ cần: nâng pool Supabase (trả phí) + cache đọc nóng (Upstash đã đấu nối) + Render autoscale N replica → trần này biến mất. Điểm mạnh là **đã đo được, chỉ ra đúng nút thắt, và biết chính xác cách gỡ** — không nói chung chung.

### B4. 🎓 "Tác vụ nặng (AI, gửi mail) mà xử lý đồng bộ thì chặn request khác không?"
💬 Đúng — hiện AI inference chạy **đồng bộ** trong request. Giải pháp đã đi bước đầu: tách AI ra **service HTTP riêng** (`AI_BACKEND=http`) để không chiếm CPU/GPU của tầng web. Bước tiếp theo (hướng phát triển): đưa job nặng vào **message queue** (Celery/RQ + Redis/RabbitMQ) → API trả `202 Accepted` + job id, client poll kết quả → tầng web luôn nhẹ và phản hồi nhanh.

🔍 *"Vì sao chưa làm queue luôn?"* → YAGNI ở quy mô đồ án: tách service HTTP đã gỡ được nút "model in-process" (rào cản lớn nhất). Queue là bước tối ưu throughput khi có tải thực; thiết kế hiện tại (predict tách khỏi resolve-DB) khiến việc gắn queue sau này chỉ là thay adapter, không đập đi xây lại.

### B5. 🎓 "Caching em dùng ở đâu?"
💬 Trung thực: **chưa có caching layer** (Redis cache cho response). Hiện dựa vào: pagination có cap (`limit=min(limit,50)`), index DB, async I/O, và Next.js cache phía client (`revalidate`). Hướng phát triển rõ ràng: Redis cache cho danh sách/`featured`/canonical (đọc nhiều, đổi ít) + CDN cho ảnh tĩnh + gzip/brotli. Redis đã có mặt trong kiến trúc (rate-limit) nên thêm cache dùng chung hạ tầng.

🔍 *"Cache thì lo stale data, em xử lý invalidation ra sao?"* → Với dữ liệu đọc-nhiều-đổi-ít (canonical, featured) dùng **TTL ngắn** (ví dụ 60s) chấp nhận stale nhẹ; với thao tác ghi (publish recipe, save) thì **event-based invalidation** xoá key liên quan. Trade-off nghiêng về TTL vì đơn giản, đúng bản chất nội dung công thức ít đổi.

---

## NHÓM C — BẢO MẬT WEB (thầy thiên về bảo mật)

### C1. 🎓 "Em bảo vệ mật khẩu và phiên đăng nhập thế nào?"
💬 Mật khẩu băm **bcrypt** (có salt, chống rainbow table) — `core/security.py:9-17`. Phiên dùng **JWT** access + refresh, mỗi token gắn field `type` để không dùng nhầm access làm refresh và ngược lại (`security.py:25-41`). Refresh xoay vòng (sliding session). So sánh token nhạy cảm dùng **constant-time compare** chống timing attack (commit `69fcf1f`, ở ai-service token guard).

🔍 *"JWT stateless thì thu hồi token bị lộ kiểu gì?"* → Điểm yếu cố hữu của JWT: không revoke tức thì. Mitigasi hiện tại: **access TTL ngắn** (thiệt hại giới hạn theo thời gian). Hướng phát triển: **blacklist/denylist trong Redis** theo `jti`, hoặc bump `token_version` trong DB để vô hiệu toàn bộ token cũ của user khi đổi mật khẩu/nghi lộ.

### C2. 🎓 "Chống SQL injection, XSS, CSRF thế nào?"
💬 **SQLi:** toàn bộ truy vấn qua **SQLAlchemy ORM parameterized** — không nối chuỗi SQL; kể cả filter động (meal/facet) cũng dùng `bindparam` + cột lấy từ **allow-list cố định**, không nhận cột tùy ý từ client. **XSS:** React tự escape output; không dùng `dangerouslySetInnerHTML` cho nội dung user. **CSRF:** API stateless dùng Bearer token trong header `Authorization` (không phải cookie tự gửi kèm) → giảm mạnh bề mặt CSRF.

🔍 *"Token em vừa để cookie vừa để localStorage — không mâu thuẫn à?"* → Đúng, đây là điểm cần siết: hiện token có ở cả httpOnly cookie (cho middleware SSR gác route) lẫn localStorage (cho axios interceptor). localStorage dễ bị XSS đọc. Hướng khắc phục: chuyển hẳn sang **httpOnly + SameSite cookie**, bỏ localStorage, và khi dùng cookie thì bổ sung **CSRF token** (double-submit). Đã ghi nhận trong `nfr-coverage.md` mục "chưa bao phủ".

### C3. 🎓 "Chống brute-force login và lạm dụng API?"
💬 **Rate limiting** bằng slowapi (`core/rate_limit.py`, commit `00b054d`): `/auth/login`, `/auth/staff-login`, `/auth/register` **5 lần/phút/IP**; `/ai/*` **20/phút/IP**; `/newsletter` **5/phút/IP**. Vượt ngưỡng trả **429** đúng error envelope. Login sai trả **401 chung chung** (không lộ email tồn tại hay không) → chống account enumeration (`auth_service.py:44-51`). Cổng staff và consumer **tách riêng**.

🔍 *"Rate-limit theo IP thì kẻ tấn công đổi IP/dùng botnet vẫn qua?"* → Đúng, IP-based là lớp phòng thủ đầu. Bổ sung (hướng phát triển): **account lockout** sau N lần sai (khoá tạm theo tài khoản, không chỉ IP), **CAPTCHA** khi nghi ngờ, và rate-limit Redis dùng chung để đa-instance không reset counter. Ngoài ra `RATE_LIMIT_STORAGE_URI` cho phép chuyển counter sang Redis để giới hạn có hiệu lực trên toàn cụm.

### C4. 🎓 "Upload file — làm sao chống upload mã độc / file nguy hiểm?"
💬 `upload_service.py:14-37`: validate **content-type + phần mở rộng** (allow-list ảnh) + **giới hạn kích thước** + **đổi tên UUID** (không giữ tên gốc, tránh path traversal & ghi đè). Serve qua route tĩnh riêng.

🔍 *"Nhưng attacker đổi đuôi + giả content-type thì sao?"* → Đúng, extension/MIME dễ giả. Hướng khắc phục (đã ghi trong nfr-coverage): **kiểm magic-byte** (đọc chữ ký nhị phân thật của file), scan bằng thư viện ảnh (Pillow decode để chắc là ảnh hợp lệ), và với prod đặt bucket **không cho thực thi**, serve qua CDN domain tách biệt.

### C5. 🎓 "Cấu hình bí mật (SECRET_KEY, mật khẩu DB) quản lý sao?"
💬 Nạp từ `.env` qua pydantic-settings (`core/config.py`), **không hardcode** trong code (CLAUDE.md quy định). Có **fail-fast SECRET_KEY** (commit `5833152`): app **từ chối khởi động** nếu key rỗng / chứa chuỗi placeholder / ngắn <32 ký tự → chặn việc lỡ deploy với key đoán được. CORS whitelist domain cụ thể, **không** dùng `*` (`main.py`).

🔍 *"Vì sao fail-fast thay vì cảnh báo?"* → Vì JWT ký bằng key yếu = toàn bộ auth sụp mà không ai biết. Fail-fast biến lỗi âm thầm (silent) thành lỗi ồn ào (loud) ngay lúc khởi động — nguyên tắc "fail loudly". Test `test_secret_key_validation.py` chứng minh.

### C6. 🎓 "Còn HTTPS, security headers (CSP/HSTS)?"
💬 Trung thực: localhost dev **chưa bật HTTPS** và **chưa có CSP/HSTS** — đã ghi rõ trong `nfr-coverage.md` mục "chưa bao phủ". Khi lên cloud: TLS-terminate ở LB/CDN (Let's Encrypt/Cloudflare), thêm HSTS, CSP, X-Frame-Options, X-Content-Type-Options qua middleware. Đây là hạng mục hạ tầng, không đòi sửa business logic.

🔍 *"CSP quan trọng nhất chống gì?"* → Chống **XSS** (chặn script inline/domain lạ) và data exfiltration. Kết hợp với việc bỏ token khỏi localStorage (C2) sẽ giảm mạnh hậu quả nếu lỡ có lỗ hổng XSS.

---

## NHÓM D — SỰ CỐ & PHỤC HỒI (thầy hay hỏi tình huống)

### D1. 🎓 "Nếu hệ thống bị tấn công xâm nhập thì em phát hiện và đối phó thế nào?"
💬 Trình bày theo 3 giai đoạn **Phát hiện → Cô lập → Phục hồi**:
- **Phát hiện:** logging cấu hình sẵn (`main.py:6-9`) + `ai_logs`/access log; hướng phát triển: tập trung log (ELK/Grafana Loki) + cảnh báo bất thường (nhiều 401/429, truy cập admin lạ giờ).
- **Cô lập:** vì auth stateless + có `token_version`/denylist (hướng phát triển) → **vô hiệu toàn bộ token** bằng cách xoay `SECRET_KEY` hoặc bump version; chặn IP ở LB/WAF; tách staff portal khỏi consumer nên khoanh vùng được.
- **Phục hồi:** đổi toàn bộ secret (rotate `SECRET_KEY`, mật khẩu DB), buộc reset mật khẩu user, restore DB từ backup về mốc trước khi bị xâm nhập (nhờ migration versioned + backup).

🔍 *"Nếu kẻ tấn công đã lấy được token của user thì sao?"* → TTL ngắn giới hạn thời gian; rotate secret vô hiệu hoá token cũ (đánh đổi: đá tất cả user ra, chấp nhận khi sự cố). Đó là lý do cần **denylist theo jti/token_version** để thu hồi *chọn lọc* thay vì đá toàn bộ — hạng mục ưu tiên trong hướng phát triển bảo mật.

### D2. 🎓 "Mất điện / server sập đột ngột — dữ liệu có mất/hỏng không?"
💬 **Không hỏng dữ liệu** nhờ **PostgreSQL ACID**: giao dịch hoặc commit trọn vẹn hoặc rollback, có WAL (write-ahead log) đảm bảo phục hồi nhất quán sau crash. Code cũng **rollback transaction khi lỗi** (`database.py:28-35`). Bằng chứng thực tế: khi backfill facet từng bị tắt nhầm Docker giữa chừng — Postgres phục hồi, resume không hỏng data (ghi trong session-state). Docker Compose có **healthcheck** cho Postgres (`pg_isready`) + `depends_on: condition: service_healthy` để thứ tự khởi động đúng.

🔍 *"Đang ghi dở một recipe mà mất điện thì record đó ra sao?"* → Nếu transaction chưa commit → Postgres tự rollback khi khởi động lại, record dở **không tồn tại** (all-or-nothing). User chỉ cần làm lại thao tác; không có trạng thái "nửa vời" trong DB. Đây là điểm mạnh của việc chọn RDBMS có ACID thay vì lưu file phẳng.

### D3. 🎓 "Đảm bảo tính sẵn sàng cao (high availability) — hiện có điểm chết đơn (single point of failure) nào?"
💬 Trung thực: hiện là **single node** cho cả web, DB, storage → có SPOF, phù hợp quy mô đồ án. Lộ trình HA:
- **Web:** nhiều instance sau LB (đã stateless-ready) → 1 instance chết, LB loại qua health check.
- **DB:** Postgres **primary + read-replica** (streaming replication) + failover (Patroni/managed RDS). `pool_recycle` (`config.py:41`) đã tính tới DB managed hay đóng kết nối idle.
- **Storage:** S3/R2 vốn đã replicated/HA sẵn.
- **AI:** nhiều replica service HTTP; nếu chết → backend trả **503 graceful**, frontend báo lỗi thân thiện tiếng Việt (không trắng trang).

🔍 *"Health check của em kiểm tra gì — chỉ ping cho có?"* → Không, `/api/v1/health` chạy `SELECT 1` xuống DB thật, DB lỗi trả **503** (commit `ad49885`, `test_health.py`). Nên LB biết instance *thực sự* phục vụ được hay không, không phải chỉ "process còn sống". Có tách `/health` (liveness) vs `/api/v1/health` (readiness).

### D4. 🎓 "AI service (bên thứ 3 / microservice) chết thì UX ra sao?"
💬 Xử lý lỗi có chủ đích trong `http_predictor.py`: timeout/connection/5xx → `HTTPException(503, "AI service không sẵn sàng")`; **cold start** (HF Space free ngủ sau ~48h) → **retry 1 lần** timeout dài hơn rồi mới 503; response thiếu field → **502**. Endpoint `/ai/recognize` giữ nguyên contract nên frontend hiện thông báo lỗi thân thiện tiếng Việt, không trắng trang. (Đã bỏ fallback OpenAI — khi AI không sẵn sàng thì báo lỗi rõ ràng thay vì đoán bừa.)

🔍 *"Retry có làm hỏng thêm khi service đang quá tải (retry storm)?"* → Có rủi ro đó. Hiện chỉ **retry 1 lần** (không vòng lặp) đúng để tránh khuếch đại. Hướng phát triển: **circuit breaker** — sau N lỗi liên tiếp thì "mở mạch", ngừng gọi một khoảng, trả fallback ngay, tránh dồn tải vào service đang ngất. Ghi nhận trong nfr-coverage ("retry/circuit-breaker" là future work).

---

## NHÓM E — KIỂM THỬ PHI CHỨC NĂNG (NFR)

### E1. 🎓 "Em hiểu kiểm thử phi chức năng là gì? Đã kiểm những khía cạnh nào?"
💬 NFR kiểm *hệ thống chạy tốt đến đâu* (chứ không phải *có làm đúng chức năng không*): **Hiệu suất, Khả năng mở rộng, Bảo mật, Độ tin cậy, Khả năng sử dụng**. Em có hẳn tài liệu audit `docs/nfr-coverage.md` chấm từng nhóm:

| Nhóm NFR | Mức | Bằng chứng chính |
|---|---|---|
| Bảo mật | 🟢 Tốt | bcrypt, JWT type, RBAC, rate-limit, fail-fast SECRET_KEY, chống enumeration |
| Hiệu suất | 🟢 Đạt (quy mô nhỏ) | async + pool + pagination cap + eager-load (0 N+1) |
| Độ tin cậy | 🟢 Đạt | health check ping DB thật + error envelope + 19 migration + test |
| Khả năng dùng | 🟢 Tốt | loading/empty/error states, aria, i18n, responsive, envelope nhất quán |
| Khả năng mở rộng | 🟡 Một phần | stateless OK; storage/redis/AI pluggable **đã deploy thật** (Vercel/Render/HF/Supabase/Upstash); đa-instance/autoscale cần gói trả phí |

🔍 *"Em đo hiệu suất bằng gì, có con số không?"* → **Có số thật trên cloud** (xem B3): ≤15 người đồng thời 0% lỗi, p50 ~0,7s, p95 ~1,9s; trần ~15 do Supabase pooler free. Công cụ: **Locust** cho hot path đọc + **audit N+1** thủ công toàn bộ endpoint (`docs/superpowers/notes/2026-07-11-n-plus-one-audit.md`, 0 gap: list `outerjoin`, detail `selectinload`, meal-plan/social batched `.in_()`). Đã chỉ ra đúng bottleneck (kết nối DB free tier) + cách gỡ (pool/cache/autoscale).

### E2. 🎓 "Kiểm thử tự động có bao nhiêu, cover cái gì?"
💬 **15 file test pytest** trong `backend/tests/` (~39 test case), tập trung vùng rủi ro cao: `test_secret_key_validation`, `test_rate_limit`, `test_error_envelope`, `test_health` (readiness DB), `test_db_pool`, `test_http_predictor` + `test_predictor_factory` + `test_ai_backend_config` (nhánh AI local/http), `test_upload_storage` (pluggable storage), `test_dish_resolver`, `test_recipe_class_mapping`… → Test bám đúng các quyết định kiến trúc trọng yếu, không test cho có.

🔍 *"Sao không test toàn bộ endpoint / có test frontend/e2e không?"* → Chiến lược là **test theo rủi ro**: ưu tiên logic bảo mật, hợp đồng API (envelope), và các nhánh pluggable dễ sai. Coverage đầy đủ hơn (integration mọi endpoint, e2e Playwright, test frontend) là hướng phát triển; hiện frontend verify chủ yếu thủ công + `tsc --noEmit` chặn lỗi type.

### E3. 🎓 "Độ tin cậy hợp đồng API — lỗi trả về có nhất quán không?"
💬 Có: **global exception handler** (`core/exceptions.py`, commit `40cd29f`/`b13e437`) ép **mọi lỗi** (400/401/403/404/409/422/429/500/503) về đúng envelope `{success:false, error:{code, message}}` như CLAUDE.md quy định, kể cả 500 chưa bắt. Frontend có `extractError` đọc envelope (fallback `.detail` để tương thích ngược). → Client chỉ phải parse **một** kiểu lỗi. Test `test_error_envelope.py`.

🔍 *"500 mà lộ stack trace ra client là lỗ hổng — em có che không?"* → Có, handler 500 trả `code:"INTERNAL_ERROR"` + message chung, **không** đẩy stack trace ra response (chi tiết chỉ vào log server). Vừa an toàn (không lộ nội bộ) vừa nhất quán hợp đồng.

---

## NHÓM F — AI MODEL

### F1. 🎓 "Mô tả kiến trúc model AI của em."
💬 **EfficientNet phân cấp 2 tầng** (`ai/inference.py`, class `TastyVietnamPredictor`):
- **Tầng 1 — phân nhóm:** EfficientNet-**B0**, ảnh 224×224, phân 8 nhóm món (BANH, BUN_PHO, COM, MON_KHO_NUONG, CANH_CHAO, XOI, GOI_CUON, DAC_BIET).
- **Tầng 2 — phân món:** mỗi nhóm có 1 EfficientNet-**B2** riêng (ảnh 260×260) phân món cụ thể trong nhóm đó (`GROUP_TO_WEIGHT`).
- **Cơ chế tin cậy:** softmax → ngưỡng nhóm **0.5**, ngưỡng món **0.6**; dưới ngưỡng → `needs_fallback=True` → **báo "không nhận diện được"** (đã bỏ OpenAI). Trả `top5` để hiển thị lựa chọn thay thế.

🔍 *"Vì sao 2 tầng chứ không một model 103 lớp phẳng?"* → Chia để trị: một model 103 lớp khó hội tụ, dễ nhầm giữa các nhóm rất khác nhau. Chia thành 1 model nhóm (8 lớp, dễ) + 8 model con (mỗi cái ~10-30 lớp) → mỗi bài toán con dễ hơn, dễ huấn luyện/tinh chỉnh từng nhóm, và ngưỡng tin cậy 2 tầng lọc nhiễu tốt hơn. Đánh đổi: lỗi tầng nhóm lan xuống tầng món.

### F2. 🎓 "Độ chính xác model bao nhiêu? Đánh giá thế nào?"
💬 Có `model_metrics.json` (đo trên **7.384 mẫu test**): **Accuracy 81.9%**, **macro-F1 0.85**, **weighted-F1 0.877**, precision macro 0.958. **Tỉ lệ dưới ngưỡng ~14% (1.042 mẫu)** — tức ~14% ca model tự thấy không chắc (nhóm <0.5 hoặc món <0.6) → hiện **báo "không nhận diện được"** (trước đây nhường OpenAI Vision, đã bỏ). Đo precision/recall/F1 **từng lớp** (103 lớp) chứ không chỉ accuracy tổng.

🔍 *"Accuracy 82% nghe chưa cao — lớp nào yếu và vì sao?"* → Trung thực nêu ví dụ từ metrics: `tau-hu-nhoi-thit` recall chỉ 0.31, `ca-ri-ga` 0.42, `thit-dong` 0.50 — thường là món **ít mẫu** (support ~25-36) và **dễ nhầm hình thức** với món khác cùng nhóm. Đây là **class imbalance** + nhầu-nhìn-giống-nhau. Cách xử lý: (a) precision cao (0.958) nghĩa là khi model *nói chắc* thì thường đúng — kết hợp ngưỡng tin cậy + fallback nên **trải nghiệm người dùng vẫn tốt** dù recall vài lớp thấp; (b) hướng cải thiện: thu thêm ảnh lớp yếu, augmentation, class-weighted loss.

### F3. 🎓 "Trước em có fallback OpenAI Vision, sao giờ bỏ đi?"
💬 Ban đầu dùng OpenAI Vision cho ~14% ca model không chắc, nhưng **đã bỏ** vì 3 lý do: (1) **phụ thuộc bên thứ 3** — tốn phí API + rủi ro downtime/đổi giá ngoài tầm kiểm soát; (2) **lệch định vị** — đồ án nhấn "AI chuyên biệt món Việt tự chủ", gọi model ngoại lai làm loãng thông điệp; (3) **rủi ro chất lượng** — OpenAI trả tên chung chung khó map về trục canonical (AI⊆Lookup). Nay giữ **fail-safe thuần nội bộ**: dưới ngưỡng 0.5/0.6 → báo thẳng "không nhận diện được" + vẫn hiển thị `top5` để user tự chọn. Thà nói "chưa chắc" còn hơn đoán bừa đưa nhầm công thức.

🔍 *"Bỏ fallback thì 14% ca khó mất gợi ý, không tệ hơn à?"* → Đánh đổi có chủ đích: đổi **độ phủ** lấy **tự chủ + nhất quán trục canonical**. Kiểm soát tác động: **precision 0.958** nghĩa là khi model nói chắc thì hiếm sai; ngưỡng tin cậy lọc phần rủi ro; `top5` vẫn cho user lựa chọn thủ công. Hướng phát triển đúng bài (không quay lại OpenAI): (a) thu thêm ảnh lớp yếu + augmentation để **giảm tỉ lệ dưới ngưỡng**; (b) nếu cần fallback, dùng **model open-source self-host** (BLIP/CLIP) để vẫn tự chủ, không phụ thuộc dịch vụ trả phí ngoài.

### F4. 🎓 "Triển khai/scale riêng model thế nào (liên hệ câu scale)?"
💬 Đã tách được model thành **service HTTP độc lập** (`ai-service/`: `app.py` FastAPI nhỏ với `POST /predict` + `GET /health`, `Dockerfile` torch-CPU, deploy Hugging Face Space). Backend chỉ đổi `AI_BACKEND=http` (`ai/factory.py` chọn `HttpPredictor` thay vì nạp torch in-process). Nhờ vậy tầng AI nặng scale/deploy **độc lập** với tầng web, thậm chí chạy GPU riêng, mà **không đụng một dòng** business logic (`ai_service.py` giữ nguyên).

🔍 *"Tách ra thì độ trễ mạng có làm chậm không?"* → Có thêm 1 hop HTTP, đổi lại: tầng web không bị chiếm CPU khi inference, và scale 2 tier độc lập. Với ảnh vài trăm KB + service cùng vùng, độ trễ chấp nhận được so với lợi ích tách tải. Contract dict giữ nguyên nên có thể **bật/tắt** local↔http tuỳ môi trường (dev local cho nhanh, prod http để scale).

### F5. 🎓 "EfficientNet là gì? Vì sao chọn nó chứ không phải ResNet/VGG/ViT?"
💬 **EfficientNet** (Google, 2019) là họ CNN tối ưu **tỉ lệ độ chính xác/chi phí** nhờ **compound scaling** — cân bằng đồng thời 3 chiều: **độ sâu** (số lớp), **độ rộng** (số kênh), **độ phân giải** ảnh, theo một hệ số φ, thay vì tăng bừa 1 chiều. Lõi là khối **MBConv** (mobile inverted bottleneck) + **Squeeze-Excitation** + activation **Swish**. Vì sao chọn: (1) **nhẹ, ít tham số** (B0 ~5,3M, B2 ~9,2M) → chạy CPU được, hợp đồ án không có GPU mạnh + deploy Hugging Face free; (2) accuracy/param tốt hơn ResNet-50 (~25M) ở cùng độ chính xác; (3) có **sẵn bộ B0…B7** để chọn kích cỡ theo tầng. So với **ViT (Vision Transformer)**: ViT mạnh nhưng **đói dữ liệu** (cần vài chục nghìn–triệu ảnh mới thắng CNN), trong khi dữ liệu món Việt của em hạn chế → CNN pretrained hợp hơn.

🔍 *"Có thử ResNet/ViT để so không?"* → Trung thực nếu chưa benchmark nhiều: chọn EfficientNet vì **hiệu quả tham số** phù hợp ràng buộc phần cứng + dữ liệu vừa. Hướng phát triển: benchmark ViT/ConvNeXt khi có thêm dữ liệu + GPU để đối chứng.

### F6. 🎓 "Khối MBConv trong EfficientNet hoạt động thế nào?"
💬 **MBConv = Mobile Inverted Bottleneck Conv** (từ MobileNetV2): (1) **expand** — Conv 1×1 phình số kênh lên (tỉ lệ ×1 hoặc ×6, ghi "MBConv1"/"MBConv6" trong sơ đồ); (2) **depthwise conv** k×k (3×3 hoặc 5×5) — tích chập tách kênh, **rẻ hơn conv thường nhiều lần**; (3) **Squeeze-Excitation** — học trọng số "chú ý" cho từng kênh; (4) **project** — Conv 1×1 nén kênh về; (5) **residual** cộng tắt khi cùng chiều. "Inverted" vì phình-rồi-nén (ngược bottleneck ResNet nén-rồi-phình). → Ít phép tính mà vẫn biểu diễn tốt.

🔍 *"Vì sao có cả kernel 3×3 và 5×5?"* → EfficientNet dùng kernel khác nhau ở các stage (thấy trong sơ đồ B0: stage 3/5/8 dùng 3×3, stage 4/6/7 dùng 5×5) — kernel lớn bắt đặc trưng vùng rộng hơn ở tầng sâu; đây là thiết kế gốc của paper (tìm bằng neural architecture search), em kế thừa nguyên.

### F7. 🎓 "Vì sao dùng B0 cho tầng 1 và B2 cho tầng 2 — hai kích cỡ khác nhau?"
💬 Chủ đích **cân chi phí theo độ khó**: 
- **Tầng 1 (phân 8 nhóm)** là bài **dễ** — 8 lớp khác biệt rõ (bánh vs bún vs cơm) → dùng **B0 nhỏ** (5,3M, ảnh 224) cho **nhanh, rẻ**, đủ chính xác (~92%).
- **Tầng 2 (phân món trong nhóm)** là bài **khó** — các món cùng nhóm trông giống nhau, cần phân biệt chi tiết → dùng **B2 lớn hơn** (9,2M, ảnh 260, sâu ×1,2 rộng ×1,1) để có **sức biểu diễn cao hơn**.
→ Không "một cỡ cho tất cả": bỏ tài nguyên vào đúng chỗ khó. Đây là biểu hiện cụ thể của tư duy phân cấp coarse-to-fine.

🔍 *"Sao không dùng B2 cho cả 2 tầng cho khỏe?"* → Lãng phí: tầng nhóm B0 đã đạt ~92%, nâng lên B2 tốn gấp đôi tham số/thời gian mà cải thiện không đáng. Chọn B0 cho tầng nhóm giúp **pipeline nhanh hơn** (mọi ảnh đều qua tầng 1).

### F8. 🎓 "Vì sao ảnh đầu vào 224 (B0) khác 260 (B2)?"
💬 Đó là **độ phân giải chuẩn** đi kèm mỗi biến thể do compound scaling quy định: B0 gắn với 224, B2 với 260 (paper tăng resolution cùng lúc với depth/width). Ảnh lớn hơn ở B2 → giữ nhiều chi tiết hơn, hợp bài phân món cần phân biệt tinh vi. Tiền xử lý: resize đúng cỡ + **chuẩn hóa theo mean/std ImageNet** (`inference.py`, `_MEAN/_STD`).

🔍 *"Chuẩn hóa ImageNet nghĩa là model pretrained ImageNet?"* → Đúng, đó là dấu hiệu **transfer learning** — xem F9.

### F9. 🎓 "Em train từ đầu hay dùng pretrained? Transfer learning thế nào?"
💬 **Transfer learning** từ backbone **pretrained ImageNet** (`EfficientNet_B0/B2_Weights.IMAGENET1K_V1`), **thay classifier cuối** bằng head mới (`nn.Dropout(0.3)` + `Linear` về số lớp — `inference.py`). Fine-tune theo **3 pha "progressive unfreezing"** (notebook train):
- **Pha 1 — chỉ head:** đóng băng backbone (`requires_grad=False`), train head, **LR 1e-3**, ~5 epoch.
- **Pha 2 — mở 3 block cuối:** `unfreeze_top_blocks(num_blocks=3)`, **LR 1e-4**, ~15 epoch.
- **Pha 3 — mở toàn mạng:** `unfreeze_all`, **LR 5e-5** (nhỏ để không phá đặc trưng đã học), ~10 epoch.

Optimizer **AdamW**, scheduler **CosineAnnealing**, batch 32. Lý do transfer learning: dữ liệu món Việt ít, train từ đầu sẽ **overfit**; backbone ImageNet đã học đặc trưng tổng quát → chỉ dạy lại phần "món Việt".

🔍 *"Vì sao mở dần từng bước chứ không fine-tune toàn mạng ngay?"* → Nếu mở toàn mạng ngay với LR lớn, gradient từ head chưa chín sẽ **phá hỏng trọng số pretrained** (catastrophic forgetting). Mở dần + **giảm LR theo pha** (1e-3 → 1e-4 → 5e-5): đầu tiên chỉ chỉnh head, sau nới dần các block sâu với bước nhỏ → ổn định, tận dụng tối đa pretrained. Kèm regularization mạnh (dropout 0.3, augmentation, label smoothing 0.1) vì dữ liệu ít.

### F10. 🎓 "Kiến trúc 2 tầng của em có phải Mixture of Experts (MoE) không?"
💬 **Đúng — là một dạng MoE với "hard routing"**: bộ phân nhóm B0 đóng vai **gate/router**, 8 model con B2 là các **expert**, mỗi ảnh được **định tuyến cứng** vào đúng 1 expert theo nhóm. Khác MoE kinh điển ở chỗ MoE thường **soft gating** (trọng số mềm, kích hoạt nhiều expert, train chung gate+expert), còn em **hard-gated + train độc lập từng expert**. Em chọn hard vì: **mô-đun** (thêm/sửa món chỉ train lại 1 expert nhỏ, không đụng 103 lớp), **diễn giải được**, **inference rẻ** (chỉ chạy 2 model).

🔍 *"Sao không dùng Sparse/Soft-MoE cho tốt hơn?"* → Sparse-MoE (V-MoE) và **Soft-MoE** (2023) cho kết quả tốt hơn và **tránh lỗi lan truyền** (gate sai → hỏng), nhưng cần **nhiều dữ liệu + train chung nặng + load-balancing loss**, không hợp quy mô đồ án 1 người/103 lớp/dữ liệu hạn chế. **Hướng phát triển đã có tên cụ thể**: chuyển hard-gate → **Soft-MoE** để bỏ điểm gãy "nhóm sai → món sai".

### F11. 🎓 "Ngưỡng tin cậy 0.5 (nhóm) và 0.6 (món) chọn thế nào — có phải bịa?"
💬 Ngưỡng là **tham số quyết định fail-safe** (`inference.py:86-87`, `GROUP_CONFIDENCE_THRESHOLD=0.5`, `CLASS_CONFIDENCE_THRESHOLD=0.6`): softmax của tầng nào **dưới ngưỡng** → coi là "không chắc" → báo không nhận diện. Chọn **tầng 1 thấp hơn (0.5)** để không cắt oan sớm (8 lớp, sai số nhóm ít nghiêm trọng); **tầng 2 cao hơn (0.6)** vì đó là **kết quả cuối** trực tiếp dẫn tới công thức — siết chặt để tránh đưa nhầm. → Đánh đổi **precision vs recall**: ngưỡng cao → ít sai (precision cao) nhưng nhiều ca "không nhận diện" hơn (recall thấp).

🔍 *"Chọn 0.5/0.6 bằng cảm tính hay có căn cứ?"* → Trung thực: căn cứ vào **precision-recall theo ngưỡng** + đặc thù 2 tầng (tầng cuối cần chắc hơn). Cách bài bản hơn (hướng phát triển): quét ngưỡng trên tập validation, chọn điểm tối ưu F-beta (ưu tiên precision) hoặc theo đường ROC — thay vì cố định tay.

### F12. 🎓 "Dữ liệu huấn luyện — bao nhiêu ảnh, xử lý mất cân bằng lớp, augmentation gì?"
💬 Đánh giá trên **7.384 mẫu test** (`model_metrics.json`), đo precision/recall/F1 **từng lớp trong 103 lớp**. Có **class imbalance** rõ: lớp yếu như `tau-hu-nhoi-thit` (recall 0.31), `ca-ri-ga` (0.42) đều **ít mẫu** (support ~25-36) và **dễ nhầm hình thức**. Xử lý (notebook train): **augmentation mạnh** — `Resize(img+20)` rồi crop về `img`, `RandomHorizontalFlip`, `RandomRotation`, `ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05)`, `RandomErasing(p=0.2)`, chuẩn hóa ImageNet; **loss `CrossEntropyLoss(label_smoothing=0.1)`** — làm mềm nhãn, chống model quá tự tin + đỡ nhạy với lớp lệch.

🔍 *"Lớp ít mẫu thì làm sao tin được?"* → Trung thực: **chưa dùng class-weighted loss / WeightedRandomSampler** — mới xử lý lệch bằng augmentation + label smoothing, nên vài lớp ít mẫu recall vẫn thấp. Bù lại: **precision macro 0.958** — khi model *nói chắc* thì hiếm sai; ngưỡng tin cậy + báo "không nhận diện" cho ca khó → **trải nghiệm vẫn an toàn**. Hướng gỡ rõ ràng: **class-weighted loss** hoặc **oversampling/WeightedRandomSampler** lớp hiếm, thu thêm ảnh đa nguồn cho lớp yếu.

### F13. 🎓 "Vì sao báo cáo macro-F1 chứ không chỉ accuracy? Lỗi 2 tầng lan truyền ra sao?"
💬 **Accuracy dễ đánh lừa khi lớp mất cân bằng** — model đoán toàn lớp nhiều mẫu vẫn accuracy cao mà bỏ rơi lớp hiếm. **Macro-F1 (0.85)** tính trung bình F1 **đều cho mọi lớp** → phản ánh cả lớp ít mẫu, trung thực hơn. Về **lỗi lan truyền**: tầng 1 phân sai nhóm → tầng 2 chắc chắn sai món (chọn nhầm expert). Đây là **nhược điểm cố hữu của kiến trúc phân cấp hard-gate**.

🔍 *"Đo được tỉ lệ lỗi do tầng 1 gây ra không?"* → Có thể tách: đánh giá riêng accuracy tầng nhóm (~92,48%) — tức ~7,5% ca đã hỏng ngay từ định tuyến, kéo theo tầng món. Giảm bằng: ngưỡng nhóm 0.5 (ca mập mờ báo không nhận diện thay vì đi tiếp sai), hoặc **Soft-MoE** (không cắt cứng) như F10. Ngoài ra `top5` giúp user vẫn thấy lựa chọn gần đúng dù tầng chọn sai.

### F14. 🎓 "Squeeze-Excitation trong EfficientNet là gì, có tác dụng gì cho bài toán của em?"
💬 SE = **cơ chế chú ý theo kênh (channel attention)** nhúng trong mỗi khối MBConv, 3 bước: (1) **Squeeze** — global average pooling nén mỗi feature-map (kênh) thành 1 số → vector "mức kích hoạt" từng kênh; (2) **Excitation** — 2 lớp FC (nén theo tỉ lệ r rồi phình lại) + sigmoid → sinh trọng số 0–1 cho từng kênh; (3) **Scale** — nhân trọng số đó vào kênh gốc. Ý nghĩa: mạng **tự học kênh đặc trưng nào quan trọng** cho ảnh này rồi khuếch đại, dập kênh nhiễu. Rất hợp bài **fine-grained** của em (phân biệt món cùng nhóm trông giống nhau) vì nhấn được đặc trưng phân biệt tinh vi.

🔍 *"SE có làm chậm model nhiều không?"* → Rất ít: chỉ 2 FC nhỏ mỗi block, thêm chưa tới vài % FLOPs nhưng tăng accuracy rõ — nên EfficientNet giữ SE trong mọi MBConv.

### F15. 🎓 "Vì sao EfficientNet dùng Swish thay vì ReLU?"
💬 **Swish (SiLU)**: f(x) = x·σ(x). Khác ReLU `max(0,x)` cắt cứng ở 0: Swish **mượt, không đơn điệu**, cho **giá trị âm nhỏ đi qua** (tránh "dying ReLU" — neuron chết vĩnh viễn), gradient trơn hơn → mạng sâu học ổn định hơn, thường +~0,5–1% accuracy so ReLU. Đó là lý do cả họ EfficientNet dùng Swish.

🔍 *"Swish đắt hơn ReLU, có đáng không?"* → Đắt hơn chút (thêm sigmoid) nhưng không đáng kể trên GPU/CPU hiện đại; đổi lại độ chính xác tốt hơn. Muốn nhẹ cho thiết bị yếu thì có **hard-swish** (MobileNetV3) xấp xỉ Swish mà rẻ hơn — hướng tối ưu nếu chạy mobile.

### F16. 🎓 "So B0 và B2 theo FLOPs/độ trễ — chi phí một lần nhận diện là bao nhiêu?"
💬 Số chuẩn theo paper (ở độ phân giải gốc):

| | **B0** (tầng 1) | **B2** (tầng 2) |
|---|---|---|
| Tham số | 5,3M | 9,2M |
| FLOPs | ~0,39 GFLOPs | ~1,0 GFLOPs (**~2,6×**) |
| Ảnh | 224 | 260 |
| Top-1 ImageNet | 77,1% | 80,1% |

Một lần nhận diện = **1×B0 + 1×B2 ≈ 1,4 GFLOPs** (nhờ **hard routing** chỉ chạy 1 trong 8 B2, không chạy hết). Đủ nhẹ để **chạy CPU** trên Hugging Face free.

🔍 *"Sao không gộp thành 1 model 103 lớp hoặc ensemble cho chắc?"* → Model 103 lớp phẳng khó hội tụ + không mô-đun; **ensemble** (chạy nhiều model rồi trung bình) tốn gấp nhiều lần FLOPs. Kiến trúc phân cấp chỉ tốn ~1,4 GFLOPs/ảnh mà vẫn "chuyên biệt hoá" — cân bằng tốt chi phí/độ chính xác.

### F17. 🎓 "Em lấy softmax làm 'độ tin cậy', nhưng mạng nơ-ron nổi tiếng overconfident — softmax cao chưa chắc đúng. Em có hiệu chuẩn (calibration) không?"
💬 Câu hỏi rất đúng chỗ: softmax **không phải xác suất đã hiệu chuẩn**; DNN thường **quá tự tin** (đẩy softmax về gần 1 kể cả khi sai). Em **giảm nhẹ** bằng **label smoothing 0.1** khi train — làm mềm nhãn mục tiêu → model bớt overconfident, phân bố softmax "thật" hơn. Ngưỡng 0.5/0.6 là **ngưỡng vận hành** chọn theo precision-recall, không coi softmax là xác suất tuyệt đối.

🔍 *"Có đo ECE (Expected Calibration Error) / vẽ reliability diagram không?"* → Trung thực: **chưa đo ECE**. Hướng phát triển: **temperature scaling** — hiệu chuẩn hậu kỳ chỉ 1 tham số T học trên tập validation (chia logit cho T trước softmax) để độ tin cậy phản ánh đúng xác suất → đặt ngưỡng chính xác hơn. Label smoothing đã là một dạng calibration ngay lúc train.

---

## NHÓM G — CI/CD & VẬN HÀNH

### G1. 🎓 "Quy trình build–test–deploy tự động (CI/CD) của em thế nào?"
💬 **Trung thực: hiện chưa có pipeline CI/CD tự động** (không có `.github/workflows`). Triển khai/kiểm thử đang **thủ công**: `docker-compose up` cho DB, `uvicorn` cho backend, `npm run dev` cho frontend; chạy `pytest` và `tsc --noEmit` bằng tay trước khi commit. Lý do: quy mô đồ án ưu tiên hoàn thiện tính năng + kiến trúc scale-ready trước.
**Nhưng nền tảng để gắn CI/CD đã sẵn sàng:** đã container hoá (Docker), có test suite (`pytest`), có migration versioned (Alembic), config qua env (12-factor) — nên thêm pipeline là "cắm vào", không phải sửa kiến trúc.

🔍 *"Nếu làm CI/CD, em sẽ thiết kế pipeline ra sao?"* → **GitHub Actions** với các stage:
1. **CI (mỗi PR):** lint (ruff) + `tsc --noEmit` → `pytest` (spin Postgres service container) → build Docker image.
2. **Kiểm tra chất lượng:** chặn merge nếu test đỏ; chạy `alembic upgrade head` trên DB tạm để bảo đảm migration không hỏng.
3. **CD (merge vào main):** build & push image lên registry → deploy staging → smoke test → duyệt tay → deploy prod (rolling update để zero-downtime).
4. **Migration an toàn:** chạy migration **trước** khi rollout code mới, viết migration tương thích ngược (expand-then-contract) để rollback được.

### G2. 🎓 "Deploy phiên bản mới mà không gián đoạn người dùng (zero-downtime)?"
💬 Nhờ web **stateless** → **rolling update**: dựng instance mới, health check (`/api/v1/health`) xanh thì LB chuyển tải sang, rồi tắt instance cũ. Không mất phiên vì JWT không nằm ở server. DB migration theo mẫu **expand → migrate → contract** để 2 phiên bản code chạy song song trong lúc rollout.

🔍 *"Migration đổi schema mà code cũ còn chạy thì vỡ không?"* → Đó là lý do dùng expand-then-contract: bước 1 chỉ **thêm** cột/bảng (code cũ vẫn chạy), deploy code mới dùng cột mới, bước sau mới **xoá** cột cũ khi không còn ai dùng. Alembic (19 migration hiện có) hỗ trợ versioning + rollback. Tránh migration "phá huỷ" (drop/rename) cùng lúc deploy.

### G3. 🎓 "Giám sát (monitoring) và backup khi vận hành thật?"
💬 Trung thực: hiện có **logging** cơ bản (`main.py:6-9`) + health check readiness; **chưa có** monitoring/alerting/backup tự động (đã ghi trong `nfr-coverage.md` reliability "future work"). Lộ trình: (a) **metrics** Prometheus + Grafana (latency, error rate, pool usage); (b) **log tập trung** (Loki/ELK) + alert bất thường; (c) **backup DB** tự động (pg_dump định kỳ + PITR qua WAL archiving) + **diễn tập restore**; (d) uptime check ngoài.

🔍 *"Backup mà chưa từng restore thử thì coi như chưa có backup — em nghĩ sao?"* → Hoàn toàn đồng ý, đó là nguyên tắc "backup chưa test = schrödinger backup". Nên trong lộ trình có mục **diễn tập khôi phục định kỳ** (restore vào môi trường tạm, verify tính toàn vẹn) — chứ không chỉ tạo file dump rồi để đó.

---

## NHÓM H — SO SÁNH THỊ TRƯỜNG & ĐỐI THỦ CẠNH TRANH

> Thầy gần như chắc chắn hỏi: *"Ngoài thị trường có rồi, đồ án em thêm được gì?"*. Chìa khoá trả lời: **không đối thủ nào đứng ở GIAO ĐIỂM ba trục** mà đồ án bạn gộp lại. Dưới đây là 3 nhóm đối thủ thật + ma trận so sánh.

### Ba nhóm đối thủ thật trên thị trường

**Nhóm 1 — App công thức nấu ăn Việt Nam** (đối thủ gần nhất về nội dung)
- **Cooky.vn** — ~17.000 công thức, hơn 1 triệu user, có **Shopping List** (đánh dấu nguyên liệu cần/đã mua theo khẩu phần).
- **Feedy** — công thức + review nhà hàng, gắn với mạng xã hội Feedy.tv, cập nhật liên tục.
- **monngonmoingay.com**, **Esheep Kitchen** — kho công thức + video, chuẩn ẩm thực Việt.
- ➡️ **Điểm chung & điểm yếu của họ:** thư viện lớn, thuần tiếng Việt, nhưng **KHÔNG có AI nhận diện ảnh món ăn** và **không có trục canonical gắn AI**. Người dùng phải tự gõ tên món để tra.

**Nhóm 2 — App AI nhận diện món ăn qua ảnh** (đối thủ về công nghệ AI)
- **SnapCalorie** (do cựu nghiên cứu viên Google làm) — chụp ảnh → phân tích calo + 30 vi chất, sai số ~16% (tức ~84% đúng), dùng LiDAR ước lượng khẩu phần.
- **Foodvisor** — nhận diện ảnh tức thì; **train chủ yếu trên món châu Âu, kém chính xác với món châu Á** (điểm này rất đáng nhấn mạnh).
- **Calorie Mama** — computer vision phân loại hàng nghìn loại món toàn cầu.
- ➡️ **Điểm chung & điểm yếu của họ:** AI ảnh mạnh, nhưng mục tiêu là **đếm calo/dinh dưỡng**, **không dẫn tới công thức nấu món Việt**; và **không chuyên món Việt** (thậm chí Foodvisor tự nhận yếu món Á). Chụp phở ra "noodle soup + calo", không ra công thức nấu phở chuẩn.

**Nhóm 3 — App lập kế hoạch bữa ăn + đi chợ** (đối thủ về nghiệp vụ meal-plan)
- **Samsung Food (trước là Whisk)** — 240.000 công thức, meal-plan kéo-thả, grocery list 1 chạm, đặt nguyên liệu qua 23 chuỗi bán lẻ, gợi ý AI, cộng đồng. Freemium (~$59.99/năm).
- **Mealime, Paprika, Plan to Eat** — meal-plan + grocery mạnh.
- ➡️ **Điểm chung & điểm yếu của họ:** meal-plan/grocery cực chỉn chu nhưng **thiên phương Tây, rất ít món Việt, không nhận diện ảnh món Việt, không trục canonical tiếng Việt**, và **thu phí**.

### Ma trận so sánh (dùng khi bị hỏi trực diện)

| Tiêu chí | **TastyVietnam (của bạn)** | Cooky/Feedy (VN recipe) | SnapCalorie/Foodvisor (AI ảnh) | Samsung Food/Whisk (meal-plan) |
|---|---|---|---|---|
| Nhận diện ảnh **món Việt** → công thức | ✅ chuyên biệt, 103 lớp, →công thức chuẩn | ❌ | ⚠️ nhận diện được nhưng để **đếm calo**, không ra công thức Việt; Foodvisor yếu món Á | ❌ |
| Trục **canonical** + bất biến AI⊆Lookup | ✅ (enforce ở code) | ❌ (thư viện phẳng, không trục chuẩn) | ❌ | ⚠️ 240k nhưng thiên Tây |
| Công thức **tiếng Việt** chuẩn | ✅ | ✅ | ❌ | ⚠️ rất ít |
| Meal-plan + grocery list | ✅ | ⚠️ Cooky có shopping list, meal-plan hạn chế | ❌ | ✅ (mạnh nhất thị trường) |
| Cộng đồng **có kiểm duyệt** | ✅ 2 tầng | ✅ UGC (kiểm duyệt nhẹ) | ❌ | ✅ |
| Chuyên ẩm thực Việt (taxonomy vùng miền/dịp/…) | ✅✅ 6 hạng mục | ✅ | ❌ | ❌ |
| Miễn phí | ✅ | ✅ | freemium | freemium (thu phí) |

### Câu chuyện định vị (1 câu chốt hạ)
> *"Trên thị trường, mỗi trục đã có người làm tốt — nhưng **không ai đứng ở giao điểm** của cả ba: (1) AI nhận diện **món Việt** ra công thức chuẩn, (2) meal-plan + đi chợ, (3) cộng đồng kiểm duyệt — tất cả **tiếng Việt và miễn phí**. Đồ án của em lấp đúng khoảng trống giao điểm đó."*

### H1. 🎓 "SnapCalorie/Google Lens nhận diện ảnh món ăn rồi, AI của em có gì hơn?"
💬 Hai điểm: (1) **Chuyên biệt món Việt** — họ nhận diện chung chung để đếm calo (Foodvisor tự nhận yếu món Á); em train riêng 103 món Việt, đầu ra là **công thức nấu chuẩn tiếng Việt**, không phải con số calo. (2) **Gắn với trục canonical** — nhận diện xong dẫn thẳng tới công thức có thật trong hệ thống (AI⊆Lookup), khép kín "thấy món → nấu được".

🔍 *"Nhưng độ chính xác của em 82%, SnapCalorie ~84% và họ có LiDAR — em thua mà?"* → Trung thực: về **hạ tầng AI thuần** họ mạnh hơn (đội ngũ ex-Google, LiDAR đo khẩu phần, dữ liệu khổng lồ). Nhưng đó là **so sai bài toán**: họ giải "đếm calo món toàn cầu", em giải "nhận diện món Việt → công thức Việt" — bài toán em **không có sản phẩm nào phục vụ tốt**. 82% trên **món Việt cụ thể** (báo "không nhận diện" cho ~14% ca khó thay vì đoán bừa) là phù hợp mục tiêu; và precision 0.958 nghĩa là khi model nói chắc thì hiếm khi sai.

### H2. 🎓 "Cooky đã có 17k công thức + shopping list + triệu user rồi, em cạnh tranh kiểu gì?"
💬 Em **không cạnh tranh về quy mô thư viện** (họ thắng) — em khác biệt ở **lối vào bằng ảnh** và **trục chất lượng**. Cooky buộc user gõ tên món để tra; em cho **chụp ảnh là ra công thức**. Cooky là kho phẳng; em có trục canonical 103 món chuẩn để AI và filter bám vào, không loãng. Đó là **định vị khác**, không phải làm lại Cooky.

🔍 *"Vậy về quy mô và độ chín em thua họ nhiều?"* → Đúng, thẳng thắn: đây là **đồ án một người**, web-only (chưa có app native), chưa có triệu user hay tích hợp bán lẻ như Samsung Food. Em không giấu điều đó. Giá trị của đồ án là **chứng minh một hướng tiếp cận mới khả thi** (AI món Việt + trục canonical + trọn vòng đời) trên nền kiến trúc **scale-ready**, chứ không phải một sản phẩm thương mại trưởng thành. Nếu đưa ra thị trường, lộ trình là app native + mở rộng canonical + tích hợp đi chợ online.

### H3. 🎓 "Điểm nào đối thủ MẠNH HƠN em? (câu bẫy trung thực)"
💬 Nêu thẳng để ghi điểm chín chắn:
- **Quy mô nội dung:** Samsung Food 240k, Cooky 17k+triệu user > của em.
- **Hạ tầng AI:** SnapCalorie (ex-Google, LiDAR, sai số 16%) mạnh hơn về công nghệ thuần.
- **Độ chín sản phẩm:** họ có app native iOS/Android, tích hợp bán lẻ, thanh toán; em web-only, quy mô đồ án.
- **Meal-plan:** Samsung Food chỉn chu hơn (kéo-thả, đặt hàng 23 chuỗi siêu thị).
➡️ **Nhưng** không đối thủ nào có **đúng tổ hợp** của em cho **thị trường Việt**. Đồ án chọn thắng ở **chiều sâu bản địa hoá + tích hợp end-to-end**, không đua ở chiều rộng/độ chín.

---

## NHÓM I — LỰA CHỌN NỀN TẢNG & CÔNG NGHỆ (vì sao chọn X mà không phải Y)

> Thầy sẽ hỏi "vì sao chọn cái này?" cho từng thành phần. Nguyên tắc trả lời: **nêu lý do phù hợp quy mô + chuẩn mở giảm lock-in + đánh đổi**. Không nói "vì nó phổ biến".

### I1. 🎓 "Vì sao chọn cụm dịch vụ managed (Vercel/Render/Supabase/Upstash/HF) thay vì tự dựng trên 1 VPS/GCP?"
💬 VPS/GCP chỉ cho "cái máy trần" — vẫn phải tự lo OS, load balancer, autoscale, backup, TLS, monitoring = khối lượng **DevOps lớn cho đồ án 1 người**. Managed PaaS cho sẵn: Render (LB + health check + autoscale), Supabase (backup/PITR + pooler), Vercel (CDN edge + CI deploy), Upstash (Redis serverless). → Đổi **thời gian vận hành** lấy **tốc độ + độ tin cậy**, dồn sức vào nghiệp vụ. Ở tải rất lớn thì tự quản (VPS/K8s) mới lợi chi phí — là hướng phát triển.

🔍 *"Vậy có phải em né việc khó (tự cấu hình hạ tầng)?"* → Không né: kiến trúc **stateless + adapter theo chuẩn mở** (Postgres, S3 API, Redis protocol, Docker) nên **chuyển sang tự quản bất cứ lúc nào** không phải viết lại. Managed là lựa chọn hợp quy mô, không phải giới hạn kỹ thuật.

### I2. 🎓 "Vì sao Vercel cho frontend?"
💬 Vercel là **hãng tạo ra Next.js** → hỗ trợ tốt nhất App Router/SSR/streaming/image-optimization; deploy zero-config từ Git, **CDN edge** (phục vụ tĩnh gần user toàn cầu), preview deployment mỗi push, free hobby. Thay thế được: Netlify, Cloudflare Pages.

🔍 *"Edge/SSR giúp gì cho SEO?"* → Trang công thức được render HTML sẵn → Google **index được** + share có preview. Quan trọng vì nội dung công thức phải **tìm thấy được**; SPA render phía client (CSR) khó SEO.

### I3. 🎓 "Vì sao Render cho backend?"
💬 Render host **Docker/Python**, có sẵn **load balancer + health check + autoscale + TLS + auto-deploy từ Git + Pre-Deploy** (chạy migration) — đúng thứ tầng web stateless cần, khỏi cấu hình nginx tay. Thay thế: Railway, Fly.io, Google Cloud Run.

🔍 *"Free tier ngủ sau 15 phút, sao demo/bảo vệ?"* → Đã nâng **Starter** (không ngủ, luôn sẵn sàng). Với free thì cold start ~30s — chấp nhận demo, không dùng prod.

### I4. 🎓 "Vì sao Supabase cho DB + object storage?"
💬 Supabase = **PostgreSQL managed** (không đổi SQL/ORM một dòng) + **Object Storage tương thích S3** + backup/PITR + **connection pooler** — gom DB và lưu ảnh về một nhà, free tier hào phóng. Vì vẫn là Postgres chuẩn nên **không lock-in tầng truy vấn** (chuyển Neon/RDS/tự host chỉ đổi connection string).

🔍 *"'Tương thích S3' nghĩa là gì, sao quan trọng?"* → Dùng chung API/SDK (boto3) với AWS S3 và Cloudflare R2 → code `STORAGE_BACKEND=s3` chạy với cả ba chỉ bằng đổi endpoint/key, không sửa logic. Đó là lý do chọn chuẩn S3 thay vì SDK riêng của một hãng.

### I5. 🎓 "Upstash Redis đóng vai trò gì trong hệ thống? Bỏ đi có sao không?"
💬 Vai trò chính hiện tại: **kho đếm rate-limit dùng chung giữa các instance backend**. Khi scale ngang N replica, nếu đếm rate-limit **in-memory từng máy** thì mỗi máy có bộ đếm riêng → giới hạn "5 lần/phút" thành "5×N lần/phút" (**thủng rate-limit**). Đưa counter lên **Redis dùng chung** → giới hạn có hiệu lực trên **toàn cụm**. Upstash = Redis **serverless** (trả theo request, có free tier, TLS `rediss://`). Bỏ đi thì rate-limit chỉ đúng khi chạy đúng 1 instance.

🔍 *"Redis còn dùng cho gì nữa trong tương lai?"* → Đúng hướng phát triển: (1) **cache đọc nóng** cho `featured`/danh sách — **chính là bottleneck đo được ở load-test** (query nặng giữ kết nối DB); (2) **broker hàng đợi job nền** (Celery). Redis đã có sẵn nên thêm hai việc này dùng chung hạ tầng, không phải dựng mới.

### I6. 🎓 "Vì sao đặt model AI trên Hugging Face?"
💬 HF Space cho **chạy model ML** (CPU free, hoặc GPU trả phí), hỗ trợ **Docker** → đóng gói torch + weights chuẩn, có endpoint HTTP. Đúng "nhà" cho ML, hạ tầng model-friendly. Tách AI ra đây để **scale/deploy độc lập** tầng web (xem F4).

🔍 *"Cold start free tier ngủ ~48h — prod chịu được?"* → Không lý tưởng cho prod (request đầu chậm). Prod nên **giữ min-replica** (trả phí) hoặc dùng **HF Inference Endpoint** always-on. Demo thì gọi 1 request đánh thức trước.

### I7. 🎓 "Vì sao PostgreSQL (SQL) chứ không MongoDB/NoSQL?"
💬 Dữ liệu **quan hệ mạnh**: user–recipe–rating–comment–follow–meal_plan đầy khoá ngoại, cần **JOIN + ACID + nhất quán**. Postgres còn cho **full-text search** (`tsvector`) và **ARRAY/JSONB** (tag taxonomy linh hoạt). NoSQL mạnh ở schema-less/scale ghi khổng lồ nhưng **mất JOIN + nhất quán** — sai với bài toán nhiều quan hệ này.

🔍 *"JSONB thì khác gì NoSQL?"* → Có được **sự linh hoạt kiểu document ngay trong Postgres** (tag/facet lưu JSONB/ARRAY) mà **vẫn giữ ACID + JOIN** → "best of both", không cần thêm một DB thứ hai.

### I8. 🎓 "Vì sao FastAPI chứ không Django/Flask/Node.js?"
💬 (1) **Async** (asyncpg) → nhiều request I/O-bound (DB, gọi AI HTTP) chạy đồng thời; (2) **cùng hệ Python với AI** (torch) → không tách ngôn ngữ; (3) **pydantic** validate dữ liệu + **OpenAPI docs tự sinh**; (4) nhẹ, thuần REST. Django nặng + ORM đồng bộ; Flask thiếu async/validation sẵn; Node phải tách ngôn ngữ khỏi model.

🔍 *"Python có GIL — async có giải quyết được tải CPU không?"* → Không: async chỉ lợi **I/O-bound** (phần lớn request web là chờ DB/mạng). Tác vụ **CPU-bound** (inference) đã **tách sang service HF riêng**; tầng web chạy **nhiều worker/process** để tận CPU. Chính GIL là lý do KHÔNG để inference nặng trong tiến trình web.

### I9. 🎓 "Vì sao Next.js chứ không React thuần (Vite/CRA)?"
💬 Nội dung công thức cần **SEO** → Next.js cho **SSR/SSG** (render HTML sẵn cho bot index + share preview), **App Router** streaming, **image optimization**, **file-based routing**, **middleware/proxy** gác route auth. React+Vite thuần là CSR → khó SEO, phải tự dựng routing/SSR.

🔍 *"SSR có làm nặng server không?"* → Có chi phí render nhưng Vercel cache + edge giảm tải; trang tĩnh (SSG/ISR) gần như miễn phí. Đổi lại SEO + first-paint nhanh — đáng cho sản phẩm nội dung.

### I10. 🎓 "Phụ thuộc nhiều dịch vụ bên thứ ba — rủi ro vendor lock-in / một nhà sập thì sao?"
💬 Đã **chủ động giảm lock-in bằng chuẩn mở**: Postgres (đổi Neon/RDS/self-host = đổi URL), S3 API (đổi R2/MinIO), Redis protocol (đổi ElastiCache/self-host), Docker (chạy mọi nơi). Business logic **không gọi SDK độc quyền** của hãng nào — đều qua adapter/toggle. Các dịch vụ độc lập nhau nên chuyển **từng phần** được. Đánh đổi thật: nhiều dashboard, vận hành phân tán hơn dùng 1 nhà.

🔍 *"Observability xuyên nhiều nhà thì lần lỗi kiểu gì?"* → Đúng, đây là điểm khó của kiến trúc phân tán — log rải nhiều nơi. Hướng phát triển: **log/metrics tập trung** (OpenTelemetry → một backend như Grafana Cloud) + **correlation-id** xuyên request để trace một giao dịch qua các dịch vụ.

### I11. 🎓 "Chi phí khi user tăng thật — mô hình managed này có kinh tế không?"
💬 Hiện gần như **$0** (free tier). Khi tăng: managed đắt hơn tự-quản ở quy mô lớn (trả cho tiện lợi). Chiến lược: chạy free/rẻ tới khi có tải thật → khi đủ lớn, phần tốn nhất (thường **DB + AI GPU**) mới cân nhắc **tự quản** (K8s, GPU riêng). Kiến trúc portable nên **di trú dần** được, không làm lại từ đầu.

🔍 *"Điểm tốn tiền nhất khi scale là gì?"* → **AI GPU** (nếu chuyển GPU always-on) và **DB** (tier cao + replica); web/CDN tương đối rẻ. Tối ưu: **cache Redis** giảm hit DB, **batch/queue** giảm giờ GPU.

### I12. 🎓 "Dữ liệu người dùng (ảnh, email) nằm trên dịch vụ nước ngoài — vấn đề riêng tư/pháp lý?"
💬 Thừa nhận: dữ liệu ở Supabase/Vercel (hạ tầng cloud quốc tế). Hiện có: mật khẩu **băm bcrypt** (không lưu thô), token không lộ, HTTPS ở prod. **Chưa có:** chính sách quyền riêng tư đầy đủ, chức năng xoá tài khoản/dữ liệu theo yêu cầu (right-to-be-forgotten), kiểm soát region lưu trữ. Hướng phát triển cho sản phẩm thật: tuân thủ **Nghị định 13/2023 (bảo vệ dữ liệu cá nhân VN)/GDPR** — đồng ý xử lý dữ liệu, quyền xoá, chọn vùng lưu; cân nhắc host trong nước nếu cần chủ quyền dữ liệu.

🔍 *"Ảnh user upload có bị lộ không?"* → Bucket `uploads` đang **public-read** (để hiển thị ảnh công thức). Với ảnh riêng tư nên dùng **signed URL** (có hạn) + bucket **private** — hạng mục cần siết nếu có nội dung nhạy cảm.

---

# PHỤ LỤC — BẢNG TRA NHANH DẪN CHỨNG (khi thầy nói "chứng minh đi")

| Chủ đề | File / commit thật |
|---|---|
| Bcrypt + JWT type | `backend/app/core/security.py:9-41` |
| RBAC | `backend/app/core/deps.py:43-46` |
| Chống enumeration + tách cổng staff | `backend/app/services/auth_service.py:44-51` |
| Rate limiting | `backend/app/core/rate_limit.py` (commit `00b054d`) |
| Fail-fast SECRET_KEY | `backend/app/core/config.py` (commit `5833152`) |
| Validate upload | `backend/app/services/upload_service.py:14-37` |
| DB pool cấu hình | `backend/app/core/config.py:39-41`, `database.py:7-13` |
| Rate-limit Redis toggle | `config.py:34` (`RATE_LIMIT_STORAGE_URI`) |
| Object storage S3/R2 toggle | `config.py:46-52` (`STORAGE_BACKEND`) + `upload_service.py` |
| AI backend local/http toggle | `config.py:26-29`, `ai/factory.py`, `ai/http_predictor.py` |
| Service AI độc lập | `ai-service/app.py`, `Dockerfile`, `inference.py` |
| Health check ping DB | `backend/app/main.py` (commit `ad49885`), `tests/test_health.py` |
| Error envelope toàn cục | `backend/app/core/exceptions.py` (commit `40cd29f`, `b13e437`) |
| Không N+1 | `docs/superpowers/notes/2026-07-11-n-plus-one-audit.md` |
| Load test (Locust) | `backend/loadtest/locustfile.py` (commit `53f35dd`) — **đo cloud: ≤15 user 0% lỗi, p95 ~1,9s; trần ~15 do Supabase free** |
| Triển khai cloud thật | Vercel (FE) · Render (BE) · Hugging Face (AI) · Supabase (DB+storage) · Upstash (Redis) |
| Model AI 2 tầng | `backend/app/ai/inference.py` (`TastyVietnamPredictor`); sơ đồ `DATN_REPORT/diagrams/kientruc_2tang.puml`, `efficientnet_b0/b2*.png` |
| Ngưỡng tin cậy 0.5/0.6 | `inference.py:86-87` (`GROUP_/CLASS_CONFIDENCE_THRESHOLD`) |
| Đã bỏ fallback OpenAI | `app/services/ai_service.py:74` ("Đã bỏ fallback OpenAI Vision") |
| Chỉ số model | `backend/app/ai/model_metrics.json` (acc 81.9%, macro-F1 0.85, precision macro 0.958) |
| Notebook train (chi tiết) | `vnfood-hierarchical-training-kaggle-metrics.ipynb` — pretrained ImageNet, 3 pha unfreeze (LR 1e-3→1e-4→5e-5), AdamW + CosineAnnealing, label smoothing 0.1, augment |
| AI⊆Lookup | `ai_service._find_canonical_for_class` (103/103 resolve) |
| Pipeline duyệt (state machine) | `backend/app/services/recipe_service.py` |
| Tổng quan NFR | `docs/nfr-coverage.md` |
| Test suite (15 file) | `backend/tests/test_*.py` |

---

# CHIẾN THUẬT ĐỐI ĐÁP (đọc trước khi vào phòng)

1. **Luôn tách "đã làm" vs "hướng phát triển".** Thầy xoáy sâu để tìm chỗ bạn nói quá. Chủ động: "Cái này em đã làm thật ở `<file>`; cái kia là hướng phát triển vì <lý do YAGNI/quy mô>." → ăn điểm trung thực.
2. **Khi bị dồn về giới hạn, đừng chối — nêu lộ trình.** Mỗi giới hạn trong tài liệu này đều kèm sẵn "hướng khắc phục". Giới hạn + kế hoạch = chín chắn kỹ thuật.
3. **Neo vào file/commit/số liệu thật** (dùng bảng tra nhanh). Nói được tên file làm câu trả lời nặng ký.
4. **Kể "câu chuyện scale-ready".** Điểm mạnh nhất của đồ án với gu thầy này: 4 rào cản scale kinh điển (state, file cục bộ, model in-process, counter cục bộ) đều đã có đường thoát bằng toggle config — thiết kế sẵn để co giãn, không phải viết lại.
5. **Với câu bảo mật:** luôn nói theo cặp "phòng thủ hiện có → điểm yếu còn lại → lớp phòng thủ bổ sung". Bảo mật là nhiều lớp, không có viên đạn bạc.
6. **Với câu sự cố:** trả lời theo khung **Phát hiện → Cô lập → Phục hồi** cho tấn công, và **ACID/WAL → rollback → restore** cho mất điện.
7. **Đừng bịa con số.** Nếu chưa đo định lượng thì nói thẳng "đã dựng kịch bản Locust, đo trên cloud là bước tiếp theo" — thầy trọng sự trung thực hơn số liệu đẹp mà bịa.
