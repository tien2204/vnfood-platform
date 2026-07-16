# Kịch bản thuyết trình — ĐATN 20252

> **Đề tài:** Xây dựng website nhận diện ảnh món ăn và tư vấn nấu món ăn (TastyVietnam)
> **SV:** Vũ Hữu Tiến — 20225231 · **GVHD:** PGS. TS. Nguyễn Thị Hoàng Lan
> **File slide:** `DATN_REPORT/Vũ_Hữu_Tiến_DATN_20252.pptx` (24 slide: 1–18 trình bày · 19–24 dự phòng Q&A)
> **Thời lượng mục tiêu:** ~13–15 phút
>
> *Chữ thường = lời nói. Chữ nghiêng trong ngoặc = ghi chú thao tác/nhắc bản thân, KHÔNG đọc.*

---

## ⏱️ Phân bổ thời gian

| Phần | Slide | Phút |
|---|---|---|
| Mở đầu + Mục tiêu | 1–3 | 2 |
| Bài toán & giải pháp + Ưu điểm | 4–5 | 2,5 |
| Thiết kế hệ thống | 6–11 | 4 |
| Kết quả (NFR · Vận hành · Tải) | 12–14 | 3 |
| Kết luận + Hướng phát triển + Demo | 15–17 | 2,5 |
| Cảm ơn | 18 | 0,5 |

---

# PHẦN 1 — MỞ ĐẦU

### 🖼️ Slide 1 — Trang bìa
> Em kính chào thầy cô trong hội đồng ạ.
>
> Em là **Vũ Hữu Tiến**, mã số sinh viên **20225231**. Hôm nay em xin phép được trình bày đồ án tốt nghiệp với đề tài: **"Xây dựng website nhận diện ảnh món ăn và tư vấn nấu món ăn"**, dưới sự hướng dẫn của cô **Nguyễn Thị Hoàng Lan**. Sản phẩm của em có tên là **TastyVietnam**.
>
> Bài trình bày của em gồm 6 phần, kính mong thầy cô lắng nghe ạ.

### 🖼️ Slide 2 — Nội dung trình bày
> Nội dung em trình bày gồm 6 phần: **mục tiêu đồ án**; **phân tích bài toán và giải pháp**; **thiết kế hệ thống**; **kết quả thử nghiệm**; **hướng phát triển** và **kết luận**.
>
> Em xin bắt đầu với phần thứ nhất — mục tiêu đồ án.

### 🖼️ Slide 3 — Mục tiêu đồ án
> Về **đặt vấn đề**: hiện nay số người tự nấu ăn tại nhà ngày càng tăng, nhưng công thức món Việt trên mạng **rải rác và thiếu chuẩn hóa** — không thống nhất về định lượng, các bước, thời gian hay độ khó. Người dùng cũng khó lọc theo vùng miền hay loại món, và khó lưu lại để dùng sau.
>
> Đặc biệt, có một tình huống rất thực tế: **gặp một món ngoài đời nhưng không biết tên** thì không thể tìm kiếm bằng từ khóa được. Ngoài ra, nội dung đóng góp tự do trên mạng thiếu cơ chế kiểm soát chất lượng.
>
> Từ đó, **mục tiêu** của đồ án là: xây dựng một hệ thống web **tập trung** quản lý và chia sẻ công thức món Việt **đã chuẩn hóa**; **nhận diện món ăn từ ảnh** và gắn kết quả về kho công thức; tạo trải nghiệm **liền mạch**: phát hiện món → tra công thức → nấu.

---

# PHẦN 2 — BÀI TOÁN & GIẢI PHÁP

