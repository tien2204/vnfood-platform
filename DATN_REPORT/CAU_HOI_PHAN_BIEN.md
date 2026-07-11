# Bộ câu hỏi phản biện & trả lời — Đồ án "Website nhận diện ảnh món ăn và tư vấn nấu món ăn"

> Soạn theo góc nhìn một giảng viên phản biện có chuyên môn về học sâu (CNN) và kỹ thuật phần mềm web, kiểm tra sinh viên có thực sự nắm từng thành phần, luồng dữ liệu và cách hoạt động của hệ thống.
> Mỗi câu gồm: **[Ý đồ câu hỏi]** → **Trả lời** (kèm file/đường dẫn code khi cần).
> Stack: Next.js 14 (frontend) · FastAPI + PyTorch (backend) · PostgreSQL · JWT.

---

## A. Vấn đề & động lực (Bài toán cần giải quyết)

**A1. Em phát biểu lại trong một câu: bài toán cốt lõi đồ án giải quyết là gì?**
Hệ thống rút ngắn hành trình *"nhìn thấy một món ăn → biết nấu món đó"*. Cụ thể giải quyết 2 nút thắt: (1) công thức món Việt trên mạng phân mảnh, thiếu chuẩn hóa (định lượng, bước, thời gian, độ khó); (2) khi gặp món không biết tên thì không tra cứu bằng từ khóa được. Đồ án gộp một kho công thức đã chuẩn hóa với một mô-đun nhận diện món từ ảnh, và ràng buộc kết quả nhận diện luôn trỏ về công thức có thật.

**A2. Vì sao đây là vấn đề đáng làm, chứ không phải chỉ là "một web công thức nữa"?**
Điểm khác biệt nằm ở *ràng buộc nhận diện ↔ dữ liệu công thức*. Các web công thức hiện có tìm bằng text; các API nhận diện ảnh đa năng thì trả nhãn tự do, không đảm bảo nhãn đó có công thức tương ứng trong hệ thống. Đồ án đóng vòng lặp này: ảnh → nhãn món → công thức chuẩn cụ thể, và nếu không chắc thì báo "không nhận diện được" thay vì đoán bừa — đó là giá trị nghiệp vụ, không chỉ là tính năng.

**A3. Ai là người dùng mục tiêu? Kịch bản dùng điển hình?**
Người nấu ăn tại nhà, đặc biệt người trẻ/ít kinh nghiệm. Kịch bản: (a) chụp/tải ảnh một món → nhận gợi ý công thức; (b) duyệt–tìm–lọc công thức theo vùng miền/loại món/khẩu phần; (c) lập kế hoạch bữa ăn theo tuần và tự sinh danh sách đi chợ; (d) đóng góp công thức mới qua quy trình duyệt.

**A4. Nếu chỉ dùng Google Image Search / tìm ảnh ngược thì đã đủ chưa, cần gì hệ thống này?**
Tìm ảnh ngược trả về *trang web chứa ảnh giống*, không trả về *công thức đã chuẩn hóa gắn với món*. Hệ thống này phân loại vào tập lớp món Việt xác định rồi ánh xạ trực tiếp sang công thức trong CSDL của mình (có nguyên liệu, bước, thời gian, độ khó), phục vụ tiếp các chức năng nấu/kế hoạch/đi chợ — điều mà kết quả tìm ảnh ngoài không làm được.

**A5. Phạm vi đồ án dừng ở đâu? Có gì em chủ động KHÔNG làm?**
Chạy trong môi trường phát triển cục bộ (chưa deploy cloud). Kho công thức tham chiếu lấy từ nguồn monngonmoingay, phủ ~47/103 lớp AI có công thức canonical. Không làm app di động native (chỉ web responsive), không làm gợi ý dinh dưỡng cá nhân hóa nâng cao. Những phần này để ở "hướng phát triển".

---

## B. Mục tiêu, lựa chọn hướng đi & công nghệ

**B1. Vì sao chọn kiến trúc client–server tách biệt (Next.js + FastAPI) mà không làm một app monolith?**
Ba lý do: (1) tách mối quan tâm — frontend lo trải nghiệm, backend lo dịch vụ + AI; (2) khối AI PyTorch nặng, cần chạy phía server có thể gắn GPU, không thể đẩy xuống trình duyệt; (3) giao tiếp HTTP/JSON chuẩn hóa để sau này thay client (ví dụ app mobile) mà không sửa backend.

**B2. Vì sao backend chọn FastAPI (Python) chứ không phải Node/Java?**
Mô hình PyTorch và toàn bộ pipeline tiền xử lý ảnh nằm trong hệ sinh thái Python. Đặt inference cùng ngôn ngữ với API tránh phải serialize/gọi chéo tiến trình. FastAPI cho async I/O (phù hợp truy vấn DB bất đồng bộ) và tự sinh tài liệu OpenAPI. Khối AI được **nhúng trực tiếp** trong tiến trình FastAPI (không tách microservice) để đơn giản hóa ở phạm vi đồ án — xem `app/main.py` lifespan nạp model một lần lúc khởi động.

**B3. Vì sao chọn EfficientNet mà không phải ResNet/ViT?**
EfficientNet cân bằng tốt độ chính xác/tham số nhờ compound scaling, phù hợp tập dữ liệu vừa và chạy suy luận cục bộ không cần GPU quá mạnh. B0 (nhẹ) đủ cho tầng phân nhóm coarse; B2 (lớn hơn) cho tầng phân món fine cần độ phân giải/biểu diễn cao hơn. ViT thường cần dữ liệu lớn hơn để không overfit — không phù hợp quy mô dữ liệu đồ án.

**B4. Tại sao chọn task "nhận diện món ăn" làm trọng tâm mà không phải, ví dụ, gợi ý công thức bằng NLP?**
Vì đó chính là nút thắt chưa được giải: text search đã phổ biến, còn "từ ảnh ra công thức" thì các hệ thống công thức tiếng Việt gần như bỏ trống. Task này cũng là nơi có đóng góp kỹ thuật rõ ràng (kiến trúc 2 tầng) và có ràng buộc nghiệp vụ thú vị (ánh xạ về công thức có thật).

