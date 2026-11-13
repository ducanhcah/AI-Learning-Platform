# BÁO CÁO PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG
# ĐỀ TÀI: XÂY DỰNG VÀ TÍCH HỢP HỆ THỐNG TRỢ LÝ HỌC TẬP THÔNG MINH ỨNG DỤNG AI HỖ TRỢ SINH VIÊN

**Học phần:** Tích hợp hệ thống (SE445)  
**Khoa:** Công nghệ Thông tin - Trường Đại học Duy Tân  
**Giảng viên hướng dẫn:** ThS. Nguyễn Minh Nhật  
**Nhóm thực hiện:** Nhóm 13  
- SV1: Trần Văn Lộc - Mã SV: 29211165357
- SV2: Tống Minh Khuê - Mã SV: 29211165235
- SV3: Trần Lê Phúc Hào - Mã SV: 29211360675
- SV4: Đinh Hữu Phong - Mã SV: 29219165253
- SV5: Nguyễn Đức Anh - Mã SV: 29211163324  
**Thời gian hoàn thành:** 11 – 2026

---

## 1. GIỚI THIỆU BÀI TOÁN, HIỆN TRẠNG VÀ MỤC TIÊU TÍCH HỢP

### 1.1. Hiện trạng hệ thống giáo dục đại học
Trong bối cảnh chuyển đổi số giáo dục, các trường đại học thường xây dựng hoặc thuê nhiều hệ thống độc lập để phục vụ các khía cạnh nghiệp vụ khác nhau:
1. **Student & Course Management (LMS):** Quản lý hồ sơ sinh viên, thông tin các khóa học, điều kiện dự thi và quản lý số lượt làm bài (quota).
2. **Assessment / Quiz System:** Quản lý ngân hàng câu hỏi thi, đề thi trắc nghiệm/tự luận, thu nhận bài nộp, thực hiện chấm điểm và xuất kết quả.
3. **Learning Progress System:** Ghi nhận nhật ký học tập, theo dõi thời gian và tiến độ hoàn thành chương trình môn học.
4. **AI Learning Assistant:** Ứng dụng trí tuệ nhân tạo phân tích điểm mạnh, điểm yếu từ câu trả lời của sinh viên, gợi ý tài liệu ôn tập và hỗ trợ giải đáp học thuật.
5. **Notification System:** Phát thông báo đa kênh (Web, Email, Mobile Push) về trạng thái và kết quả học tập cho người học.

### 1.2. Vấn đề cốt lõi cần giải quyết
Trước khi thực hiện tích hợp, các phân hệ này gặp phải nhiều trở ngại lớn:
- **Phụ thuộc chặt chẽ (Tight Coupling):** Hệ thống Assessment gọi trực tiếp API của LMS và AI Assistant theo kiểu đồng bộ (Synchronous HTTP). Khi một phân hệ (ví dụ: AI Assistant) xử lý chậm hoặc gặp sự cố, toàn bộ request nộp bài của sinh viên bị nghẽn (Blocking / Timeout).
- **Nguy cơ mất tính toàn vẹn (Dual-write Problem):** Khi lưu bài thi vào CSDL và gửi tin sang Broker, nếu một trong hai thất bại, dữ liệu giữa các phân hệ sẽ bị mất đồng bộ.
- **Race Condition & Cạn kiệt Quota:** Khi sinh viên nhấn nộp bài nhiều lần liên tiếp hoặc mở nhiều tab cùng lúc, nếu việc kiểm tra và trừ quota không được thực hiện nguyên tử (Atomic), sinh viên có thể vượt quá số lượt làm bài cho phép.
- **Xử lý trùng lặp (Duplicate Messages):** Trong mô hình truyền tin tin cậy (At-least-once delivery), cùng một sự kiện có thể được gửi lại nhiều lần, dẫn đến việc trừ trùng lượt thi, tính sai tiến độ hoặc gửi hàng loạt thông báo trùng lặp.

