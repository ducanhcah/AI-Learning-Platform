-- Khởi tạo các database logic cho từng hệ thống (Database per Service logic)
CREATE DATABASE course_db;
CREATE DATABASE assessment_db;
CREATE DATABASE progress_db;
CREATE DATABASE ai_db;
CREATE DATABASE notify_db;

-- 1. Schema cho course_db
\c course_db;

CREATE TABLE IF NOT EXISTS courses (
    course_id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    max_attempts INT DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_quotas (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    course_id VARCHAR(50) NOT NULL,
    remaining_attempts INT NOT NULL,
    total_attempts INT NOT NULL DEFAULT 3,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_course UNIQUE (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu cho course_db
INSERT INTO courses (course_id, title, description, max_attempts) VALUES
('COURSE-001', 'Kiến trúc phần mềm và Tích hợp hệ thống', 'Khóa học cung cấp kiến thức về API-led connectivity, EDA, RabbitMQ và Microservices', 3),
('COURSE-002', 'Lập trình Web nâng cao', 'Xây dựng ứng dụng full-stack với Node.js, Express và React', 3)
ON CONFLICT (course_id) DO NOTHING;

INSERT INTO student_quotas (student_id, course_id, remaining_attempts, total_attempts) VALUES
('STU-001', 'COURSE-001', 3, 3),
('STU-002', 'COURSE-001', 1, 3),
('STU-003', 'COURSE-001', 0, 3)
ON CONFLICT (student_id, course_id) DO NOTHING;


-- 2. Schema cho assessment_db
\c assessment_db;

CREATE TABLE IF NOT EXISTS quizzes (
    quiz_id VARCHAR(50) PRIMARY KEY,
    course_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    total_questions INT DEFAULT 5,
    pass_score NUMERIC(4,2) DEFAULT 5.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
    question_id VARCHAR(50) PRIMARY KEY,
    quiz_id VARCHAR(50) NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer VARCHAR(10) NOT NULL,
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
    submission_id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    quiz_id VARCHAR(50) NOT NULL,
    course_id VARCHAR(50) NOT NULL,
    score NUMERIC(4,2),
    status VARCHAR(30) NOT NULL, -- RECEIVED, PROCESSING, COMPLETED, PARTIALLY_COMPLETED, FAILED
    idempotency_key VARCHAR(100),
    answers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_submission_idempotency UNIQUE (student_id, quiz_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS submission_statuses (
    submission_id VARCHAR(50) PRIMARY KEY,
    overall_status VARCHAR(30) NOT NULL,
    course_status VARCHAR(30) DEFAULT 'PENDING',
    progress_status VARCHAR(30) DEFAULT 'PENDING',
    ai_status VARCHAR(30) DEFAULT 'PENDING',
    notify_status VARCHAR(30) DEFAULT 'PENDING',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_version INT DEFAULT 1,
    correlation_id VARCHAR(100),
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

-- Dữ liệu mẫu cho assessment_db
INSERT INTO quizzes (quiz_id, course_id, title, total_questions, pass_score) VALUES
('QUIZ-001', 'COURSE-001', 'Kiểm tra trắc nghiệm Kiến trúc Tích hợp & RabbitMQ', 3, 5.0)
ON CONFLICT (quiz_id) DO NOTHING;

INSERT INTO questions (question_id, quiz_id, question_text, options, correct_answer, explanation) VALUES
('Q-001', 'QUIZ-001', 'Mô hình kiến trúc nào sử dụng Message Broker để truyền sự kiện giữa các service?', '{"A": "Event-Driven Architecture (EDA)", "B": "Monolithic Architecture", "C": "File-based Integration", "D": "Shared Memory"}', 'A', 'EDA dùng message broker để giải phóng sự phụ thuộc trực tiếp giữa các service.'),
('Q-002', 'QUIZ-001', 'Mẫu thiết kế nào giúp đảm bảo lưu trữ Database và gửi message vào Broker trong cùng một giao dịch?', '{"A": "Saga Pattern", "B": "Transactional Outbox Pattern", "C": "Circuit Breaker", "D": "CQRS"}', 'B', 'Transactional Outbox lưu event vào bảng outbox trong cùng transaction của nghiệp vụ.'),
('Q-003', 'QUIZ-001', 'Tính chất nào giúp consumer xử lý cùng một message nhiều lần mà không làm sai lệch dữ liệu?', '{"A": "Scalability", "B": "High Availability", "C": "Idempotency", "D": "ACID"}', 'C', 'Idempotency đảm bảo nhận trùng message không làm thay đổi trạng thái quá một lần.')
ON CONFLICT (question_id) DO NOTHING;


-- 3. Schema cho progress_db
\c progress_db;

CREATE TABLE IF NOT EXISTS student_progress (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    course_id VARCHAR(50) NOT NULL,
    completed_quizzes INT DEFAULT 0,
    average_score NUMERIC(4,2) DEFAULT 0,
    completion_rate NUMERIC(5,2) DEFAULT 0.0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_progress UNIQUE (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 4. Schema cho ai_db
\c ai_db;

CREATE TABLE IF NOT EXISTS ai_evaluations (
    id SERIAL PRIMARY KEY,
    submission_id VARCHAR(50) UNIQUE NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    quiz_id VARCHAR(50) NOT NULL,
    score NUMERIC(4,2) NOT NULL,
    strengths TEXT,
    weaknesses TEXT,
    recommendations TEXT,
    study_plan JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 5. Schema cho notify_db
\c notify_db;

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    submission_id VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