**B5. Xác thực dùng JWT tự quản, vì sao không dùng session server hay OAuth provider?**
JWT stateless hợp với kiến trúc tách biệt: backend không giữ session store, mỗi request tự mang token. Ở phạm vi cục bộ, tự quản JWT đủ và minh bạch để trình bày. Access token 60 phút, refresh token 7 ngày, thuật toán HS256 — xem `app/core/security.py` và `app/core/config.py`.

---

## C. Kiến trúc mô hình AI hai tầng (phần lõi — hỏi sâu)

**C1. Mô tả chính xác kiến trúc hai tầng. Tầng 1 và tầng 2 làm gì, dùng model nào?**
- **Tầng 1 (coarse):** EfficientNet-**B0**, phân ảnh vào 1 trong **8 nhóm món** (BANH, BUN_PHO, COM, MON_KHO_NUONG, CANH_CHAO, XOI, GOI_CUON, DAC_BIET).
- **Tầng 2 (fine):** mỗi nhóm có một EfficientNet-**B2** *chuyên biệt* chỉ phân biệt các món trong nhóm đó.
Ảnh đi qua tầng 1 để chọn nhóm, rồi nạp đúng model con của nhóm để ra món cụ thể. Code: `app/ai/inference.py`, lớp `TastyVietnamPredictor`. Bản đồ nhóm→trọng số ở `app/ai/class_names.py` (`GROUP_TO_WEIGHT`).

**C2. Vì sao phải hai tầng? Một model phẳng 103 lớp có gì dở?**
Nhiều món Việt rất giống nhau về hình thức nhưng khác nhóm; một classifier phẳng 100+ lớp phải phân biệt tất cả cùng lúc, ranh giới lớp mờ, dễ nhầm. Chia phân cấp thì mỗi model con chỉ phân biệt số lớp nhỏ *trong cùng nhóm* → không gian quyết định đơn giản hơn, độ chính xác từng model con cao hơn. Đây là vận dụng ý tưởng coarse-to-fine kiểu HD-CNN / B-CNN.

**C3. Nhược điểm cố hữu của kiến trúc phân cấp là gì? Em xử lý ra sao?**
**Lỗi tích lũy (error propagation):** nếu tầng 1 chọn sai nhóm thì tầng 2 chắc chắn sai — không có đường quay lại. Giảm thiểu bằng: (1) ngưỡng tin cậy ở tầng 1 — nếu độ tin cậy nhóm < 0.5 thì dừng và báo "không nhận diện được", không ép tầng 2; (2) tầng 2 cũng có ngưỡng riêng. Ngưỡng ở `inference.py`: `GROUP_CONFIDENCE_THRESHOLD = 0.5`, `CLASS_CONFIDENCE_THRESHOLD = 0.6`.

**C4. Hai ảnh đầu vào của tầng 1 và tầng 2 có giống nhau không?**
Khác kích thước resize, khớp với lúc train từng model: tầng 1 (B0) resize **224×224**, tầng 2 (B2) resize **260×260**. Cùng chuẩn hóa theo mean/std ImageNet. Xem `_GROUP_TRANSFORM` và `_SUB_TRANSFORM` trong `inference.py`. Không CenterCrop — resize thẳng để trùng transform lúc validate khi train.

**C5. Thứ tự lớp (index → tên món) ở tầng 2 lấy từ đâu? Nếu lệch thì sao?**
Đây là điểm dễ sai và em kiểm soát rõ: tên lớp trong checkpoint được lưu theo `sorted(GROUP_CLASSES[group])`, đúng thứ tự lúc train. Khi nạp, nếu checkpoint có `class_names` thì dùng, nếu không thì fallback `sorted(GROUP_CLASSES[gname])` — phải là `sorted` để trùng huấn luyện, nếu không index sẽ ánh xạ nhầm tên món. Xem `inference.py` dòng nạp `sub_class_names`.

**C6. Model được nạp lúc nào? Mỗi request có nạp lại không?**
Nạp **một lần lúc khởi động** trong `lifespan` của `app/main.py` (`set_predictor(TastyVietnamPredictor(...))`), giữ trong biến toàn cục ở `app/ai/state.py`. Mỗi request chỉ gọi `get_predictor()` lấy instance đã sẵn sàng — không nạp lại. Nếu model chưa nạp, `get_predictor()` trả 503 "AI models chưa sẵn sàng".

**C7. `@torch.no_grad()` trên hàm `predict` để làm gì?**
Tắt việc dựng đồ thị tính đạo hàm khi suy luận — không cần backward, nên tiết kiệm bộ nhớ và nhanh hơn. Kèm `model.eval()` (đặt lúc nạp) để BatchNorm/Dropout chạy ở chế độ inference.

**C8. Đầu ra thô của mạng là logit hay xác suất? Em chuyển thế nào?**
Mạng cho logit; em áp `F.softmax(..., dim=1)` để ra phân phối xác suất trên các lớp, rồi lấy `max` cho nhóm và `topk(5)` cho món (top-5). Độ tin cậy dùng để so ngưỡng chính là xác suất softmax của lớp top-1.

**C9. "Confidence" của em có phải xác suất thật (well-calibrated) không?**
Không hẳn — softmax của mạng CNN thường *over-confident*, không phải xác suất hiệu chuẩn. Em dùng nó như một *điểm tin cậy tương đối* để đặt ngưỡng chặn, không tuyên bố là xác suất đúng thực tế. Hiệu chuẩn (temperature scaling) là một hướng cải thiện tương lai.

**C10. Tại sao ngưỡng nhóm (0.5) lại thấp hơn ngưỡng món (0.6)?**
Nhóm chỉ có 8 lớp nên xác suất phân bổ "đặc" hơn, 0.5 đã là tín hiệu đủ mạnh để tin. Món có nhiều lớp cạnh tranh hơn, cần rào cao hơn (0.6) để chấp nhận là "chắc chắn". Ngoài ra còn một mức "tentative" 0.4 (mục D).

