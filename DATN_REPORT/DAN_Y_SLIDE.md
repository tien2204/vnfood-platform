# Dàn ý slide bảo vệ ĐATN — TastyVietnam

> Đề tài: **Xây dựng website nhận diện ảnh món ăn và tư vấn nấu món ăn**
> Định hướng: **sản phẩm cuối là ứng dụng** (không có phần nghiên cứu) → theo mục 2.1 của hướng dẫn.
> Ràng buộc: 12–15 phút · **17 slide** (trong khoảng 15–18) · template HUST 4:3 · không copy-paste văn báo cáo · không trình bày theo chương · nêu rõ chức năng thêm mới so với báo cáo.

Tổng: **17 slide**. Đánh dấu 🖼️ = slide cần ảnh/biểu đồ.

---

## PHẦN ĐẦU

### Slide 1 — Trang bìa
- Tên đề tài: *Xây dựng website nhận diện ảnh món ăn và tư vấn nấu món ăn (TastyVietnam)*
- Sinh viên: Vũ Hữu Tiến — MSSV — lớp/chương trình Kỹ thuật Máy tính
- GVHD: PGS. TS. Nguyễn Thị Hoàng Lan
- Trường CNTT & TT — ĐHBK Hà Nội — 07/2026
- 🖼️ Logo HUST (có sẵn trong template)

### Slide 2 — Nội dung trình bày (Agenda)
- Mục tiêu đồ án
- Phân tích bài toán & giải pháp
- Thiết kế hệ thống (kiến trúc, use case, CSDL, hoạt động, lớp)
- Kết quả thử nghiệm
- Kết luận & hướng phát triển
- *(Nói: định vị đây là đề tài sản phẩm ứng dụng.)*

### Slide 3 — Mục tiêu đồ án
- **Đặt vấn đề:** công thức món Việt trên mạng phân mảnh, thiếu chuẩn hóa; tìm theo từ khóa; khi gặp món ngoài đời không biết tên để tra công thức.
- **Mục tiêu:** xây dựng ứng dụng web quản lý – chia sẻ công thức món Việt, **nhận diện món ăn từ ảnh** và gắn kết quả nhận diện với kho công thức để tư vấn nấu.
- 🖼️ (tùy chọn) 1 ảnh minh hoạ "chụp ảnh → ra công thức".

---

## PHẦN THÂN (mục 2.1 — sản phẩm ứng dụng)

### Slide 4 — Phân tích bài toán & giải pháp (1/2)
- **Bài toán 1 — Chuẩn hóa & tổ chức kho công thức:** dữ liệu thô lộn xộn → cào từ monngonmoingay.com, chuẩn hóa nguyên liệu/bước/thời gian/độ khó, gom theo định danh món, chọn công thức đại diện.
- **Bài toán 2 — Nhận diện món ăn từ ảnh nhiều lớp tương đồng:** hơn 100 món Việt, nhiều món giống nhau → **kiến trúc nhận diện hai tầng (coarse-to-fine)**.
- *(Nói: mỗi bài toán 1 câu "vì sao khó → chọn cách gì".)*

### Slide 5 — Phân tích bài toán & giải pháp (2/2)
- **Bài toán 3 — Gắn nhận diện với dữ liệu công thức:** tránh "tính năng rời rạc" → **ràng buộc bất biến**: kết quả nhận diện luôn ánh xạ về công thức có thật, nếu không thì báo "không nhận diện được".
- **Bài toán 4 — Đóng góp nội dung từ người dùng có kiểm soát:** quy trình đề xuất–duyệt thống nhất (tạo/sửa/xóa) qua kiểm duyệt của quản trị viên.
- **Công nghệ:** Next.js + FastAPI + PostgreSQL + PyTorch (EfficientNet).

### Slide 6 — Kiến trúc tổng quan hệ thống 🖼️
- 🖼️ **`figures/trienkhai.png`** (hoặc `pkg_phude.png`) — sơ đồ 3 lớp: Giao diện (Next.js) ↔ Dịch vụ (FastAPI, khối AI nhúng) ↔ CSDL (PostgreSQL); triển khai Docker.
- Bullet giải thích ngắn 3 thành phần + giao thức HTTP/JSON, xác thực JWT.

### Slide 7 — Phân tích chức năng (Use case) 🖼️
- 🖼️ **`figures/usecase_tong_quat.png`**
- 3 tác nhân: Khách / Người dùng / Quản trị viên.
- Nhóm chức năng: nhận diện, tra cứu, cộng đồng, kế hoạch bữa ăn, bản tin, quản trị.

### Slide 8 — Thiết kế cơ sở dữ liệu 🖼️
- 🖼️ **`figures/erd.png`** (ERD 13 bảng)
- Thực thể trung tâm `recipes` → nguyên liệu/bước; user, đánh giá, bình luận, kế hoạch bữa ăn, yêu cầu thay đổi (JSONB).

