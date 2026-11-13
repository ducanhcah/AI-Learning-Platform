# IS-CaseStudy02: NỀN TẢNG TÍCH HỢP HỆ THỐNG TRỢ LÝ HỌC TẬP THÔNG MINH ỨNG DỤNG AI

> **Đại học Duy Tân - Khoa Công nghệ Thông tin**  
> **Môn học:** Tích hợp hệ thống (SE445)  
> **Giảng viên hướng dẫn:** ThS. Nguyễn Minh Nhật  
> **Nhóm thực hiện:** Nhóm 13  
> - Trần Văn Lộc (29211165357) - *Trưởng nhóm*
> - Tống Minh Khuê (29211165235)
> - Trần Lê Phúc Hào (29211360675)
> - Đinh Hữu Phong (29219165253)
> - Nguyễn Đức Anh (29211163324)

---

## 1. GIỚI THIỆU

### 1.1. Mục tiêu hệ thống
Dự án xây dựng nền tảng tích hợp thống nhất giữa các hệ thống giáo dục đại học:
- **LMS (Student & Course Management):** Quản lý khóa học, sinh viên và số lượt làm bài (Quota).
- **Assessment Process System:** Quản lý bài kiểm tra, tiếp nhận bài thi, kiểm soát quota và lưu trữ Outbox.
- **Learning Progress System:** Ghi nhận tiến độ học tập và điểm trung bình tích lũy.
- **AI Learning Assistant:** Đánh giá điểm mạnh/yếu, gợi ý lộ trình ôn tập và chat hỏi đáp học thuật.
- **Notification System:** Phát thông báo kết quả bài thi đa kênh cho sinh viên.

### 1.2. Các Service và Trách nhiệm
| Service | Thư mục | Cổng | Trách nhiệm chính |
|---|---|---|---|
| **API Gateway** | `services/api-gateway` / `infra/nginx` | `8080` | Điểm truy cập thống nhất (Reverse Proxy), gắn Correlation ID |
| **Web Client Dashboard** | `web-client` | `3000` | Giao diện Single Page App cho sinh viên & giảng viên |
| **Assessment Process** | `services/assessment-process` | `3001` | Tiếp nhận bài nộp (202), Outbox Publisher, Status Aggregator |
| **Course LMS System** | `services/course-system` | `3002` | Quản lý khóa học, trừ quota nguyên tử, Consumer quota |
| **Learning Progress** | `services/progress-system` | `3003` | Consumer cập nhật % hoàn thành khóa học và điểm trung bình |
| **AI Assistant System** | `services/ai-assistant-system` | `3004` | Consumer phân tích câu trả lời, gợi ý lộ trình, AI Chatbot |
| **Notification System** | `services/notification-system` | `3005` | Consumer tạo thông báo kết quả học tập |

### 1.3. Tài liệu thiết kế chi tiết
- [Báo cáo phân tích và thiết kế](docs/Bao_Cao_Phan_Tich_Thiet_Ke.md)
- [Sơ đồ kiến trúc & Sequence Diagram](docs/So_Do_Kien_Truc_Va_Sequence.md)
- [Báo cáo kết quả kiểm thử (10 Test Cases)](docs/Ket_Qua_Kiem_Thu_Test_Report.md)
- [Slide thuyết trình báo cáo](docs/Slide_Thuyet_Trinh_Bao_Cao.md)

---

## 2. YÊU CẦU MÔI TRƯỜNG

- **Hệ điều hành:** Windows 10/11 64-bit (hoặc macOS/Linux).
- **Node.js:** Phiên bản LTS v18 trở lên (Đã xác minh hoạt động tốt trên Node.js v20.x, v24.x).
- **npm:** v9.x trở lên.
- **Docker Desktop & Docker Compose:** Khuyến nghị bật WSL 2 backend (đối với phương án chạy bằng Docker).
- **Các cổng mạng cần sử dụng:**
  - `8080`: API Gateway
  - `3000`: Web Client Frontend
  - `3001`: Assessment Process Service
  - `3002`: Course LMS Service
  - `3003`: Learning Progress Service
  - `3004`: AI Assistant Service
  - `3005`: Notification Service
  - `5432`: PostgreSQL Database
  - `5672` / `15672`: RabbitMQ AMQP / RabbitMQ Management Dashboard

---

## 3. CẤU HÌNH BIẾN MÔI TRƯỜNG

1. Di chuyển vào thư mục `infra`:
```bash
cd infra
cp .env.example .env
```
2. Các biến môi trường trong file `.env`:
- `POSTGRES_USER`: Tên tài khoản quản trị PostgreSQL (mặc định: `caseuser`).
- `POSTGRES_PASSWORD`: Mật khẩu CSDL (mặc định: `casepassword123`).
- `POSTGRES_DB`: Tên database gốc (mặc định: `lms_education`).
- `RABBITMQ_USER`: Tài khoản RabbitMQ (mặc định: `caseuser`).
- `RABBITMQ_PASSWORD`: Mật khẩu RabbitMQ (mặc định: `casepassword123`).
- `GATEWAY_PORT`: Cổng Nginx / API Gateway (mặc định: `8080`).

> ⚠️ **LƯU Ý:** Không commit file `.env` chứa mật khẩu nhạy cảm lên Git repository!