**C11. Nếu đưa vào một ảnh KHÔNG phải món ăn (ví dụ ảnh con mèo) thì hệ thống phản hồi gì?**
Mạng vẫn cho một phân phối softmax nào đó, nhưng nhiều khả năng độ tin cậy nhóm < 0.5 hoặc độ tin cậy món < ngưỡng → cờ `needs_fallback=True` → hệ thống trả `display_name = "Không nhận diện được"`, `confidence = 0.0`. Đây là hành vi thiết kế: thà từ chối còn hơn đoán bừa. (Hạn chế: không có lớp "không phải món ăn" chuyên biệt — ảnh lạ có thể lọt nếu tình cờ cho confidence cao; đây là điểm em thừa nhận.)

---

## D. Ràng buộc nhận diện ↔ công thức (điểm nghiệp vụ mấu chốt)

**D1. "Ánh xạ về công thức có thật" nghĩa là gì về mặt kỹ thuật?**
Kết quả nhận diện là một *slug lớp* (vd `pho`, `banh-mi`). Hệ thống chỉ chấp nhận kết quả nếu slug đó **có công thức canonical** trong CSDL (`is_canonical=True`, `status='approved'`, `source='monngonmoingay'`, `canonical_dish_slug = slug`). Ánh xạ này ở `app/services/ai_service.py::_find_canonical_for_class`. Nếu không có công thức tương ứng, kết quả không được "nâng" lên mức tin cậy.

**D2. Ba mức "tier" của kết quả nhận diện là gì? Quyết định ở đâu?**
Ở `app/services/dish_resolver.py::resolve_vnfood`:
- **confident:** độ tin cậy món ≥ 0.6 → nhận.
- **tentative:** 0.4 ≤ độ tin cậy < 0.6 **và** slug đó có công thức canonical (`has_canonical(slug)`) → nhận dè dặt.
- **(None)** → không đủ tin cậy → trả "không nhận diện được".
Tức là ở vùng mờ 0.4–0.6, sự tồn tại của công thức canonical chính là "bằng chứng phụ" để dám nhận.

**D3. `has_canonical` biết một slug có canonical hay không bằng cách nào? Query DB mỗi lần?**
Không query mỗi lần. Lúc khởi động, `app/services/canonical_coverage.py` tính tập slug có canonical và nạp vào cache `CANONICAL_SLUGS` trong `dish_resolver.py` (`set_canonical_slugs`). `has_canonical(slug)` chỉ tra set trong bộ nhớ — O(1), không I/O. Xem `main.py` lifespan gọi `compute_canonical_coverage`.

**D4. Vì sao trước đây có fallback OpenAI Vision mà giờ bỏ?**
Fallback gọi API đa năng khi model cục bộ không chắc. Đã bỏ vì API đa năng trả nhãn tự do khó ánh xạ về công thức có thật, lại tốn phí/độ trễ và phá vỡ nguyên tắc "chỉ trả kết quả có công thức". Comment trong `ai_service.py` ghi rõ "(Đã bỏ fallback OpenAI Vision.)". Giờ khi không chắc, hệ thống báo "không nhận diện được".

**D5. Một lớp AI có thể có nhiều công thức. Em chọn cái nào làm "công thức chuẩn"?**
Trong `_find_canonical_for_class`, các recipe canonical cùng slug được sắp theo `llm_judge_score` giảm dần (nulls cuối). Bản top-1 là "công thức chuẩn" hiển thị, phần còn lại là "biến thể" (variants). `llm_judge_score` là điểm do một bước LLM chấm chất lượng công thức khi tuyển chọn canonical.

**D6. Sau khi có slug, hệ thống gợi ý danh sách công thức thế nào? Có bao nhiêu tầng dự phòng?**
`_find_suggested_recipes` (trong `ai_service.py`) gom tối đa 6 món theo 3 bước, khử trùng theo tên chuẩn hóa: (1) từ canonical + variants của đúng slug; (2) nếu thiếu, khớp theo tên hiển thị không dấu (`unaccent ILIKE`); (3) nếu vẫn thiếu, khớp theo `keyword` thô. Tất cả đều giới hạn trong "pool" hiển thị của trang /recipes (`catalog_visible_clause`).

---

## E. Luồng end-to-end & xử lý trường hợp biên

**E1. Đi từ lúc người dùng bấm "nhận diện" đến khi thấy kết quả, dữ liệu chạy qua đâu?**
Frontend `app/recognize/` gửi ảnh → route `app/api/v1/ai.py` → `ai_service.recognize_image()`: (1) mở & validate ảnh (PIL); (2) `predictor.predict()` cho top-5 + nhóm; (3) `dish_resolver.resolve_vnfood` quyết tier/slug; (4) tra canonical + suggested recipes; (5) ghi `AILog`; (6) trả JSON gồm predicted_class, display_name, confidence, match_tier, canonical_recipe, variants, suggested_recipes, top_predictions, class_metrics...

**E2. Ảnh đầu vào được kiểm tra gì trước khi vào model?**
Trong `recognize_image`: mở bằng PIL; nếu cạnh < 100px → ném lỗi "Ảnh quá nhỏ (tối thiểu 100×100 px)"; nếu mở thất bại → "Ảnh không hợp lệ". Trong `predict`, ảnh không phải RGB được `convert('RGB')` để đúng 3 kênh.

**E3. Trường hợp A: người dùng gửi URL ảnh thay vì upload file — hệ thống làm gì?**
Có hàm `fetch_image_from_url` dùng `requests.get(url, timeout=10)` chạy trong thread riêng (`asyncio.to_thread`) để không chặn event loop, `raise_for_status()` nếu URL hỏng. Sau đó cùng đi vào pipeline như ảnh upload.

**E4. Trường hợp B: model chưa nạp xong (mới khởi động / lỗi trọng số) mà có request nhận diện?**
`get_predictor()` thấy `_predictor is None` → ném `HTTPException(503, "AI models chưa sẵn sàng")`. Ở `main.py`, nếu thư mục trọng số không tồn tại thì chỉ log cảnh báo và *tắt tính năng AI*, các phần còn lại của web vẫn chạy (không sập app).

