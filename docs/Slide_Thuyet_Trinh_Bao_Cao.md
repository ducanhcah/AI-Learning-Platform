# SLIDE THUYẾT TRÌNH BÁO CÁO ĐỀ TÀI
## XÂY DỰNG VÀ TÍCH HỢP HỆ THỐNG TRỢ LÝ HỌC TẬP THÔNG MINH ỨNG DỤNG AI HỖ TRỢ SINH VIÊN

**Học phần:** Tích hợp hệ thống (SE445)  
**Khoa:** Công nghệ Thông tin - Đại học Duy Tân  
**Giảng viên hướng dẫn:** ThS. Nguyễn Minh Nhật  
**Nhóm thực hiện:** Nhóm 13 (2026)  

---

### SLIDE 1: GIỚI THIỆU THÀNH VIÊN NHÓM 13
* **SV1:** Trần Văn Lộc - 29211165357 (Trưởng nhóm / Kiến trúc hệ thống & Gateway)
* **SV2:** Tống Minh Khuê - 29211165235 (Process API, Outbox Pattern & RabbitMQ)
* **SV3:** Trần Lê Phúc Hào - 29211360675 (Course LMS System & Quota Management)
* **SV4:** Đinh Hữu Phong - 29219165253 (AI Assistant System & Phân tích lộ trình)
* **SV5:** Nguyễn Đức Anh - 29211163324 (Progress, Notification & Kiểm thử tự động)

---

### SLIDE 2: ĐẶT VẤN ĐỀ & HIỆN TRẠNG
* **Hiện trạng:** Các hệ thống trong trường đại học (LMS, Assessment, Progress, AI, Notification) phát triển độc lập, phân tán.
* **Thách thức lớn:**
  1. *Khớp nối chặt (Tight Coupling):* Assessment gọi đồng bộ AI và Notification khiến request bị treo/timeout.
  2. *Dual-write Problem:* Nguy cơ mất đồng bộ giữa Database và Broker.
  3. *Race Condition:* Sinh viên bấm nộp bài nhiều lần làm vượt quá Quota.
  4. *Giao nhận trùng lặp:* Nguy cơ trừ 2 lần lượt thi khi mạng chập chờn.

---

### SLIDE 3: MỤC TIÊU VÀ GIẢI PHÁP TÍCH HỢP
* **Single Point of Entry:** Cung cấp API Gateway thống nhất (:8080) cho Web & Mobile.
* **Phân lớp API-led Connectivity:** Tách biệt rõ Experience, Process và System APIs.
* **Xử lý bất đồng bộ (EDA):** Tách tác vụ nặng sang RabbitMQ, phản hồi tức thì với HTTP 202 Accepted.
* **Đảm bảo tính toàn vẹn 100%:** Ứng dụng Transactional Outbox Pattern & Atomic Quota Deduct.
* **Chống lặp (Idempotency):** Quản lý khóa định danh sự kiện tại mọi Consumer.

---

### SLIDE 4: SƠ ĐỒ KIẾN TRÚC TỔNG THỂ
* **Client Layer:** Web Dashboard (HTML5, TailwindCSS, SPA) & Mobile Client.
* **Gateway Layer:** Nginx / Express API Gateway định tuyến reverse proxy, gắn Correlation ID.
* **Process Layer:** Assessment Process Service (:3001) điều phối nộp bài, tính điểm và Outbox.
* **Broker Layer:** RabbitMQ Topic Exchange `lms.events`, binding 4 Queues chuyên trách.
* **System Layer:** Course (:3002), Progress (:3003), AI (:3004), Notification (:3005).
* **Data Layer:** Mô phỏng Database per Service với 5 CSDL logic riêng biệt.

---