### 🖼️ Slide 4 — Phân tích bài toán và giải pháp
> Em xác định **3 bài toán** chính:
>
> **Bài toán 1 — chuẩn hóa và tổ chức kho công thức.** Giải pháp: em cào dữ liệu từ **monngonmoingay.com**, chuẩn hóa nguyên liệu, các bước, thời gian, độ khó về **một lược đồ thống nhất**; sau đó gom theo định danh món và tuyển một tập công thức tiêu biểu làm **tham chiếu chuẩn** cho mỗi lớp món.
>
> **Bài toán 2 — nhận diện hơn 100 món Việt, trong đó nhiều món trông rất giống nhau.** Giải pháp: dùng mạng **CNN EfficientNet phân cấp hai tầng** — tầng một phân nhóm món, tầng hai dùng mô hình chuyên biệt của nhóm để xác định món cụ thể.
>
> **Bài toán 3 — đóng góp nội dung có kiểm soát.** Giải pháp: xây quy trình **đề xuất → duyệt** thống nhất cho cả tạo, sửa, xóa, thông qua quản trị viên.
>
> *(Nếu slide có dòng công nghệ)* Về công nghệ, hệ thống dùng **Next.js, FastAPI, PostgreSQL, PyTorch (EfficientNet)**, xác thực **JWT**, đóng gói **Docker**, và triển khai trên nền tảng cloud managed.

### 🖼️ Slide 5 — Ưu điểm so với thị trường
> Trên thị trường hiện có **3 nhóm sản phẩm** gần với đề tài của em:
>
> **Nhóm 1** là các app công thức Việt như **Cooky, Feedy, Món Ngon Mỗi Ngày** — thư viện rất lớn, nhưng **không có AI nhận diện ảnh** và **không có công thức chuẩn cho từng món**; người dùng vẫn phải tự gõ tên món.
>
> **Nhóm 2** là các app AI nhận diện món ăn như **SnapCalorie, Foodvisor** — AI ảnh mạnh, nhưng mục tiêu là **đếm calo, không ra công thức**, và **yếu với món Việt**. Chụp phở thì họ chỉ trả về "noodle soup" kèm calo, chứ không ra cách nấu phở.
>
> **Nhóm 3** là các app lập kế hoạch bữa ăn như **Samsung Food, Mealime** — meal-plan rất chỉn chu, nhưng **thiên món phương Tây**, ít món Việt, không nhận diện ảnh và **thu phí**.
>
> **Điểm khác biệt của em:** không sản phẩm nào đứng ở **giao điểm của cả ba trục**: AI nhận diện món Việt chuyên biệt **103 lớp** dẫn thẳng tới công thức chuẩn; meal-plan và đi chợ; cộng đồng có kiểm duyệt — tất cả **tiếng Việt và miễn phí**.
>
> *(Nếu thầy hỏi thẳng "đối thủ mạnh hơn em ở đâu" → trả lời trung thực: họ hơn về quy mô nội dung và độ chín sản phẩm; đồ án chọn thắng ở **chiều sâu bản địa hóa + tích hợp end-to-end**, không đua chiều rộng.)*

---

# PHẦN 3 — THIẾT KẾ HỆ THỐNG

### 🖼️ Slide 6 — Kiến trúc tổng quan
> Hệ thống được thiết kế theo hướng **tách tầng, managed cloud, sẵn sàng scale ngang**:
>
> - **Frontend** là Next.js chạy trên **Vercel**, có CDN edge.
> - **Backend** là FastAPI chạy trên **Render** — thiết kế **stateless**, phía trước có load balancer.
> - **Tầng AI** — mô hình EfficientNet — được **tách riêng** thành một service trên **Hugging Face**, backend gọi qua **HTTP**.
> - **Dữ liệu** dùng **Supabase** cho PostgreSQL và object storage; **Upstash Redis** cho rate-limit dùng chung.
>
> Các thành phần giao tiếp qua **REST/JSON**, xác thực bằng **JWT stateless** — nhờ đó backend có thể **nhân bản nhiều replica** phía sau load balancer mà không cần session dính.
>
> *(Nhấn: đây là kiến trúc **đã deploy thật**, không phải đề xuất trên giấy.)*

### 🖼️ Slide 7 — Use case tổng quát
> Đây là biểu đồ use case tổng quát. Hệ thống có **3 nhóm tác nhân**: **khách**, **người dùng đã đăng nhập** và **quản trị viên**.
>
> Khách có thể duyệt, tìm kiếm công thức và dùng AI nhận diện. Người dùng đăng nhập thì thêm các chức năng: lưu công thức, đánh giá, bình luận, theo dõi người khác, lập kế hoạch bữa ăn và **đăng công thức**. Quản trị viên phụ trách **duyệt nội dung** và quản lý hệ thống.