---

## 4. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG

Dự án cung cấp 2 phương thức khởi chạy linh hoạt:

### Phương án A: Khởi chạy nhanh toàn bộ hệ thống bằng Node.js (Khuyên dùng khi demo / chấm bài)
Phương án này khởi chạy toàn bộ 6 Service, API Gateway và Web Client cùng lúc, có cơ chế tự động Fallback In-Memory EventBus & DB nếu máy chưa bật Docker.
```bash
# 1. Cài đặt dependencies (chỉ thực hiện lần đầu)
npm install

# 2. Khởi chạy toàn bộ hệ thống
npm start
# Hoặc: node run-all.js
```
Truy cập:
- **Giao diện Web Client:** [http://localhost:8080](http://localhost:8080) (qua Gateway) hoặc [http://localhost:3000](http://localhost:3000)
- **API Gateway:** [http://localhost:8080/api/health](http://localhost:8080/api/health)

---

### Phương án B: Khởi chạy bằng Docker Compose (Mô hình hạ tầng chuẩn)
```bash
# 1. Khởi chạy hạ tầng PostgreSQL & RabbitMQ
cd infra
docker-compose up -d postgres rabbitmq

# 2. Kiểm tra container hoạt động
docker-compose ps

# 3. Mở RabbitMQ Management UI để giám sát Queue & Exchange:
# http://localhost:15672 (User: caseuser, Pass: casepassword123)

# 4. Khởi chạy toàn bộ các services và Nginx Gateway
docker-compose up -d
```

---

## 5. HƯỚNG DẪN KIỂM THỬ VÀ BẰNG CHỨNG

### 5.1. Chạy bộ kiểm thử tự động 10 Test Cases (TC01 - TC10)
Chạy script kiểm thử trực tiếp từ terminal:
```bash
npm test
# Hoặc: node tests/test-scenarios.js
```
Hệ thống sẽ tự động thực hiện và in kết quả Pass/Fail cho từng ca kiểm thử:
- `TC01`: Quota đủ, nộp hợp lệ -> `202 Accepted`
- `TC02`: Quota hết -> `409 Conflict (ATTEMPTS_EXCEEDED)`
- `TC03`: Payload rỗng -> `400 Bad Request`
- `TC04`: Mã khóa học sai -> `404 Not Found`
- `TC05`: AI Consumer tạm dừng & khôi phục
- `TC06`: Chống lặp (Idempotency) -> Trả kết quả cũ, không trừ quota 2 lần
- `TC07`: Gateway & Health check -> `200 UP`
- `TC08`: Kiểm tra trừ quota đồng thời an toàn
- `TC09`: Dead Letter Queue (DLQ)
- `TC10`: Tổng hợp trạng thái cuối -> `COMPLETED`

### 5.2. Kiểm thử bằng Postman Collection
Import file collection có sẵn tại:
`tests/postman/IS-CaseStudy02.postman_collection.json` vào Postman và chạy các request tương ứng.

---

## 6. DỪNG VÀ RESET DỮ LIỆU

### Dừng hệ thống (Giữ lại dữ liệu)
```bash
cd infra
docker-compose down
```

### Reset dữ liệu (Xóa toàn bộ dữ liệu CSDL và Broker)
> ⚠️ **CẢNH BÁO:** Lệnh sau sẽ xóa vĩnh viễn named volume `pgdata` và `rabbitmq_data`.
```bash
cd infra
docker-compose down -v
```

---

## 7. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

1. **Lỗi cổng bị chiếm dụng (Port 8080/5432/5672 already in use):**
   - Kiểm tra tiến trình đang chiếm cổng: `netstat -ano | findstr :8080` (trên Windows) và tắt tiến trình xung đột, hoặc đổi cổng trong file `.env`.
2. **Gateway trả về lỗi 502 Bad Gateway:**
   - Đảm bảo các service upstream (`assessment-process`, `course-system`, v.v.) đã được khởi động và cổng đúng như khai báo trong `nginx.conf`.
3. **Consumer không nhận được message:**
   - Kiểm tra log RabbitMQ: `docker-compose logs -f rabbitmq`.
   - Đảm bảo exchange `lms.events` và các binding queue `*.quiz-completed` đã được khai báo chính xác.

---

## 8. PHÂN CÔNG TRÁCH NHIỆM THÀNH VIÊN NHÓM 13

| Thành viên | Trách nhiệm phụ trách |
|---|---|
| **Trần Văn Lộc (Leader)** | Thiết kế kiến trúc tổng thể, cấu hình Nginx Gateway, Docker Compose, điều phối dự án. |
| **Tống Minh Khuê** | Phụ trách `assessment-process`, cài đặt Transactional Outbox Pattern và Status Aggregator. |
| **Trần Lê Phúc Hào** | Phụ trách `course-system`, logic trừ Quota nguyên tử và Schema CSDL PostgreSQL. |
| **Đinh Hữu Phong** | Phụ trách `ai-assistant-system`, thuật toán phân tích kết quả, sinh lộ trình và AI Chatbot. |
| **Nguyễn Đức Anh** | Phụ trách `progress-system`, `notification-system`, viết bộ kịch bản kiểm thử tự động TC01-TC10. |