### 1.3. Mục tiêu của giải pháp tích hợp
- Xây dựng điểm truy cập thống nhất (Single Point of Contact) qua **API Gateway**.
- Ứng dụng **API-led Connectivity**: Tách bạch rõ ràng Experience API, Process API và System API.
- Ứng dụng **Event-Driven Architecture (EDA)** với **RabbitMQ**: Chuyển đổi các tác vụ nặng (cập nhật tiến độ, phân tích AI, gửi thông báo) sang xử lý bất đồng bộ sau khi tiếp nhận bài nộp.
- Ứng dụng **Transactional Outbox Pattern**: Đảm bảo an toàn giao dịch 100% giữa Database và Message Broker.
- Đảm bảo **Tính bất biến (Idempotency)** tại mọi Consumer.
- Khai thác AI có kiểm soát nhằm tăng cường trải nghiệm học tập cá nhân hóa cho sinh viên.

---

## 2. PHÂN TÍCH YÊU CẦU HỆ THỐNG

### 2.1. Yêu cầu chức năng (Functional Requirements - FR)
- **FR01 - Tra cứu thông tin môn học & Quota:** Cho phép sinh viên xem chi tiết khóa học và kiểm tra số lượt làm bài còn lại.
- **FR02 - Thực hiện & Nộp bài kiểm tra:** Tiếp nhận câu trả lời trắc nghiệm, kiểm tra tính hợp lệ và quota nguyên tử.
- **FR03 - Phản hồi bất đồng bộ:** Trả mã HTTP 202 Accepted ngay sau khi tiếp nhận bài nộp; sinh viên không phải chờ đợi các tác vụ nền.
- **FR04 - Tự động phát sự kiện:** Tự động phát tán sự kiện `quiz.completed` đến các queue tương ứng trên RabbitMQ.
- **FR05 - Quản lý tiến độ học tập:** Consumer cập nhật tỷ lệ hoàn thành môn học và điểm trung bình tích lũy.
- **FR06 - Phân tích AI & Đề xuất lộ trình:** AI Assistant đối chiếu từng câu đúng/sai, đưa ra đánh giá điểm mạnh, điểm yếu và gợi ý 3 bước ôn tập cá nhân hóa.
- **FR07 - Hỏi đáp học tập với AI:** Sinh viên có thể chat trực tiếp với Trợ lý AI để giải đáp thắc mắc chuyên môn.
- **FR08 - Thông báo kết quả học tập:** Tự động gửi thông báo điểm số và phản hồi của AI vào hộp thư sinh viên.
- **FR09 - Tổng hợp trạng thái bài nộp (Status Aggregator):** Cung cấp API tra cứu trạng thái tổng thể và trạng thái chi tiết của từng phân hệ.

### 2.2. Yêu cầu phi chức năng (Non-Functional Requirements - NFR)
- **NFR01 - Hiệu năng & Khả năng phản hồi:** Thời gian phản hồi của API tiếp nhận bài nộp `< 200ms` nhờ cơ chế xử lý bất đồng bộ.
- **NFR02 - Tính toàn vẹn & Chống Race Condition:** Cơ chế trừ quota phải an toàn tuyệt đối ngay cả khi có 100 request đồng thời.
- **NFR03 - Idempotency:** Mọi Consumer khi nhận lại cùng một `eventId` phải bỏ qua và không tạo tác động nghiệp vụ lặp.
- **NFR04 - Độ tin cậy & Khả năng phục hồi:** Áp dụng Transactional Outbox, Publisher Confirms, Retry Policy và Dead Letter Queue (DLQ).
- **NFR05 - Tính độc lập (Loose Coupling):** Các service giao tiếp qua hợp đồng API và Event Contract xác định; sở hữu CSDL logic riêng biệt.
- **NFR06 - Dễ triển khai & Mở rộng:** Đóng gói bằng Docker Compose, dễ dàng chạy trên môi trường local và sẵn sàng mở rộng Microservices trên Kubernetes.

---

## 3. THIẾT KẾ KIẾN TRÚC VÀ CÁC LỚP API