### 🖼️ Slide 8 — Thiết kế cơ sở dữ liệu (ERD)
> Đây là lược đồ cơ sở dữ liệu. Thực thể trung tâm là **recipe** (công thức), liên kết với **user**, **rating**, **comment**, **saved**, **meal_plan** và các bảng phân loại.
>
> Em xin nhấn mạnh vài trường quan trọng trên bảng recipe: `is_canonical` đánh dấu **công thức chuẩn**, `canonical_dish_slug` là **định danh món chuẩn**, và `ai_class_slug` **nối công thức với lớp mà AI nhận diện**. Ba trường này chính là **trục xương sống** gắn AI với kho công thức.

### 🖼️ Slide 9 — Thiết kế hoạt động: Nhận diện món ăn
> Đây là luồng nhận diện. Người dùng **tải ảnh lên** → ảnh được **tiền xử lý** → đưa vào **hai tầng EfficientNet** để dự đoán.
>
> Nếu **đủ tin cậy**, hệ thống **ánh xạ về công thức chuẩn** của món đó và hiển thị kèm các công thức gợi ý. Nếu **không đủ tin cậy**, hệ thống **báo "không nhận diện được"** thay vì đoán bừa — vì đưa nhầm công thức còn tệ hơn là nói không biết.

### 🖼️ Slide 10 — Thiết kế hoạt động: Đề xuất & duyệt công thức
> Đây là quy trình kiểm soát chất lượng nội dung cộng đồng. Người dùng gửi **"yêu cầu thay đổi"** — có thể là tạo mới, sửa hoặc xóa — công thức chuyển sang trạng thái **chờ duyệt**.
>
> Quản trị viên **duyệt** hoặc **từ chối kèm lý do**. Chỉ khi được duyệt thì thay đổi mới được áp vào kho và hiển thị công khai. Quy trình này **thống nhất cho cả tạo, sửa, xóa**, và được kiểm soát ở phía server.

### 🖼️ Slide 11 — Kiến trúc nhận diện hai tầng *(điểm nhấn)*
> Đây là **điểm nhấn kỹ thuật** của đồ án.
>
> **Tầng 1** dùng **EfficientNet-B0**, ảnh 224×224, phân ảnh vào **1 trong 8 nhóm món** — ví dụ Bánh, Bún/Phở, Cơm, Canh…
>
> **Tầng 2**: mỗi nhóm có **một mô hình EfficientNet-B2 riêng**, ảnh 260×260, chỉ chuyên phân biệt các món **trong nhóm đó**.
>
> Đây là hướng **coarse-to-fine** — từ thô đến tinh. Ý tưởng cốt lõi: thay vì bắt một mô hình phân biệt cùng lúc 103 lớp, em **chia thành các bài toán con dễ hơn** — mỗi mô hình con chỉ lo khoảng 10 đến 30 lớp tương đồng, nhờ đó **độ chính xác cao hơn**.
>
> Hệ thống còn có **hai chốt tin cậy**: nếu độ tin cậy nhóm dưới **0,5** hoặc độ tin cậy món dưới **0,6** thì báo không nhận diện được — tránh đoán sai.

---

# PHẦN 4 — KẾT QUẢ

### 🖼️ Slide 12 — Yêu cầu phi chức năng
> Về **yêu cầu phi chức năng**, em xin trình bày hệ thống giải quyết từng nhóm như thế nào:
>
> - **Hiệu suất:** FastAPI bất đồng bộ, connection pool, phân trang có giới hạn, eager-load để **không bị N+1 query**, và CDN cho tài nguyên tĩnh.
> - **Bảo mật:** mật khẩu băm **bcrypt**; **JWT** access/refresh; phân quyền **RBAC**; **rate-limit** chống dò mật khẩu; chặn `SECRET_KEY` yếu ngay khi khởi động; dùng **ORM** nên chống được SQL injection; CORS whitelist; HTTPS ở production.
> - **Độ tin cậy:** mọi lỗi đều trả về **một định dạng thống nhất**, không làm sập ứng dụng; **rollback giao dịch** khi lỗi nên dữ liệu không hỏng; **health check ping database thật** nên load balancer loại được instance hỏng; có **backup và PITR** để khôi phục sau sự cố.
> - **Khả năng sử dụng:** đầy đủ trạng thái loading/rỗng/lỗi; giao diện tiếng Việt; responsive; hỗ trợ accessibility.
> - **Bảo trì & mở rộng:** backend **stateless** nên scale ngang được; storage, rate-limit, database và AI đều **đổi được qua biến môi trường**; schema quản lý phiên bản bằng migration.