### SLIDE 5: LUỒNG NỘP BÀI BẤT ĐỒNG BỘ
1. Sinh viên nộp bài qua Gateway -> Nhận ngay **HTTP 202 Accepted** (kèm `submissionId`).
2. Quota được giữ chỗ/trừ nguyên tử ngay tại thời điểm tiếp nhận.
3. Bản ghi bài nộp và sự kiện Outbox được ghi cùng lúc trong 1 Transaction CSDL.
4. Outbox Publisher đẩy sự kiện `quiz.completed` vào RabbitMQ.
5. Các Consumer (Course, Progress, AI, Notification) nhận message và xử lý song song.
6. Status Aggregator liên tục cập nhật, khi đủ 4 tác vụ -> Chuyển thành `COMPLETED`.
7. Client Polling nhận kết quả điểm số, nhận xét AI và thông báo.

---

### SLIDE 6: GIẢI PHÁP KỸ THUẬT CỐT LÕI
* **Transactional Outbox:** Loại bỏ Dual-write, đảm bảo At-least-once Delivery.
* **Atomic Quota Deduct:** Câu lệnh SQL UPDATE có điều kiện `remaining_attempts > 0` ngăn chặn race condition tuyệt đối.
* **Idempotency Consumer:** Bảng `processed_events` với khóa chính `event_id` ngăn nhân đôi dữ liệu.
* **Dead Letter Queue (DLQ):** Exchange `lms.dlx` thu gom các message lỗi để kiểm tra, không làm tắc nghẽn queue chính.

---

### SLIDE 7: ỨNG DỤNG AI LEARNING ASSISTANT
* **Phân tích kết quả:** Đối chiếu chi tiết câu trả lời, nhận diện điểm mạnh và lỗ hổng kiến thức.
* **Lộ trình cá nhân hóa:** Đề xuất 3 bước ôn tập tối ưu theo năng lực người học.
* **Hỏi đáp thông minh (AI Chatbot):** Giải đáp thắc mắc về kiến trúc phần mềm, EDA, RabbitMQ theo ngữ cảnh tài liệu môn học.
* **Nguyên tắc an toàn:** AI đóng vai trò hỗ trợ, không tự ý thay đổi điểm số chính thức.

---

### SLIDE 8: KẾT QUẢ KIỂM THỬ (10/10 TEST CASES PASS)
* Đã chạy kiểm thử tự động toàn diện 10 kịch bản theo mục 9.2:
  * TC01 (Nộp bài hợp lệ - 202): **PASS**
  * TC02 (Hết quota - 409): **PASS**
  * TC03 (Payload rỗng - 400): **PASS**
  * TC04 (Sai mã môn học - 404): **PASS**
  * TC05 (AI Consumer pause/resume): **PASS**
  * TC06 (Chống trùng lặp Idempotency): **PASS**
  * TC07 (Health check toàn hệ thống): **PASS**
  * TC08 (Quota đồng thời): **PASS**
  * TC09 (Dead letter queue): **PASS**
  * TC10 (Status Aggregator): **PASS**

---

### SLIDE 9: DEMO TRỰC QUAN GIAO DIỆN
* **Trang làm bài:** Trực quan hóa tiến trình xử lý Asynchronous qua các bước: Course -> Progress -> AI -> Notification.
* **Trang AI Assistant:** Xem báo cáo đánh giá và chat trực tiếp với trợ lý.
* **Trang Giám sát & Kiểm thử:** Chạy live test case chỉ với 1 click chuột!

---

### SLIDE 10: TỔNG KẾT & HƯỚNG PHÁT TRIỂN
* **Kết quả đạt được:** Hệ thống tích hợp hoàn chỉnh, đáp ứng 100% yêu cầu đồ án Case Study 02.
* **Hướng phát triển:**
  1. Triển khai Kubernetes (K8s) với khả năng tự động co giãn (HPA).
  2. Bổ sung cơ chế xác thực JWT/OAuth2 và RBAC.
  3. Mở rộng mô hình ngôn ngữ lớn (LLM) hỗ trợ chấm tự luận tự động có kiểm duyệt.