**E5. Trường hợp C: tầng 1 chọn được nhóm nhưng nhóm đó thiếu file model con thì sao?**
Lúc nạp, model con thiếu file sẽ bị `logger.warning(... skipping ...)` và không đưa vào `sub_models`. Khi suy luận, nếu `group_name not in self.sub_models` → đặt `needs_fallback=True` và trả về sớm (coi như không nhận diện được), không crash.

**E6. Mỗi lần nhận diện có được ghi lại không? Để làm gì?**
Có — ghi bản ghi `AILog` (user_id, image_url, predicted_class, confidence, model_used) tại `recognize_image`. Dùng cho: (1) truy vết/đánh giá; (2) tín hiệu cá nhân hóa — `recommend_service` đọc `AILog.predicted_class` để cộng điểm sở thích người dùng.

**E7. Trường hợp D: hai người dùng nhận diện đồng thời — có tranh chấp model không?**
Suy luận là `@torch.no_grad()` chỉ đọc trọng số, không đổi trạng thái model, nên chia sẻ được. Điểm cần lưu ý khi mở rộng: một tiến trình Python + GIL sẽ tuần tự hóa phần CPU nặng; đó là lý do hướng phát triển đề xuất tách worker/hàng đợi riêng cho suy luận (mục K).

---

## F. Xác thực & phân quyền

**F1. JWT của em chứa gì? Ai ký, ký bằng gì?**
Access token payload: `sub` (user id), `role`, `exp`, `type='access'`; refresh token: `sub`, `exp`, `type='refresh'`. Ký HS256 bằng `SECRET_KEY`. Access hết hạn 60 phút, refresh 7 ngày. Code `app/core/security.py`.

**F2. Access token hết hạn thì sao? Cơ chế refresh hoạt động thế nào?**
Client gọi endpoint refresh với refresh token. `auth_service.refresh_access_token` kiểm `type=='refresh'` và user còn active, rồi cấp **cả access lẫn refresh mới** (sliding session — phiên đang dùng tự gia hạn cửa sổ 7 ngày). Vì token stateless (không lưu server), refresh token cũ vẫn hợp lệ tới khi hết `exp`.

**F3. Có "cổng nhân viên" riêng. Vì sao đăng nhập consumer lại từ chối tài khoản admin?**
Trong `auth_service.login`, nếu `portal='consumer'` mà tài khoản có quyền ≥ ADMIN thì trả **đúng lỗi 401 chung** "Email hoặc mật khẩu không đúng" — *không* phát tín hiệu khác biệt, để không cho phép dò (enumerate) sự tồn tại của tài khoản nhân viên qua cổng người dùng. Không token nào được cấp.

**F4. Mật khẩu lưu thế nào? Đổi mật khẩu kiểm tra gì?**
Băm bằng **bcrypt** qua passlib (`hash_password`/`verify_password`), không lưu plaintext. `change_password` bắt buộc xác minh mật khẩu cũ trước khi đặt mới; `change_email` bắt buộc xác minh mật khẩu và kiểm email mới chưa bị dùng. Code `auth_service.py`.

**F5. Điểm yếu bảo mật em tự nhận ở phạm vi hiện tại?**
Chạy HTTP cục bộ (chưa HTTPS/TLS), chưa rate-limit, chưa security headers, chưa cơ chế thu hồi token tức thời (do stateless). Đây đều nằm ở "bảo mật khi triển khai thực tế" trong hướng phát triển.

---

## G. Cơ sở dữ liệu & mô hình dữ liệu

**G1. Kể các thực thể chính trong CSDL và quan hệ.**
Các model ở `app/models/`: `user`, `recipe` (+ `RecipeIngredient`, `RecipeStep`), `social` (Rating, Comment, SavedRecipe, Follow), `meal_plan` (+ MealPlanItem, GroceryItem), `recipe_change_request`, `ai_log`, `ai_generated_recipe`, `newsletter`. Recipe 1–n Ingredient/Step; User 1–n Recipe/Rating/SavedRecipe; MealPlan 1–n Item/GroceryItem.

**G2. Trong bảng `recipes`, các cột nào phục vụ ràng buộc AI–công thức?**
`is_canonical` (bool, có index), `canonical_dish_slug` (slug lớp AaI, index), `variant_label`, `source` ('monngonmoingay'|'user'|'admin'), `status` ('approved'|'pending'|...), `keyword`, `llm_judge_score`/`llm_judge_reason`. Xem `app/models/recipe.py`. Chính các cột này để lọc canonical đúng lớp và xếp hạng.

**G3. "Pool" công thức mà trang /recipes và AI được phép hiển thị được định nghĩa ở đâu?**
`app/services/recipe_service.py`: hằng `CATALOG_SOURCE='monngonmoingay'`; `catalog_canonical_clause()` = canonical + approved + source monngonmoingay; `catalog_visible_clause()` = canonical HOẶC recipe do người dùng đăng (`source='user'`). AI gợi ý cũng giới hạn trong pool này để không lộ dữ liệu thô chưa tuyển.

---

## H. Quy trình đóng góp & duyệt công thức (có kiểm soát)

**H1. Người dùng đóng góp công thức thì hệ thống lưu gì? Áp dụng ngay không?**
Không áp dụng ngay. Người dùng tạo một `RecipeChangeRequest` (loại `create`/`edit`/`delete`) trạng thái `pending`, payload là công thức đề xuất. Code `app/services/change_request_service.py::create_change_request`. Có kiểm hợp lệ: edit/delete phải có `target_recipe_id` tồn tại; create/edit phải có payload.

**H2. Khi admin duyệt một đề xuất `create`, điều gì xảy ra?**
`approve_change_request`: dựng `RecipeCreate` từ payload, tạo `Recipe` mới với `source='admin'`, `status='approved'`, `is_canonical=True`, `author_id` = người đề xuất; rồi ghi ingredients/steps. Đổi trạng thái CR sang `approved`, ghi `reviewed_by`.

**H3. Với `edit`, vì sao code xóa hết ingredients/steps cũ rồi ghi lại?**
Để tránh trạng thái nửa vời khi số dòng nguyên liệu/bước thay đổi — thay vì so khớp từng dòng, nó `delete` toàn bộ RecipeIngredient/RecipeStep của recipe rồi ghi lại theo payload mới (replace-all). Đồng thời set `flavor_text=None` vì bản edit đã được duyệt là "chính chủ", trang chi tiết sẽ hiển thị đúng description mới.

