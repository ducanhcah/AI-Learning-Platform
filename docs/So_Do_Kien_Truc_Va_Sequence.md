# SƠ ĐỒ HỆ THỐNG VÀ SEQUENCE DIAGRAM
**Đề tài:** Xây dựng và tích hợp hệ thống trợ lý học tập thông minh ứng dụng AI hỗ trợ sinh viên  
**Học phần:** Tích hợp hệ thống (SE445) - Đại học Duy Tân  
**Nhóm thực hiện:** Nhóm 13 (GVHD: ThS. Nguyễn Minh Nhật)  

---

## 1. Sơ đồ Kiến Trúc Tổng Thể (Overall Integration Architecture)

Hệ thống kết hợp giữa **Presentation Integration**, **API-led Connectivity** và **Event-Driven Architecture (EDA)** với mô hình **Transactional Outbox**:

```mermaid
flowchart TB
    subgraph Clients["Lớp Trình Diễn (Presentation Layer)"]
        WebClient["Web Client Dashboard\n(Sinh viên & Giảng viên)"]
        MobileClient["Mobile App / Postman"]
    end

    subgraph GatewayLayer["Điểm Truy Cập Thống Nhất"]
        Gateway["Nginx / Express API Gateway\n(:8080)"]
    end

    subgraph ProcessLayer["Lớp Điều Phối (Process API)"]
        AssessmentProc["Assessment Process API\n(:3001)"]
        StatusAgg["Submission Status Aggregator\n(Tổng hợp trạng thái)"]
        OutboxTable[("Bảng Outbox Events\n(Transactional Outbox)")]
        OutboxWorker["Outbox Publisher Worker"]
    end

    subgraph Broker["Message Broker (Event-Driven Broker)"]
        Exchange["RabbitMQ Topic Exchange\n'lms.events'"]
        Q_Course["Queue: course.quiz-completed"]
        Q_Progress["Queue: progress.quiz-completed"]
        Q_AI["Queue: ai.quiz-completed"]
        Q_Notify["Queue: notify.quiz-completed"]
        DLX["Dead Letter Exchange\n'lms.dlx' & DLQ"]
    end

    subgraph SystemLayer["Lớp Dịch Vụ Hệ Thống (System APIs & Consumers)"]
        CourseSys["Course LMS System\n(:3002)"]
        ProgressSys["Learning Progress System\n(:3003)"]
        AISys["AI Learning Assistant System\n(:3004)"]
        NotifySys["Notification System\n(:3005)"]
    end

    subgraph DataLayer["Cơ Sở Dữ Liệu Riêng (Database per Service Logic)"]
        CourseDB[("Course DB\n(courses, student_quotas)")]
        AssessDB[("Assessment DB\n(quizzes, submissions)")]
        ProgressDB[("Progress DB\n(student_progress)")]
        AIDB[("AI DB\n(ai_evaluations, study_plans)")]
        NotifyDB[("Notification DB\n(notifications)")]
    end

    %% Client Routing
    WebClient -->|HTTP Request| Gateway
    MobileClient -->|HTTP Request| Gateway

    %% Gateway Routing
    Gateway -->|GET /courses| CourseSys
    Gateway -->|POST /submissions\nGET /submissions/:id| AssessmentProc
    Gateway -->|GET /progress| ProgressSys
    Gateway -->|GET /ai, POST /ai/chat| AISys
    Gateway -->|GET /notifications| NotifySys

    %% Assessment & Outbox
    AssessmentProc <-->|Check Quota Nguyên Tử| CourseSys
    AssessmentProc -->|1. Lưu Submission & Event| AssessDB
    AssessmentProc -.->|Ghi vào Outbox| OutboxTable
    OutboxWorker -->|Đọc PENDING events| OutboxTable
    OutboxWorker -->|2. Publish quiz.completed| Exchange

    %% RabbitMQ Bindings
    Exchange -->|routing: quiz.completed| Q_Course
    Exchange -->|routing: quiz.completed| Q_Progress
    Exchange -->|routing: quiz.completed| Q_AI
    Exchange -->|routing: quiz.completed| Q_Notify
    Exchange -.->|Lỗi quá số lần| DLX

    %% Consumers
    Q_Course -->|Consume event| CourseSys
    Q_Progress -->|Consume event| ProgressSys
    Q_AI -->|Consume event| AISys
    Q_Notify -->|Consume event| NotifySys

    %% Databases
    CourseSys <--> CourseDB
    ProgressSys <--> ProgressDB
    AISys <--> AIDB
    NotifySys <--> NotifyDB

    %% Aggregator
    CourseSys -.->|Done| StatusAgg
    ProgressSys -.->|Done| StatusAgg
    AISys -.->|Done| StatusAgg
    NotifySys -.->|Done| StatusAgg
    StatusAgg -->|Update COMPLETED| AssessDB
```

---

## 2. Sequence Diagram: Luồng Nộp Bài Bất Đồng Bộ (Asynchronous Quiz Submission)