### Slide 9 — Thiết kế hoạt động: Nhận diện món ăn 🖼️
- 🖼️ **`figures/quytrinh_nhan_dien.png`** (biểu đồ hoạt động)
- Luồng: tải ảnh → tiền xử lý → 2 tầng EfficientNet → nếu đủ tin cậy: ánh xạ công thức; nếu không: **báo không nhận diện được**.

### Slide 10 — Thiết kế hoạt động: Đề xuất & duyệt công thức 🖼️
- 🖼️ **`figures/quytrinh_de_xuat_duyet_cong_thuc.png`**
- Người dùng gửi yêu cầu thay đổi (chờ duyệt) → Quản trị viên duyệt/từ chối → áp dụng vào kho.

### Slide 11 — Điểm nhấn: Kiến trúc nhận diện hai tầng 🖼️
- 🖼️ **`figures/kientruc_2tang.png`**
- Tầng 1: EfficientNet-B0 → 8 nhóm món. Tầng 2: EfficientNet-B2 chuyên biệt → món chi tiết.
- Vận dụng hướng phân cấp coarse-to-fine (HD-CNN, B-CNN). *(Nói: đây là một trong những đóng góp kỹ thuật chính.)*

### Slide 12 — Kiến trúc phần mềm (biểu đồ lớp) 🖼️
- 🖼️ **`figures/lopthietke_nhandien.png`**
- `AIService` điều phối `TastyVietnamPredictor` (B0+B2) → `DishResolver` → `RecipeService`.

---

## KẾT QUẢ THỬ NGHIỆM

### Slide 13 — Kết quả: Độ chính xác mô hình nhận diện 🖼️
- 🖼️ **`figures/cm_group.png`** (ma trận nhầm lẫn) hoặc bảng số.
- Bộ phân loại nhóm ~**92,48%**; các bộ phân loại món trong nhóm **89,95%–98,88%**.
- So sánh nhẹ: mô hình chuyên biệt (chạy cục bộ, chủ động ràng buộc công thức) vs API đa năng (phủ rộng nhưng khó ánh xạ công thức, tốn phí/độ trễ).

### Slide 14 — Kết quả: Màn hình chức năng chính 🖼️
- 🖼️ **`figures/man_trangchu.png`**, **`man_chitiet.png`** (trang chủ, chi tiết công thức)
- Kho ~47 công thức đại diện hiển thị công khai (gắn với 103 lớp AI).
- *(Nói qua tra cứu, lọc, chi tiết.)*

### Slide 15 — Kết quả: Nhận diện ảnh + Chế độ nấu 🖼️
- 🖼️ **`figures/man_nhandien.png`**, **`man_cachnau.png`**
- Chụp/tải ảnh → ra món + công thức chuẩn.
- **Chế độ nấu theo bước, đọc giọng nói (TTS), hẹn giờ đếm ngược.**

### Slide 16 — Kết quả: Kế hoạch bữa ăn, cộng đồng & quản trị 🖼️
- 🖼️ **`figures/man_kehoach.png`**, **`man_quantri.png`**
- Kế hoạch bữa ăn theo tuần + danh sách đi chợ tự động.
- Đánh giá/bình luận/lưu; **[Chức năng thêm mới so với báo cáo] Bản tin công thức qua email** (đăng ký/hủy, admin gửi).
- *(Guide yêu cầu nêu rõ chức năng bổ sung → nhấn mạnh bản tin email.)*

---

## PHẦN CUỐI

### Slide 17 — Kết luận & Cảm ơn
- **Đóng góp nổi bật:** quy trình liền mạch chụp ảnh → công thức → nấu → kế hoạch; ràng buộc nhất quán nhận diện–kho công thức; nhận diện 2 tầng.
- **Hạn chế:** mới chạy cục bộ; catalog phủ 47/103 lớp trên nguồn monngonmoingay.
- **Hướng phát triển:** đưa lên cloud; app di động; thay/kết hợp mô hình nhận diện bằng API đa phương thức (OpenAI/Gemini) để tăng độ bao phủ.
- Dòng cuối: **"Trân trọng cảm ơn các thầy cô đã lắng nghe."**
- *(Có thể tách Kết luận và Cảm ơn thành 2 slide → 18 slide, vẫn trong giới hạn.)*

---

## Lưu ý bám guide
- **Cần ảnh:** slide 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 (dùng file trong `figures/` — nhớ render lại các biểu đồ đã sửa: `usecase_tong_quat`, `kientruc_2tang`, `quytrinh_nhan_dien`, `lopthietke_nhandien`; chụp lại `man_cachnau` sau khi bỏ nút mic).
- Không copy nguyên câu từ báo cáo — bullet ngắn, tự nói phần diễn giải.
- Nêu rõ **chức năng thêm mới (bản tin email)** và **thay đổi (bỏ fallback OpenAI → "không nhận diện được")** khi trình bày.
- Tránh từ tuyệt đối ("tốt nhất") → dùng "một trong những…".
- Bỏ mục "Nội dung nghiên cứu" vì đề tài định hướng ứng dụng.
- Nếu thừa nội dung thiết kế → đưa vào **Phụ lục** slide.