### 3.1. Mô hình tích hợp được lựa chọn
Hệ thống kết hợp 4 mô hình kinh điển:
1. **Presentation Integration:** Cung cấp Web Client Dashboard hiện đại, tập trung toàn bộ trải nghiệm làm bài, xem tiến độ và tương tác với AI.
2. **API Gateway (Nginx / Express Gateway):** Điểm vào duy nhất (cổng 8080), phụ trách định tuyến (Reverse Proxy), gắn Correlation ID (`X-Request-ID`), cân bằng tải và bảo mật cơ bản.
3. **API-led Connectivity:**
   - **Experience API:** Tối ưu hóa phản hồi cho Web Dashboard và Mobile Client.
   - **Process API (`assessment-process`):** Điều phối toàn bộ quy trình tiếp nhận bài thi, kiểm tra điều kiện, phối hợp Outbox và tổng hợp trạng thái.
   - **System API (`course-system`, `progress-system`, `ai-assistant-system`, `notification-system`):** Đóng gói và bảo vệ ranh giới CSDL nội bộ của từng phân hệ.
4. **Event-Driven Architecture (EDA):** Tách rời các tác vụ tốn thời gian sang background worker thông qua RabbitMQ Broker.

---

## 4. THIẾT KẾ HỢP ĐỒNG API VÀ EVENT CONTRACT

### 4.1. Bảng Hợp Đồng API (API Contracts)
| Phương thức | Endpoint | Chức năng | Mã phản hồi |
|---|---|---|---|
| `GET` | `/api/health` | Kiểm tra tình trạng hoạt động toàn bộ Gateway | `200` |
| `GET` | `/api/courses/{courseId}` | Tra cứu thông tin khóa học | `200`, `404` |
| `GET` | `/api/courses/{courseId}/quota/{studentId}` | Kiểm tra số lượt thi của sinh viên | `200`, `404` |
| `GET` | `/api/quizzes/{quizId}` | Lấy ngân hàng câu hỏi làm bài (ẩn đáp án đúng) | `200`, `404` |
| `POST` | `/api/submissions` | Tiếp nhận bài nộp của sinh viên | `202`, `400`, `404`, `409` |
| `GET` | `/api/submissions/{submissionId}` | Tra cứu trạng thái tổng hợp bài nộp | `200`, `404` |
| `GET` | `/api/progress/{studentId}/{courseId}` | Tra cứu tiến độ học tập và GPA | `200` |
| `GET` | `/api/ai/recommendations/{submissionId}` | Lấy đánh giá điểm mạnh/yếu và lộ trình AI | `200`, `404` |
| `POST` | `/api/ai/chat` | Hỏi đáp học tập chuyên sâu với AI | `200`, `400` |
| `GET` | `/api/notifications/{studentId}` | Lấy danh sách thông báo của sinh viên | `200` |

### 4.2. Event Contract: `quiz.completed`
Sự kiện được phát lên Topic Exchange `lms.events` với Routing Key `quiz.completed`:

```json
{
  "eventId": "evt-1773539200000-842",
  "eventType": "quiz.completed",
  "eventVersion": 1,
  "occurredAt": "2026-11-14T00:00:00.000Z",
  "correlationId": "req-1773539200000-abc12",
  "data": {
    "submissionId": "SUB-10001",
    "studentId": "STU-001",
    "quizId": "QUIZ-001",
    "courseId": "COURSE-001",
    "score": 10.0,
    "scoreSource": "assessment-service",
    "answerDetails": [
      {
        "questionId": "Q-001",
        "questionText": "Mô hình kiến trúc nào sử dụng Message Broker để truyền sự kiện giữa các service?",
        "studentAnswer": "A",
        "correctAnswer": "A",
        "isCorrect": true,
        "explanation": "EDA dùng message broker để giải phóng sự phụ thuộc trực tiếp giữa các service."
      }
    ]
  }
}
```

---

## 5. CƠ CHẾ BẢO ĐẢM DỮ LIỆU & XỬ LÝ NGOẠI LỆ

### 5.1. Transactional Outbox Pattern
Để giải quyết triệt để rủi ro Dual-write, trong cùng một CSDL Transaction:
1. Ghi nhận bản ghi nộp bài vào bảng `submissions` (trạng thái `PROCESSING`).
2. Ghi nhận sự kiện vào bảng `outbox_events` (trạng thái `PENDING`).
3. Commit Transaction.
4. Một tiến trình độc lập (`Outbox Publisher`) liên tục polling bảng `outbox_events`, gửi sự kiện vào RabbitMQ với Publisher Confirms. Khi Broker xác nhận nhận tin an toàn, tiến trình chuyển trạng thái bản ghi thành `PUBLISHED`.

