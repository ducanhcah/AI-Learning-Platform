# BÁO CÁO KẾT QUẢ KIỂM THỬ HỆ THỐNG (TEST REPORT)
**Đề tài:** Xây dựng và tích hợp hệ thống trợ lý học tập thông minh ứng dụng AI hỗ trợ sinh viên  
**Học phần:** Tích hợp hệ thống (SE445) - Nhóm 13  
**Ngày thực hiện kiểm thử:** 14/11/2026  
**Môi trường kiểm thử:** Local Node.js v24.22.1, Windows 10/11, API Gateway (:8080)

---

## 1. MỤC TIÊU VÀ PHẠM VI KIỂM THỬ

Mục tiêu là xác minh tính đúng đắn và độ tin cậy của toàn bộ nền tảng tích hợp theo đúng ma trận kiểm thử tại **Mục 9.2 của Case Study 02**, bao gồm:
1. Tính toàn vẹn của luồng nộp bài bất đồng bộ qua API Gateway.
2. Kiểm soát Quota nguyên tử và chống Race Condition khi có request đồng thời.
3. Độ tin cậy của mẫu thiết kế Transactional Outbox.
4. Tính bất biến (Idempotency) khi xảy ra sự cố gửi lặp sự kiện / lặp request.
5. Khả năng chịu lỗi khi phân hệ AI Assistant tạm dừng và cơ chế Dead Letter Queue (DLQ).
6. Khả năng tổng hợp trạng thái (Status Aggregation) từ tất cả các Consumer.

---

## 2. BẢNG TỔNG HỢP KẾT QUẢ 10 TEST CASES (TC01 - TC10)

| ID | Điều kiện kiểm thử | Kết quả kỳ vọng | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| **TC01** | Sinh viên STU-001 còn 3 lượt làm bài, nộp bài hợp lệ | Trả `HTTP 202 Accepted`, tạo `submissionId`, trạng thái `PROCESSING`, ghi nhận Outbox Event | Trả về `202 Accepted`, `submissionId: SUB-10001`, `status: PROCESSING`. Outbox chuyển sang `PUBLISHED`. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC02** | Sinh viên STU-003 hết quota (0 lượt), gửi bài nộp | Trả `HTTP 409 Conflict`, mã lỗi `ATTEMPTS_EXCEEDED`, không tạo event hoàn thành | Trả về `409 Conflict`, JSON: `{"error": {"code": "ATTEMPTS_EXCEEDED", "message": "Sinh viên không còn lượt làm bài hợp lệ."}}`. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC03** | Gửi request thiếu trường `answers` hoặc mảng rỗng | Trả `HTTP 400 Bad Request`, mã lỗi `INVALID_PAYLOAD`, không tạo submission | Trả về `400 Bad Request`, JSON: `{"error": {"code": "INVALID_PAYLOAD", ...}}`. Không ghi nhận vào CSDL. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC04** | Gửi request với mã `courseId` không tồn tại (`COURSE-UNKNOWN-999`) | Trả `HTTP 404 Not Found`, mã lỗi `COURSE_NOT_FOUND` | Trả về `404 Not Found`, JSON: `{"error": {"code": "COURSE_NOT_FOUND", ...}}`. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC05** | Phân hệ AI Consumer tạm dừng hoạt động (Paused) | Message được giữ an toàn trong buffer/queue, sau khi Consumer khôi phục thì xử lý bình thường | API `/api/ai/toggle-pause` chuyển cờ dừng, message giữ nguyên trạng thái retry, khi bật lại AI Consumer xử lý thành công. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC06** | Gửi lại cùng `idempotencyKey` hoặc phát lại cùng `eventId` | Hệ thống nhận diện sự kiện trùng, không trừ quota lần 2, không nhân đôi tiến độ hoặc thông báo | Request thứ 2 trả về `200 OK` với dữ liệu bài nộp cũ. Các Consumer log: `[Consumer] BỎ QUA EVENT TRÙNG (Idempotency)`. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC07** | Kiểm tra Health Check qua API Gateway (:8080) | Toàn bộ các service trả về `200 UP` | Endpoint `/api/courses/health`, `/api/submissions/health`, `/api/ai/health` đều trả `200 OK` kèm timestamp. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC08** | Gửi 2 request nộp bài đồng thời cùng lúc với quota = 1 | Chỉ có 1 request thành công (202), request còn lại bị chặn (409), quota không bị âm | Request 1 nhận `202 Accepted` và trừ quota về 0; Request 2 nhận `409 Conflict (ATTEMPTS_EXCEEDED)`. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC09** | Gửi message không hợp lệ hoặc xử lý lỗi quá số lần quy định | Message được chuyển hướng an toàn vào Dead Letter Queue (DLQ) | Message lỗi được đẩy sang Exchange `lms.dlx` và lưu tại hàng đợi `dead-letter-queue`. Không bị mất dữ liệu. | <span style="color:green;font-weight:bold;">PASS</span> |
| **TC10** | Kiểm tra tổng hợp trạng thái (Status Aggregator) | Khi Course, Progress, AI và Notification cùng hoàn tất, overall status chuyển thành `COMPLETED` | Polling endpoint `/api/submissions/{id}` sau 1.5s ghi nhận `status: COMPLETED`, điểm số `10/10`, tiến độ tăng và thông báo đã tạo. | <span style="color:green;font-weight:bold;">PASS</span> |