**H4. Trường hợp E: admin duyệt lệnh `delete` một công thức là canonical DUY NHẤT của một lớp AI — hệ thống làm gì?**
Chặn lại. `approve_change_request` đếm số canonical cùng `canonical_dish_slug`; nếu `<= 1` thì ném `409 Conflict`: "Không thể xóa: canonical duy nhất cho lớp AI '...'". Lý do: xóa mất sẽ khiến lớp AI đó nhận diện ra nhưng không còn công thức để ánh xạ — phá vỡ ràng buộc D1. Đây là bảo vệ tính toàn vẹn nghiệp vụ.

**H5. Hai admin cùng xử lý một đề xuất thì sao?**
Mọi thao tác approve/reject kiểm `cr.status != 'pending'` → nếu đã xử lý thì ném `409 "Đề xuất đã được xử lý"`, tránh áp dụng hai lần.

---

## I. Meal plan & danh sách đi chợ

**I1. Danh sách đi chợ được sinh thế nào từ kế hoạch bữa ăn?**
`meal_plan_service.generate_grocery_list` → `_aggregate_from_items`: lấy tập *recipe id phân biệt* trong plan (một recipe dùng nhiều bữa chỉ tính một lần), gộp nguyên liệu bằng một truy vấn join (tránh N+1), khử trùng theo tên chuẩn hóa không dấu, gộp các định lượng khác nhau (nối chuỗi, **không cộng số**), và phân nhóm bằng `grocery_categories.categorize`.

**I2. Vì sao "không cộng định lượng" mà chỉ nối chuỗi?**
Vì đơn vị nguyên liệu không đồng nhất ("2 củ", "300g", "vừa đủ") — cộng số học sẽ sai/không có nghĩa. Giải pháp thực dụng: liệt kê các định lượng riêng biệt để người dùng tự tổng hợp; nếu không có định lượng thì ghi "vừa đủ".

**I3. Người dùng tự thêm món vào danh sách đi chợ, rồi bấm cập nhật kế hoạch — món tự thêm có mất không?**
Không. Khi tái sinh danh sách, chỉ xóa các dòng *bắt nguồn từ công thức* (`is_manual=False`); các dòng người dùng tự thêm (`is_manual=True`) được giữ nguyên. Trạng thái đã tick (`is_checked`) của dòng từ công thức cũng được bảo toàn theo tên chuẩn hóa. `get_grocery_list` thực chất build lại "live" mỗi lần đọc nên luôn khớp kế hoạch hiện tại.

---

## J. Gợi ý cá nhân hóa

**J1. Hệ thống gợi ý công thức cho một người dùng dựa trên gì?**
`app/services/recommend_service.py::_preferred_slugs`: gom tín hiệu sở thích — món được **rate ≥ 4 sao** (+2 điểm), món đã **lưu** (+2 slug/+1 keyword), và **lịch sử nhận diện** `AILog.predicted_class` (+1). Lấy top-20 slug/keyword, ưu tiên công thức canonical khớp, xếp theo `llm_judge_score` rồi `avg_rating`.

**J2. Người dùng mới chưa có lịch sử thì gợi ý gì (cold start)?**
Fallback sang công thức canonical *phổ biến*: xếp theo `save_count` rồi `avg_rating`. Interface `suggest_recipes_for_user(...)` được giữ ổn định để sau này thay lõi bằng "engine cá nhân hóa" mà không phải sửa các nơi gọi (meal plan, trang gợi ý).

---

## K. Kết quả, so sánh, hạn chế & hướng phát triển

**K1. Kết quả độ chính xác cụ thể là bao nhiêu? Đo trên tập nào?**
Bộ phân loại nhóm (tầng 1) đạt ~92,48%; các bộ phân loại món (tầng 2) dao động ~89,95%–98,88% (đo trên tập validation của từng model, `val_acc` lưu trong checkpoint và in ra lúc nạp — xem log `inference.py`). Con số theo từng lớp phục vụ hiển thị qua `metrics_service.get_class_metrics`.

**K2. Vì sao không báo một con số "độ chính xác toàn hệ thống" duy nhất?**
Vì hệ thống phân cấp: độ chính xác đầu-cuối = xác suất tầng 1 đúng × tầng 2 đúng, và còn phụ thuộc ngưỡng từ chối. Báo tách từng tầng trung thực hơn một con số gộp dễ gây hiểu nhầm. (Một chỉ số end-to-end trên tập test độc lập là việc nên bổ sung — em ghi nhận.)

**K3. So với việc gọi thẳng một API Vision đa năng (GPT-4o/Gemini), giải pháp của em hơn/kém ở đâu?**
- *Hơn:* chạy cục bộ (không phí gọi API, không phụ thuộc mạng, độ trễ ổn định); chủ động ràng buộc kết quả về công thức có thật; kiểm soát được tập lớp và ngưỡng từ chối.
- *Kém:* độ phủ hẹp hơn (chỉ các lớp đã train, ~100+ món), API đa năng phủ rộng gần như vô hạn; API đa năng zero-shot không cần train.
Sự đánh đổi này đúng với mục tiêu đồ án: ưu tiên *độ tin cậy có kiểm soát* trên tập món Việt hơn là độ phủ.

**K4. Hạn chế lớn nhất của hệ thống hiện tại là gì?**
(1) Mới chạy cục bộ, chưa deploy. (2) Kho canonical mới phủ ~47/103 lớp AI có công thức — có lớp nhận diện được nhưng công thức còn mỏng. (3) Suy luận nằm trong tiến trình web, chưa tách riêng nên chịu tải kém. (4) Không có lớp "ngoài phân phối" chuyên biệt cho ảnh không phải món ăn.

