# Kiểm thử phi chức năng — Load Test (Hiệu năng)

> Ngày: 2026-07-12 · Công cụ: Locust 2.45 · Nhánh: `feat/scalability`

## Mục tiêu
Đo hiệu năng luồng **browse/read** (hot path, chiếm phần lớn traffic thực) của VNFood
dưới tải đồng thời, lấy số liệu định lượng: throughput (req/s), độ trễ (p50/p95/p99),
tỉ lệ lỗi, và xác định điểm nghẽn.

Cố tình **không** đo endpoint AI (`/ai/recognize`) — mỗi request load model, thuộc tầng
scale riêng; đo chung sẽ làm sai lệch chỉ số read path.

## Cấu hình test
| Thông số | Giá trị |
|---|---|
| Kiến trúc | **1 instance** (single-node), localhost dev |
| Người dùng ảo (VU) | 100, ramp 20 VU/s |
| Thời lượng | 60 giây |
| Think-time | 0.5–1.5s/request |
| Kịch bản | list (weight 3) + detail (weight 2) + health (weight 1) |
| Dữ liệu | ~22k recipe thật trong Postgres |

## Kết quả

| Endpoint | req/s | p50 | p95 | p99 | max | Lỗi |
|---|---|---|---|---|---|---|
| `/recipes` (list) | 28.5 | 630ms | 2700ms | 4200ms | 4455ms | 0% |
| `/recipes/{id}` (detail) | 19.2 | 720ms | 1600ms | 2200ms | 4222ms | 0% |
| `/health` | 9.1 | 110ms | 360ms | 580ms | 695ms | 0% |
| **Tổng hợp** | **56.7** | **600ms** | **1800ms** | **3800ms** | **4455ms** | **0%** |

Tổng: **3.386 request, 0 lỗi** trong 60s.

## Diễn giải (cho bảo vệ)
1. **Ổn định:** 1 instance chịu 100 user đồng thời với **0% lỗi** — không sập, không nghẽn
   rate-limit trên read path (rate-limit chỉ áp auth/AI, đúng thiết kế).
2. **Điểm nghẽn = `/recipes` list** (p95 2.7s): query có `COUNT` + lọc facet nặng nhất.
   → Hướng tối ưu: **cache kết quả list (Redis)** + **read replica** khi scale.
3. **Latency cao dưới tải** (p95 1.8s tổng hợp) là giới hạn của **1 node trên laptop dev**;
   đây chính là lý do cần **scale ngang** (nhiều instance sau load balancer) — mỗi instance
   thêm vào nhân throughput lên gần tuyến tính vì app đã stateless (JWT).
4. **`/health` nhanh** (p95 360ms) xác nhận overhead framework/DB-ping thấp; độ trễ nằm ở
   query nghiệp vụ, không phải tầng HTTP.

## Kết luận
Baseline single-node: **~57 req/s, p95 ~1.8s, 0% lỗi** với 100 VU. Hệ thống ổn định nhưng
latency cho thấy cần caching + scale ngang để phục vụ tải lớn — khớp với kiến trúc mở rộng
đã thiết kế (`docs/nfr-coverage.md`, mục Scalability).

## Tái chạy
```bash
# venv riêng cho locust (tránh xung đột urllib3 với boto3 trong venv backend)
python -m venv loadtest-venv && loadtest-venv/Scripts/pip install locust
# backend phải đang chạy ở :8000
cd backend
locust -f loadtest/locustfile.py --host http://localhost:8000 \
       --headless -u 100 -r 20 --run-time 60s \
       --html loadtest/report.html --csv loadtest/results
```
Report HTML (có biểu đồ để chụp slide): `backend/loadtest/report.html`.