### 🖼️ Slide 13 — Vận hành
> Về vận hành, em xin nói 4 khía cạnh mà hệ thống thực tế phải đối mặt:
>
> **Sao lưu và phục hồi** — cho tình huống mất điện hoặc sự cố: database có **backup tự động và Point-in-time Recovery**; ứng dụng **stateless** nên khởi động lại là phục hồi; có health check để tự loại và khởi động lại instance hỏng.
>
> **Phòng chống xâm nhập:** rate-limit theo IP cho đăng nhập và AI để chống brute-force; mật khẩu băm bcrypt; JWT có hạn kèm refresh; phân quyền RBAC; thông báo lỗi **không lộ thông tin nội bộ**; HTTPS ở production.
>
> **Điều độ:** dùng **slowapi** giới hạn số request theo IP cho các nhóm auth, AI và newsletter. Hàng đợi job nền là hướng phát triển.
>
> **Cân bằng tải:** Render có sẵn **load balancer** trước backend; vì backend stateless nên **scale ngang N replica** được, autoscale bật khi cần. Đồng thời em **tách tầng AI ra riêng** — vì tải AI nặng và lệch, còn tải web nhẹ và đều; để chung thì AI sẽ làm nghẽn web, tách ra thì **mỗi tầng cân bằng và mở rộng độc lập**.

### 🖼️ Slide 14 — Kiểm thử tải *(slide dễ bị xoáy — nói thật)*
> Em có thực hiện **kiểm thử tải trên chính bản deploy cloud** bằng công cụ **Locust**, nhắm vào các API đọc nhiều nhất.
>
> Kết quả: ở mức **15 người dùng đồng thời trở xuống**, hệ thống chạy **ổn định, 0% lỗi**, thời gian phản hồi trung vị khoảng **0,7 giây**, p95 khoảng **1,9 giây**.
>
> Khi tăng dần, hệ thống **bão hòa ở khoảng 15 kết nối đồng thời**; vượt qua đó bắt đầu có lỗi, và ở 50 người thì khoảng 30% request lỗi.
>
> Em đã **truy được nguyên nhân**: đây là **trần kết nối của gói Supabase miễn phí**, **không phải giới hạn của kiến trúc** — vì connection pool phía ứng dụng cho phép nhiều hơn thế. Hướng gỡ rất rõ: **nâng gói database**, **thêm cache Redis** cho các truy vấn đọc nóng, và **bật autoscale nhiều replica** — vì backend đã stateless sẵn.
>
> *(Nếu bị hỏi "sao số thấp vậy" → đừng phòng thủ. Nhấn: **số phản ánh giới hạn hạ tầng miễn phí**, và giá trị nằm ở chỗ **đo được, chỉ đúng nút thắt, biết cách gỡ**.)*

---

# PHẦN 5 — KẾT LUẬN & HƯỚNG PHÁT TRIỂN

### 🖼️ Slide 15 — Kết luận
> **Sau đây là phần kết luận ạ.**
>
> Về **đóng góp nổi bật**, đồ án đạt được:
> - Một **quy trình liền mạch**: chụp ảnh → ra công thức → nấu → lên kế hoạch bữa ăn.
> - **Ràng buộc nhất quán giữa nhận diện và kho công thức** — mọi lớp AI nhận diện được đều chắc chắn có công thức tương ứng trong hệ thống.
> - **Kiến trúc nhận diện hai tầng** giúp tăng độ chính xác trên bài toán nhiều lớp tương đồng.
>
> Về **hạn chế**, em xin nêu thẳng: dữ liệu hiện **chỉ cào từ một nguồn** nên độ đa dạng còn hạn chế; mô hình hai tầng có **lỗi lan truyền** — nếu tầng nhóm sai thì tầng món sai theo; và trên **hạ tầng miễn phí**, ngưỡng chịu tải an toàn mới khoảng 15 người đồng thời.
>
> *(Giữ giọng bình thản. Nêu hạn chế xong **luôn gắn hướng khắc phục** ở slide sau.)*