**K5. Hướng phát triển em đề xuất, và vì sao theo thứ tự đó?**
Ưu tiên theo giá trị/độ rủi ro: (1) **mở rộng chịu tải** — tách suy luận ra worker/hàng đợi, GPU + xử lý theo lô, nhiều worker sau Nginx, cache Redis/CDN; (2) **bảo mật triển khai** — HTTPS/TLS, rate limit, security headers; (3) **tính năng** — deploy cloud, app di động tận dụng camera, blog cộng đồng có kiểm duyệt, cá nhân hóa theo dinh dưỡng, và thay/kết hợp mô hình nhận diện bằng API đa phương thức khi cần độ phủ.

---

## L. Câu "kiểm tra em có tự viết code không" (chỉ điểm file/dòng)

**L1. Chức năng nhận diện ảnh nằm ở những file nào?**
Model & pipeline: `backend/app/ai/inference.py`; danh sách lớp/nhóm: `backend/app/ai/class_names.py`; điều phối nghiệp vụ: `backend/app/services/ai_service.py`; quyết tier: `backend/app/services/dish_resolver.py`; endpoint: `backend/app/api/v1/ai.py`; UI: `frontend/app/recognize/`.

**L2. Ngưỡng tin cậy được đặt ở đâu, đúng giá trị nào?**
`inference.py`: `GROUP_CONFIDENCE_THRESHOLD=0.5`, `CLASS_CONFIDENCE_THRESHOLD=0.6`. `dish_resolver.py`: `GROUP_CONF_MIN=0.5`, `CLASS_CONFIDENT=0.6`, `CLASS_TENTATIVE=0.4`. (Hai nơi phản chiếu nhau; resolver thêm mức tentative 0.4.)

**L3. Chức năng duyệt công thức của admin gọi hàm nào?**
`backend/app/services/change_request_service.py`: `create_change_request`, `list_pending_change_requests`, `approve_change_request`, `reject_change_request`. Endpoint ở `backend/app/api/v1/recipe_change_requests.py`; UI nhân viên ở `frontend/app/staff/change-requests/` và `frontend/app/staff/proposals/`.

**L4. Đăng nhập/JWT xử lý ở đâu?**
`backend/app/core/security.py` (tạo/giải mã token, băm mật khẩu) và `backend/app/services/auth_service.py` (register/login/refresh/change password/email). Endpoint `backend/app/api/v1/auth.py`. UI `frontend/app/auth/login`, `frontend/app/auth/staff-login`.

**L5. Sinh danh sách đi chợ từ kế hoạch bữa ăn ở đâu?**
`backend/app/services/meal_plan_service.py`: `generate_grocery_list` + `_aggregate_from_items`. Endpoint `backend/app/api/v1/meal_plans.py` (router `meal_plans_router` và `grocery_router`). UI `frontend/app/meal-plan/`.

**L6. Giải thích một đoạn khó: `_norm_title` / `unaccent ILIKE` để làm gì?**
Khi khử trùng và khớp công thức theo tên, tên tiếng Việt có dấu và hoa/thường khác nhau. `_norm_title` chuẩn hóa NFC + lowercase + gộp khoảng trắng để làm khóa khử trùng; `_title_unaccent_ilike` dùng hàm `unaccent` của PostgreSQL để so khớp tên *không phân biệt dấu* (`unaccent(title) ILIKE unaccent(%name%)`). Nhờ đó "Phở Bò" khớp "pho bo". Code trong `ai_service.py`.

---

## M. Câu hỏi "bẫy" hay gặp

**M1. Em nói ~103 lớp AI nhưng chỉ ~47 công thức canonical — vậy nhận diện ra 56 lớp còn lại thì hiển thị gì?**
Với lớp chưa có canonical: nếu độ tin cậy ở mức "confident" (≥0.6), vẫn hiển thị tên món + top-5, và bước gợi ý sẽ cố khớp theo tên/keyword trong pool; nhưng sẽ *không* có thẻ "Công thức chuẩn" inline. Ở mức "tentative" (0.4–0.6), do `has_canonical(slug)` = False nên hệ thống *không* nhận → báo không nhận diện được. Đây chính là lý do độ phủ canonical là hạn chế cần mở rộng.

**M2. Nếu em bỏ tầng 1 và chỉ để 8 model con, làm sao biết ảnh thuộc nhóm nào?**
Không thể — chính tầng 1 là bộ định tuyến chọn model con. Bỏ nó thì phải chạy cả 8 model con rồi hợp nhất xác suất (đắt gấp 8 lần và cần chuẩn hóa điểm giữa các model độc lập). Kiến trúc hiện tại chỉ chạy 1 model con sau khi tầng 1 định tuyến — rẻ hơn nhiều.

**M3. Vì sao tầng 1 dùng B0 (nhỏ) còn tầng 2 dùng B2 (lớn)? Không sợ tầng 1 yếu kéo sập cả chuỗi à?**
Phân 8 nhóm coarse là bài toán dễ hơn (khác biệt nhóm rõ), B0 đủ và nhanh — đặt model nhẹ ở tầng chạy-luôn hợp lý. Phân món fine trong nhóm khó hơn (các món giống nhau), cần B2 mạnh hơn. Rủi ro tầng 1 sai được chặn bằng ngưỡng 0.5 + cơ chế từ chối; và thực nghiệm cho tầng 1 ~92% nên đủ tin cậy làm bộ định tuyến.

**M4. Confidence 0.0 khi "không nhận diện được" — con số 0.0 đó có ý nghĩa xác suất không?**
Không. Đó là giá trị *đặt cứng* để biểu thị "hệ thống từ chối kết luận", không phải xác suất model tính ra. Xác suất thật của lần đó vẫn tồn tại nhưng dưới ngưỡng nên bị loại; ta ghi 0.0 để tầng hiển thị và log hiểu là "không có kết quả tin cậy".

**M5. Nếu thầy đưa 2 ảnh cùng món nhưng góc chụp/ánh sáng khác nhau và ra 2 kết quả khác nhau, em giải thích sao?**
CNN nhạy với biến thiên góc/ánh sáng/nền; nếu ảnh rơi gần ranh giới quyết định, thay đổi nhỏ có thể lật nhãn hoặc đẩy confidence qua/dưới ngưỡng. Đây là lý do có top-5 (để thấy các ứng viên gần nhau) và cơ chế từ chối. Cải thiện: tăng cường dữ liệu (augmentation) đa dạng hơn, hiệu chuẩn xác suất, hoặc test-time augmentation.