Biểu đồ tuần tự mô tả chi tiết từ lúc Client nộp bài, kiểm tra Quota nguyên tử, ghi nhận Transactional Outbox, trả HTTP 202 Accepted, đến khi RabbitMQ phân phối cho các Consumers và Status Aggregator hoàn tất trạng thái:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Client / Sinh viên
    participant GW as API Gateway (:8080)
    participant AP as Assessment Process (:3001)
    participant CS as Course System (:3002)
    participant DB as Assessment DB
    participant OB as Outbox Publisher
    participant MQ as RabbitMQ (lms.events)
    participant PS as Progress Consumer (:3003)
    participant AI as AI Assistant Consumer (:3004)
    participant NS as Notification Consumer (:3005)

    Note over Client, GW: Giai đoạn 1: Tiếp nhận yêu cầu đồng bộ
    Client->>GW: POST /api/submissions (studentId, quizId, answers, idempotencyKey)
    GW->>AP: Forward POST /submissions
    AP->>AP: Validate Payload & Check Idempotency Key
    AP->>CS: POST /courses/:id/deduct-quota (Atomic Quota Check)
    alt Quota <= 0 (Hết lượt làm bài)
        CS-->>AP: 409 Conflict (ATTEMPTS_EXCEEDED)
        AP-->>GW: 409 Conflict
        GW-->>Client: 409 Conflict (Sinh viên không còn lượt làm bài)
    else Quota hợp lệ
        CS-->>AP: 200 OK (Quota deducted)
        AP->>AP: Server-side Grading (Tính điểm chuẩn xác)
        AP->>DB: BEGIN TRANSACTION
        AP->>DB: INSERT INTO submissions (status = 'PROCESSING')
        AP->>DB: INSERT INTO outbox_events (status = 'PENDING')
        AP->>DB: COMMIT TRANSACTION
        AP-->>GW: HTTP 202 Accepted { submissionId, status: "PROCESSING" }
        GW-->>Client: HTTP 202 Accepted
    end

    Note over Client, GW: Giai đoạn 2: Xử lý sự kiện bất đồng bộ (EDA)
    OB->>DB: Polling PENDING outbox events
    OB->>MQ: Publish "quiz.completed" (Topic: lms.events)
    MQ-->>OB: Publisher Confirm (ACK)
    OB->>DB: UPDATE outbox_events SET status = 'PUBLISHED'

    par Phân phối tới các Consumers
        MQ->>CS: Delivery message to course.quiz-completed
        CS->>CS: Check Idempotency (processed_events) & ACK
    and
        MQ->>PS: Delivery message to progress.quiz-completed
        PS->>PS: Check Idempotency, Update % & GPA, ACK
        PS->>AP: Notify Component Done (progress)
    and
        MQ->>AI: Delivery message to ai.quiz-completed
        AI->>AI: Check Idempotency, Phân tích điểm mạnh/yếu, gợi ý lộ trình, ACK
        AI->>AP: Notify Component Done (ai)
    and
        MQ->>NS: Delivery message to notify.quiz-completed
        NS->>NS: Check Idempotency, Tạo thông báo điểm & nhận xét AI, ACK
        NS->>AP: Notify Component Done (notify)
    end

    Note over AP, DB: Giai đoạn 3: Tổng hợp trạng thái cuối (Aggregator)
    AP->>DB: Khi mọi components COMPLETED -> UPDATE submissions SET status = 'COMPLETED'
    
    Note over Client, GW: Giai đoạn 4: Tra cứu trạng thái từ Client
    loop Polling mỗi 1 giây
        Client->>GW: GET /api/submissions/{submissionId}
        GW->>AP: Forward GET /submissions/{submissionId}
        AP-->>Client: 200 OK { status: "COMPLETED", score: 10.0, components: {...} }
    end
    Client->>GW: GET /api/ai/recommendations/{submissionId}
    GW-->>Client: Hiển thị nhận xét AI và Lộ trình ôn tập cá nhân hóa
```

---

## 3. Sơ đồ Thực Thể Dữ Liệu (Entity Relationship & Database per Service)

```mermaid
erDiagram
    %% Course DB
    COURSE {
        string course_id PK
        string title
        text description
        int max_attempts
    }
    STUDENT_QUOTA {
        int id PK
        string student_id FK
        string course_id FK
        int remaining_attempts
        int total_attempts
    }

    %% Assessment DB
    QUIZ {
        string quiz_id PK
        string course_id
        string title
        numeric pass_score
    }
    QUESTION {
        string question_id PK
        string quiz_id FK
        text question_text
        jsonb options
        string correct_answer
    }
    SUBMISSION {
        string submission_id PK
        string student_id
        string quiz_id FK
        numeric score
        string status
        string idempotency_key
        jsonb answers
    }
    OUTBOX_EVENT {
        int id PK
        string event_id UK
        string event_type
        jsonb payload
        string status
    }

    %% AI DB
    AI_EVALUATION {
        int id PK
        string submission_id UK
        string student_id
        numeric score
        text strengths
        text weaknesses
        jsonb study_plan
    }

    %% Notification DB
    NOTIFICATION {
        int id PK
        string student_id
        string submission_id
        string title
        text message
        boolean is_read
    }

    COURSE ||--o{ STUDENT_QUOTA : has
    QUIZ ||--o{ QUESTION : contains
    QUIZ ||--o{ SUBMISSION : receives
    SUBMISSION ||--|| OUTBOX_EVENT : generates
    SUBMISSION ||--o| AI_EVALUATION : evaluated_by
    SUBMISSION ||--o| NOTIFICATION : alerts
```
