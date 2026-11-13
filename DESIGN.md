# DESIGN.md - Hệ Thống Thiết Kế Giao Diện (Design System Spec)
*Lấy cảm hứng từ [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) - Linear & Stripe Aesthetics*

## 1. Triết Lý Thiết Kế (Design Principles)
- **Readability First (Ưu tiên khả năng đọc):** Loại bỏ toàn bộ font chữ siêu nhỏ (<13px). Kích thước chữ cơ bản tối thiểu 15px - 16px, tiêu đề 18px - 28px, độ tương phản cao, khoảng cách dòng thoáng đãng (`leading-relaxed`).
- **Clear Information Hierarchy (Phân cấp nội dung mạch lạc):** Sử dụng các thẻ Card lớn, bố cục lưới (Grid) cân đối, khoảng cách padding rộng rãi (20px - 32px), tránh cảm giác chật chội.
- **Effortless Interaction (Dễ dàng thao tác):** Các nút bấm (Buttons), ô chọn đáp án (Radio Options) có diện tích bấm lớn (Hit-target $\ge$ 48px), phản hồi hover/active mượt mà.
- **Professional Engineering Aesthetic (Thẩm mỹ kỹ thuật cao cấp):** Tông màu Dark Slate (`#0B0F19`, `#111827`, `#1E293B`) kết hợp dải màu điểm nhấn Indigo (`#6366F1`), Emerald (`#10B981`) và Violet (`#8B5CF6`).

---

## 2. Bảng Màu & Tokens (Color Tokens)
- **Background Root:** `#0B0F19` (Slate 950)
- **Surface / Card Background:** `#131B2E` với viền `#1E293B`
- **Surface Raised / Active:** `#1E293B` với viền `#334155`
- **Primary Accent:** `#6366F1` (Indigo 500) $\rightarrow$ `#4F46E5` (Indigo 600)
- **Success / Completed:** `#10B981` (Emerald 500)
- **Warning / Processing:** `#F59E0B` (Amber 500)
- **Error / Conflict:** `#EF4444` (Rose 500)
- **Text Primary:** `#F8FAFC` (Slate 50)
- **Text Secondary:** `#CBD5E1` (Slate 300)
- **Text Muted:** `#94A3B8` (Slate 400)

---

## 3. Quy Chuẩn Typography (Cỡ chữ & Kiểu chữ)
- **Font Family:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`
- **Display / Hero Title:** `text-2xl` - `text-3xl` (24px - 30px), `font-extrabold`
- **Section Heading:** `text-lg` - `text-xl` (18px - 20px), `font-bold`
- **Card Subheading:** `text-base` (16px), `font-semibold`
- **Body Text:** `text-base` (15px - 16px), `leading-relaxed`
- **Caption / Meta / Badges:** `text-sm` (13px - 14px), `font-medium` *(Không dùng cỡ chữ nhỏ hơn 13px)*
- **Code & Logs:** `JetBrains Mono`, `Consolas`, `font-mono`, `text-sm` (13px - 14px)

---

## 4. Thành Phần Giao Diện (Components)
- **Quiz Choice Card:** Khối chọn đáp án full-width, viền rõ, padding 16px, icon chữ cái nổi bật, đổi màu viền khi được chọn.
- **Processing Tracker:** Thanh tiến trình thời gian thực dạng Card lớn, icon động và badge trạng thái rõ nét.
- **Skill Competency Matrix:** Thanh đo lường năng lực với chiều cao 10px, nhãn kỹ năng và phần trăm to rõ.
- **AI Chat Message:** Hộp thoại bo góc 16px, phân biệt rõ người dùng (Indigo) và Trợ lý AI (Dark Card), hỗ trợ code block nổi bật.