---

## N. Thiết kế CSDL — vì sao có các bảng này & liên kết ra sao

**N1. Kể các bảng chính và lý do tồn tại của từng bảng.**
- `users` — tài khoản & phân quyền (role, is_active). Gốc của mọi hành vi cá nhân.
- `recipes` (+ `recipe_ingredients`, `recipe_steps`) — thực thể trung tâm. Tách nguyên liệu/bước thành bảng con vì mỗi công thức có *nhiều* dòng, độ dài không cố định — không thể nhét vào cột của `recipes`.
- `comments`, `ratings`, `saved_recipes` — ba kiểu tương tác người dùng↔công thức, mỗi kiểu ngữ nghĩa khác nhau (văn bản / điểm số / bookmark) nên tách bảng.
- `meal_plans` (+ `meal_plan_items`, `grocery_items`) — kế hoạch bữa ăn và danh sách đi chợ dẫn xuất.
- `recipe_change_requests` — hàng đợi đề xuất chờ duyệt (tách khỏi `recipes` để công thức thật không bị "bẩn" bởi bản nháp chưa duyệt).
- `ai_logs` — nhật ký nhận diện, phục vụ truy vết + cá nhân hóa.
- `newsletter_subscribers`, `ai_generated_recipes` — phụ trợ (bản tin, cache công thức sinh tự động).
Xem toàn bộ ở `backend/app/models/`.

**N2. Vì sao tách `recipe_ingredients` và `recipe_steps` thành bảng riêng thay vì lưu một cột JSON trong `recipes`?**
Chuẩn hóa quan hệ (1NF): mỗi nguyên liệu/bước là một hàng có thuộc tính riêng (`ingredient_name`, `quantity`, `order_index` / `step_number`, `content`, `timer_seconds`). Nhờ tách bảng mới **truy vấn được ngang công thức** — ví dụ danh sách đi chợ join thẳng `recipe_ingredients` của nhiều recipe trong một query (`meal_plan_service._aggregate_from_items`); nếu để JSON thì phải nạp từng recipe rồi parse trong Python, chậm và không lọc/ghép được ở tầng SQL.

**N3. Quan hệ giữa `users`, `recipes` và các bảng tương tác là gì?**
`users` 1–n `recipes` (qua `author_id`). `recipes` 1–n `comments`/`ratings`/`saved_recipes`; `users` cũng 1–n các bảng đó. Tức comments/ratings/saved là **bảng nối** giữa user và recipe, mỗi hàng = "user X tương tác với recipe Y". Quan hệ khai báo bằng `relationship(... back_populates=...)` hai chiều trong `models/user.py`, `models/recipe.py`, `models/social.py`.

**N4. Vì sao có bảng `recipe_change_requests` riêng mà không sửa thẳng vào `recipes`?**
Để **tách nội dung đã duyệt khỏi nội dung chờ duyệt**. Nếu cho user sửa thẳng `recipes`, công thức sai/spam sẽ xuất hiện ngay với người dùng khác. Change request là "hộp thư đề xuất": lưu `type` (create/edit/delete) + `payload` (JSONB) + `status`. Chỉ khi admin approve thì thay đổi mới được *áp dụng* vào `recipes` (`change_request_service.approve_change_request`). Payload để JSONB vì hình dạng công thức đề xuất linh hoạt, chưa cần ràng buộc như bảng thật.

**N5. Khóa ngoại của em đặt `ON DELETE` thế nào và vì sao khác nhau giữa các bảng?**
Có chủ đích theo ngữ nghĩa sở hữu:
- **CASCADE** cho quan hệ "con thuộc về cha": `recipe_ingredients`/`recipe_steps` → recipe; `meal_plan_items`/`grocery_items` → meal_plan; comments/ratings/saved → recipe. Xóa cha thì con vô nghĩa, xóa luôn.
- **SET NULL** cho tham chiếu "nguồn gốc/tác giả": `recipes.author_id`, `meal_plan_items.recipe_id`, `ai_logs.user_id`, `change_request.reviewed_by`. Xóa một user/recipe **không được** làm mất lịch sử hay kế hoạch của người khác — chỉ gỡ liên kết (thành NULL). Ví dụ xóa một recipe khỏi hệ thống không nên làm sập kế hoạch bữa ăn đã lập của người dùng.

**N6. Cột `canonical_dish_slug` trong `recipes` liên kết với cái gì? Đó có phải khóa ngoại không?**
Không phải FK tới bảng nào — nó là **khóa logic** nối `recipes` với **tập lớp AI** định nghĩa trong code (`app/ai/class_names.py::GROUP_CLASSES`). Giá trị của nó là một slug như `pho`, `banh-mi`. Đây chính là cầu nối "công thức ↔ nhãn nhận diện": `ai_service._find_canonical_for_class` và `canonical_coverage` khớp `predicted_class` (từ model) với cột này. Nó có index vì được tra thường xuyên.

**N7. Một món có nhiều công thức (phở bò, phở gà). Mô hình dữ liệu thể hiện thế nào?**
Cùng `canonical_dish_slug` (vd `pho`) nhưng khác `variant_label` (vd "bò", "gà"); một bản có `is_canonical=True` được chọn làm đại diện (xếp theo `llm_judge_score`). Nhờ vậy một lớp AI ánh xạ tới một *nhóm* công thức: bản chuẩn + các biến thể — đúng cái `_find_canonical_for_class` trả về `(main, variants)`.

**N8. Cột dẫn xuất `avg_rating`/`rating_count`/`save_count`/`view_count` trong `recipes` là dữ liệu thừa (denormalized). Vì sao chấp nhận?**
Đây là **denormalization có chủ đích** để đọc nhanh: trang danh sách hiển thị điểm sao và lượt lưu cho hàng chục công thức; nếu mỗi lần đều `COUNT/AVG` trên bảng `ratings` sẽ tốn. Đổi lại phải giữ đồng bộ khi ghi — `social_service._recompute_rating` tính lại `avg_rating/rating_count` mỗi khi có rating thay đổi. Đây là đánh đổi đọc-nhanh/ghi-thêm-việc, hợp lý vì đọc nhiều hơn ghi.