### 🖼️ Slide 16 — Hướng phát triển
> Từ những hạn chế đó, em có các hướng phát triển:
>
> **Về khả năng chịu tải:** nâng gói hạ tầng và bật **autoscale nhiều replica**; thêm **cache Redis** cho các truy vấn đọc nóng — chính là nút thắt em đã đo được; đưa **AI lên GPU và xử lý theo lô**; dùng **hàng đợi job nền** cho tác vụ nặng.
>
> **Về tính năng:** phát triển **ứng dụng di động** tận dụng camera; **blog cộng đồng có kiểm duyệt**; cá nhân hóa gợi ý theo nhu cầu dinh dưỡng; **mở rộng nguồn dữ liệu** thay vì một nguồn như hiện tại.
>
> **Về mô hình:** cải tiến kiến trúc từ định tuyến cứng sang **Soft Mixture-of-Experts** để loại bỏ điểm gãy "nhóm sai thì món sai".

### 🖼️ Slide 17 — Link Demo
> Hệ thống hiện đã được **triển khai thật** và có thể truy cập công khai tại địa chỉ này ạ. Thầy cô có thể vào trực tiếp để trải nghiệm chức năng nhận diện món ăn.
>
> *(Nếu demo trực tiếp: **đánh thức AI service trước khi vào phòng** để tránh cold start. Chuẩn bị sẵn 1–2 ảnh món rõ nét: bánh mì, phở.)*

### 🖼️ Slide 18 — Cảm ơn
> Phần trình bày của em đến đây là kết thúc.
>
> Em xin chân thành **cảm ơn cô Nguyễn Thị Hoàng Lan** đã tận tình hướng dẫn em trong suốt quá trình thực hiện đồ án, và **cảm ơn thầy cô trong hội đồng** đã lắng nghe.
>
> Em rất mong nhận được **các ý kiến đóng góp** từ thầy cô để hoàn thiện đồ án ạ. Em xin sẵn sàng trả lời câu hỏi.

---

# SLIDE DỰ PHÒNG (19–24) — chỉ mở khi được hỏi

| Slide | Mở khi thầy hỏi về |
|---|---|
| **19. Thiết lập thực nghiệm** | Tập dữ liệu, cách chia train/test |
| **20. Cấu hình & cách huấn luyện** | Siêu tham số, cách train |
| **21. Kiến trúc EfficientNet-B0/B2** | Chi tiết mạng, MBConv, số kênh, tham số |
| **22. Vì sao chọn kiến trúc hai tầng** | Lý do phân cấp, so với model phẳng |
| **23. Độ chính xác mô hình** | Con số accuracy từng tầng |
| **24. Phụ lục 8 nhóm & các món** | "8 nhóm gồm những món gì?" |

**Câu chuyển mượt khi dùng slide dự phòng:**
> "Dạ, em có chuẩn bị slide cho phần này ạ, em xin phép chuyển tới slide phụ lục."

---

# ⚠️ NHẮC TRƯỚC KHI VÀO PHÒNG

1. **Thứ tự slide đang là Kết luận (15) → Hướng phát triển (16)**, nhưng slide "Nội dung trình bày" (slide 2) lại liệt kê **Hướng phát triển trước, Kết luận sau**. → Nên **sửa cho khớp** một trong hai, kẻo thầy để ý.
2. **Đánh thức Hugging Face Space** trước buổi bảo vệ (gọi 1 request nhận diện) — tránh request đầu chậm do cold start.
3. **Số liệu phải nhất quán:** load-test là **~15 người / p95 1,9s / 0% lỗi** (cloud). Đừng nói số local cũ.
4. **Nguyên tắc vàng:** luôn tách rõ **"đã làm thật"** vs **"hướng phát triển"**. Cache Redis và autoscale là **hướng phát triển**, không nói như đã có.
5. Chi tiết đối đáp Q&A: xem `docs/thesis/phan-bien-he-thong.md` (9 nhóm câu hỏi A–I).