---

## 3. MINH CHỨNG THỰC THI (LOGS & CURL EVIDENCE)

### 3.1. Minh chứng TC01 - Nộp bài thành công (202 Accepted)
```bash
$ curl -X POST http://localhost:8080/api/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU-001",
    "quizId": "QUIZ-001",
    "courseId": "COURSE-001",
    "answers": [
      {"questionId": "Q-001", "answer": "A"},
      {"questionId": "Q-002", "answer": "B"},
      {"questionId": "Q-003", "answer": "C"}
    ]
  }'

# Phản hồi từ Server:
HTTP/1.1 202 Accepted
Content-Type: application/json
{
  "submissionId": "SUB-10001",
  "status": "PROCESSING",
  "message": "Bài nộp đã được tiếp nhận để xử lý."
}
```

### 3.2. Minh chứng TC02 - Hết Quota (409 Conflict)
```bash
$ curl -X POST http://localhost:8080/api/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU-003",
    "quizId": "QUIZ-001",
    "courseId": "COURSE-001",
    "answers": [{"questionId": "Q-001", "answer": "A"}]
  }'

# Phản hồi từ Server:
HTTP/1.1 409 Conflict
Content-Type: application/json
{
  "error": {
    "code": "ATTEMPTS_EXCEEDED",
    "message": "Sinh viên không còn lượt làm bài hợp lệ."
  }
}
```

### 3.3. Minh chứng TC10 - Trạng thái tổng hợp hoàn tất (COMPLETED)
```bash
$ curl http://localhost:8080/api/submissions/SUB-10001

# Phản hồi từ Server:
HTTP/1.1 200 OK
Content-Type: application/json
{
  "submissionId": "SUB-10001",
  "studentId": "STU-001",
  "quizId": "QUIZ-001",
  "score": 10.0,
  "status": "COMPLETED",
  "components": {
    "courseStatus": "COMPLETED",
    "progressStatus": "COMPLETED",
    "aiStatus": "COMPLETED",
    "notificationStatus": "COMPLETED"
  },
  "completedAt": "2026-11-14T00:01:05.120Z"
}
```

---

## 4. KẾT LUẬN KIỂM THỬ
- **Tỷ lệ Pass:** 10/10 Test Cases (100%).
- **Đánh giá:** Hệ thống đáp ứng đầy đủ tất cả các yêu cầu chức năng và phi chức năng nêu trong Case Study 02. Đảm bảo an toàn dữ liệu, tính nhất quán cuối cùng và độ sẵn sàng cao.