**N9. `payload` trong change request và `recipe_json` trong ai_generated_recipes để kiểu JSONB. Vì sao không tách cột?**
Vì đó là dữ liệu **chưa ổn định/chưa cần truy vấn theo trường**: payload là bản nháp công thức chờ duyệt, chỉ cần lưu–lấy nguyên khối rồi dựng lại thành `RecipeCreate` khi approve. JSONB cho linh hoạt schema mà vẫn nằm trong Postgres (query được nếu sau này cần). Ngược lại, khi đã duyệt, dữ liệu được ghi vào bảng thật (`recipes` + con) đúng chuẩn quan hệ.

**N10. Chỉ vẽ ERD cho hội đồng, em sẽ nhấn mạnh điều gì?**
Ba cụm: (1) *người dùng & nội dung* (users–recipes–ingredients/steps); (2) *tương tác* (comments/ratings/saved là bảng nối user↔recipe); (3) *tính năng phái sinh* (meal_plans→items→grocery, change_requests, ai_logs). Và một mũi tên đặc biệt **không phải FK**: `recipes.canonical_dish_slug` nối sang tập lớp AI — đây là chỗ thể hiện "trục mạch lạc" của đồ án.

---

## O. Vì sao giới hạn ~103 lớp món (nhận diện & tra cứu)

**O1. Con số 103 từ đâu ra? Tính thế nào?**
Là số **slug món phân biệt** gộp qua 8 nhóm trong `GROUP_CLASSES` (`app/ai/class_names.py`). Code tính chính xác: `canonical_coverage.unique_class_slugs()` = hợp tất cả slug của mọi nhóm (một vài slug như `banh-canh` xuất hiện ở 2 nhóm nên phải lấy *distinct*). Đó là tập lớp mà mô hình AI được huấn luyện để phân biệt.

**O2. Vì sao là con số cố định chứ không phải "nhận mọi món"?**
Vì đây là bài toán **phân loại có giám sát (supervised classification)**: model chỉ có thể nhận ra những lớp **đã có trong tập huấn luyện có nhãn**. Không có dữ liệu gắn nhãn cho một món thì model không thể học nhận nó. 103 là số lớp em thu thập đủ ảnh để train — không phải giới hạn tùy tiện mà là ranh giới của dữ liệu.

**O3. Vì sao chọn đúng các món này mà không phải món khác?**
Ưu tiên **món Việt phổ biến, có mặt trong nguồn công thức** (monngonmoingay) để đảm bảo mỗi nhãn nhận diện có công thức để ánh xạ — đúng ràng buộc nghiệp vụ. Đồng thời gom được theo 8 nhóm hình thức (bánh, bún/phở, cơm, món kho/nướng, canh/cháo, xôi, gỏi/cuốn, đặc biệt) để phục vụ kiến trúc phân cấp hai tầng.

**O4. Giới hạn 103 lớp có mâu thuẫn với việc em nói có "22k công thức" không?**
Không — đó là hai lớp dữ liệu khác nhau. Kho thô có thể rất lớn, nhưng phần **AI nhận diện + tra cứu canonical** cố ý *thu hẹp* về tập lớp có kiểm soát để đảm bảo chất lượng và tính mạch lạc (mỗi nhãn AI trỏ về công thức chuẩn đã tuyển). Trang /recipes hiện tại giới hạn theo `catalog_visible_clause` = canonical monngonmoingay + bài user, chứ không đổ toàn bộ 22k thô ra.

**O5. Trong 103 lớp, em nói chỉ ~47 lớp có công thức canonical. Vậy 103 hay 47 mới là "giới hạn thật"?**
Phân biệt hai con số: **103 = năng lực nhận diện** (model phân biệt được 103 lớp); **~47 = độ phủ công thức chuẩn** (số lớp hiện đã có canonical để tra cứu đầy đủ). `canonical_coverage.compute_canonical_coverage` tính chính xác tập "covered" lúc startup và log ra phần "missing". Khoảng cách 47/103 chính là hạn chế em thừa nhận và là việc mở rộng ưu tiên: bổ sung công thức cho các lớp còn trống.

**O6. Trường hợp người dùng chụp một món Việt KHÔNG nằm trong 103 lớp — hệ thống ứng xử ra sao?**
Model buộc phải gán về một trong 103 lớp (không có lớp "khác"), nhưng thường độ tin cậy sẽ thấp → rơi dưới ngưỡng (nhóm 0.5 / món 0.6) → hệ thống trả "không nhận diện được" thay vì gán bừa. Đây là lý do cơ chế ngưỡng + từ chối quan trọng: nó *một phần* bù cho việc tập lớp đóng. (Hạn chế: nếu món lạ tình cờ giống một lớp đã biết và cho confidence cao, vẫn có thể nhận nhầm — cần lớp out-of-distribution ở tương lai.)

**O7. Làm sao mở rộng số lớp? Chi phí là gì?**
Thêm lớp mới cần: (1) thu thập & gán nhãn đủ ảnh cho lớp đó; (2) xếp lớp vào một trong 8 nhóm (hoặc thêm nhóm → train lại tầng 1 B0); (3) train lại model con B2 của nhóm chứa nó; (4) bổ sung công thức canonical + `canonical_dish_slug` tương ứng để giữ ràng buộc. Tức mở rộng *không chỉ* là thêm dữ liệu mà kéo theo huấn luyện lại — đây là đánh đổi cố hữu của hướng model chuyên biệt so với API đa năng zero-shot.

---

*Gợi ý ôn: nắm chắc 3 con số ngưỡng (0.5 / 0.6 / 0.4), luồng 6 bước ở `recognize_image`, phân biệt **103 (năng lực nhận diện)** vs **47 (độ phủ công thức)** (mục O5), và lý do "ràng buộc nhận diện ↔ công thức có thật" (mục D & M1) — đây là những chỗ hội đồng hay khoan sâu nhất.*
