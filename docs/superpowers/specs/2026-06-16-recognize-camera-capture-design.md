# Camera Capture trên trang Recognize — Design

**Ngày:** 2026-06-16
**Trang:** `/recognize` (`frontend/app/recognize/page.tsx`)
**Mục tiêu:** Cho phép user chụp ảnh trực tiếp bằng camera (live, trong web) ngoài việc upload/drag-drop/URL như hiện tại.

## Bối cảnh

Trang recognize hiện có `ImageDropzone` hỗ trợ: drag-drop, click chọn file, dán URL. Hero text đã ghi "Chụp hoặc tải ảnh" nhưng **chưa có** chức năng chụp thật. Backend `POST /ai/recognize` (multipart) nhận một `File` — ảnh chụp chỉ là một `File` khác, **không cần đổi backend**.

## Quyết định thiết kế

- **Cách chụp:** camera live trong web bằng `getUserMedia` (modal hiện video trực tiếp + nút chụp). Chạy cả desktop webcam lẫn mobile. (Không dùng `input capture` đơn giản.)
- **Luồng sau chụp:** review step — hiện ảnh vừa chụp với 2 nút "Chụp lại" / "Dùng ảnh này"; chỉ khi "Dùng ảnh" mới gửi AI.

## Kiến trúc & components

Thêm 1 component mới, không đụng backend:

- **`frontend/components/ai/CameraCapture.tsx`** (mới) — modal full-screen chứa live camera. Quản lý `getUserMedia` stream, vẽ frame ra `<canvas>`, trả `File` qua callback `onCapture(file: File)` và `onClose()`.
- **`frontend/components/ai/ImageDropzone.tsx`** (sửa) — thêm nút **"Chụp ảnh"** (icon Camera) cạnh ô URL. Bấm → mở modal `CameraCapture`. File trả về đi qua `handleFile` (tái dùng validate hiện có) → `onSelect`.
- **`frontend/app/recognize/page.tsx`** — không đổi logic. File từ camera đi qua đúng `handleSelect(file)` đã có → `POST /ai/recognize`.

**Luồng dữ liệu:** `CameraCapture` → `File` → `ImageDropzone.onSelect` → `page.handleSelect` → API. Tái dùng toàn bộ validate (10MB, image type) và state machine hiện có.

## CameraCapture — hành vi

- **Mở modal:** `navigator.mediaDevices.getUserMedia({ video: { facingMode } })`, gắn stream vào `<video autoPlay playsInline>`.
- **`facingMode`:** mặc định `"environment"` (camera sau). Nút **đổi camera** toggle `"user"`/`"environment"`, restart stream.
- **Bấm chụp:** vẽ frame video lên `<canvas>` → `canvas.toBlob()` → `new File([blob], "camera-<timestamp>.jpg", { type: "image/jpeg" })`.
- **Review step:** sau chụp hiện ảnh tĩnh (từ canvas/blob URL) + 2 nút:
  - **"Chụp lại"** → quay về live stream.
  - **"Dùng ảnh này"** → gọi `onCapture(file)`, đóng modal.
- **Cleanup:** dừng mọi `MediaStreamTrack` khi đóng modal / unmount / đổi camera — tránh đèn camera kẹt sáng. Revoke blob URL của ảnh review.

## Xử lý lỗi & quyền

- **Từ chối quyền / không có camera:** modal hiện thông báo ("Không truy cập được camera, vui lòng cho phép hoặc tải ảnh lên") + nút đóng. Dropzone upload vẫn dùng bình thường.
- **Secure context:** `getUserMedia` chỉ chạy trên secure context (localhost OK, production cần HTTPS). Nếu `navigator.mediaDevices?.getUserMedia` không tồn tại → bấm "Chụp ảnh" báo lỗi nhẹ, không crash.
- **`disabled`:** nút "Chụp ảnh" disabled khi đang loading — đồng bộ với dropzone.

## Testing

Camera khó test tự động (cần thiết bị thật). Phạm vi:
- **Manual:** desktop webcam (Chrome) + mobile — chụp, đổi camera, chụp lại, dùng ảnh, từ chối quyền.
- `tsc --noEmit` pass, không lỗi lint.

## Phạm vi

**1 file mới + 2 file sửa nhẹ, 0 thay đổi backend.**

### Out of scope (YAGNI)
- Lưu lịch sử ảnh đã chụp.
- Chỉnh sửa / crop ảnh trong web.
- Quay video.