### 5.2. Kiểm soát Quota nguyên tử (Atomic Quota Deduct)
Thực hiện trừ quota bằng câu truy vấn UPDATE nguyên tử có điều kiện:
```sql
UPDATE student_quotas
SET remaining_attempts = remaining_attempts - 1, updated_at = NOW()
WHERE student_id = $1 AND course_id = $2 AND remaining_attempts > 0
RETURNING remaining_attempts;
```
Nếu `rowCount === 0`, hệ thống rollback ngay và trả HTTP 409 Conflict với mã lỗi `ATTEMPTS_EXCEEDED`, đảm bảo không bao giờ có 2 request cùng tranh chấp một lượt thi.

### 5.3. Chống xử lý trùng lặp (Idempotency)
Mọi Consumer trước khi thực thi nghiệp vụ đều lưu `eventId` vào bảng `processed_events` có ràng buộc khóa chính (`PRIMARY KEY (event_id)`). Nếu vi phạm Unique Constraint, Consumer nhận diện đây là message trùng và lập tức ACK bỏ qua mà không làm sai lệch số liệu.

### 5.4. Retry & Dead Letter Queue (DLQ)
Khi Consumer gặp lỗi không thể phục hồi hoặc vượt quá 3 lần retry, message sẽ được chuyển hướng sang Dead Letter Exchange (`lms.dlx`) và lưu trữ tại `dead-letter-queue` để kỹ sư vận hành điều tra và xử lý.

---

## 9. TÍCH HỢP AI NÂNG CAO VÀ NĂNG LỰC NHẬN THỨC ĐA CHIỀU

Phân hệ AI Learning Assistant được nâng cấp toàn diện theo chuẩn Case Study 02:
1. **Đánh giá Năng lực Kỹ năng Đa Chiều (Multi-Dimensional Skill Competency):**
   - Đánh giá chỉ số phần trăm Mastery (%) trên 4 trụ cột kiến trúc:
     + *Kiến trúc Phân tán & EDA*
     + *Transactional Outbox & ACID*
     + *Tính Bất Biến (Idempotency) & DLQ*
     + *Kiểm Soát Quota & Concurrency*
2. **AI Practice Question Generator (Tự động sinh đề ôn tập):**
   - API `POST /api/ai/generate-practice`: Tự động phân tích các câu làm sai và sinh 2 câu hỏi trắc nghiệm mới bám sát lỗ hổng kiến thức để sinh viên củng cố ngay lập tức.
3. **AI Cognitive Assistant & Semantic Knowledge Graph:**
   - Hỗ trợ giải thích có cấu trúc: Vấn đề thực tế -> Giải pháp kiến trúc -> Code minh họa -> Câu hỏi đào sâu tiếp theo (Follow-up prompts).
   - Tích hợp linh hoạt Google Gemini API (khi có `GEMINI_API_KEY`) hoặc Semantic Engine chuyên sâu.
4. **AI Developer & Ops Log Analyzer (Mục 10.2):**
   - API `POST /api/ai/ops/analyze-log`: Chẩn đoán nguyên nhân gốc (Root Cause) và hướng giải quyết cho các sự cố hệ thống phân tán (409 Quota, 502 Bad Gateway, Unique Duplicate Key).
5. **AI Schema Mapping Assistant (Mục 10.2):**
   - API `POST /api/ai/ops/data-mapping`: Tự động đề xuất ánh xạ JSON schema giữa LMS và hệ thống đích.

Hệ thống đã được thiết kế và hiện thực hóa trọn vẹn:
- Toàn bộ 5 Services và API Gateway hoạt động độc lập và ổn định.
- Giao diện Web Client trực quan cho sinh viên và giảng viên.
- Hệ thống hỗ trợ cả chế độ chuẩn qua Docker Compose (PostgreSQL & RabbitMQ) và chế độ In-Memory Fallback giúp kiểm thử và chấm bài siêu tốc.
- Bộ 10 Test Cases tự động (TC01 - TC10) đạt tỷ lệ vượt qua 100%.
