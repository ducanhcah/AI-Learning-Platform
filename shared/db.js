class DatabaseManager {
    constructor() {
        this.pools = new Map();
        this.memoryStore = {
            courses: [
                {
                    course_id: 'COURSE-001',
                    title: 'Kiến trúc phần mềm và Tích hợp hệ thống',
                    description: 'Khóa học về API-led connectivity, EDA, RabbitMQ, Microservices và Outbox Pattern',
                    max_attempts: 3
                },
                {
                    course_id: 'COURSE-002',
                    title: 'Lập trình Web nâng cao & Phân tán',
                    description: 'Phát triển hệ thống web với Node.js, Event Bus và AI Integration',
                    max_attempts: 3
                }
            ],
            student_quotas: [
                { student_id: 'STU-001', course_id: 'COURSE-001', remaining_attempts: 3, total_attempts: 3 },
                { student_id: 'STU-002', course_id: 'COURSE-001', remaining_attempts: 1, total_attempts: 3 },
                { student_id: 'STU-003', course_id: 'COURSE-001', remaining_attempts: 0, total_attempts: 3 }
            ],
            quizzes: [
                {
                    quiz_id: 'QUIZ-001',
                    course_id: 'COURSE-001',
                    title: 'Kiểm tra trắc nghiệm Kiến trúc Tích hợp & RabbitMQ',
                    total_questions: 3,
                    pass_score: 5.0
                }
            ],
            questions: [
                {
                    question_id: 'Q-001',
                    quiz_id: 'QUIZ-001',
                    question_text: 'Mô hình kiến trúc nào sử dụng Message Broker để truyền sự kiện giữa các service?',
                    options: { A: 'Event-Driven Architecture (EDA)', B: 'Monolithic Architecture', C: 'File-based Integration', D: 'Shared Memory' },
                    correct_answer: 'A',
                    explanation: 'EDA dùng message broker để giải phóng sự phụ thuộc trực tiếp giữa các service.'
                },
                {
                    question_id: 'Q-002',
                    quiz_id: 'QUIZ-001',
                    question_text: 'Mẫu thiết kế nào giúp đảm bảo lưu trữ Database và gửi message vào Broker trong cùng một giao dịch?',
                    options: { A: 'Saga Pattern', B: 'Transactional Outbox Pattern', C: 'Circuit Breaker', D: 'CQRS' },
                    correct_answer: 'B',
                    explanation: 'Transactional Outbox lưu event vào bảng outbox trong cùng transaction của nghiệp vụ.'
                },
                {
                    question_id: 'Q-003',
                    quiz_id: 'QUIZ-001',
                    question_text: 'Tính chất nào giúp consumer xử lý cùng một message nhiều lần mà không làm sai lệch dữ liệu?',
                    options: { A: 'Scalability', B: 'High Availability', C: 'Idempotency', D: 'ACID' },
                    correct_answer: 'C',
                    explanation: 'Idempotency đảm bảo nhận trùng message không làm thay đổi trạng thái quá một lần.'
                }
            ],
            submissions: [],
            submission_statuses: {},
            outbox_events: [],
            student_progress: {},
            ai_evaluations: {},
            notifications: [],
            processed_events: new Set()
        };
    }

    // Atomic Deduct Quota
    async deductQuota(studentId, courseId) {
        try {
            const { Pool } = require('pg');
            const pool = new Pool({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432', 10),
                user: process.env.DB_USER || 'caseuser',
                password: process.env.DB_PASS || 'casepassword123',
                database: 'course_db',
                connectionTimeoutMillis: 1000
            });
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const res = await client.query(
                    `UPDATE student_quotas
                     SET remaining_attempts = remaining_attempts - 1, updated_at = NOW()
                     WHERE student_id = $1 AND course_id = $2 AND remaining_attempts > 0
                     RETURNING remaining_attempts`,
                    [studentId, courseId]
                );
                if (res.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return { success: false, reason: 'ATTEMPTS_EXCEEDED' };
                }
                await client.query('COMMIT');
                return { success: true, remaining: res.rows[0].remaining_attempts };
            } finally {
                client.release();
            }
        } catch (e) {
            // Memory fallback
            const quota = this.memoryStore.student_quotas.find(
                q => q.student_id === studentId && q.course_id === courseId
            );
            if (!quota) {
                return { success: false, reason: 'STUDENT_NOT_ENROLLED' };
            }
            if (quota.remaining_attempts <= 0) {
                return { success: false, reason: 'ATTEMPTS_EXCEEDED' };
            }
            quota.remaining_attempts -= 1;
            return { success: true, remaining: quota.remaining_attempts };
        }
    }

    // Idempotent Event Check & Mark
    async checkAndMarkEvent(serviceDb, eventId, eventType) {
        try {
            const { Pool } = require('pg');
            const pool = new Pool({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432', 10),
                user: process.env.DB_USER || 'caseuser',
                password: process.env.DB_PASS || 'casepassword123',
                database: serviceDb,
                connectionTimeoutMillis: 1000
            });
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const res = await client.query(
                    `INSERT INTO processed_events (event_id, event_type)
                     VALUES ($1, $2)
                     ON CONFLICT (event_id) DO NOTHING
                     RETURNING event_id`,
                    [eventId, eventType]
                );
                await client.query('COMMIT');
                return res.rowCount > 0;
            } finally {
                client.release();
            }
        } catch (e) {
            // Memory fallback
            const key = `${serviceDb}:${eventId}`;
            if (this.memoryStore.processed_events.has(key)) {
                return false;
            }
            this.memoryStore.processed_events.add(key);
            return true;
        }
    }
}

const dbManager = new DatabaseManager();
module.exports = dbManager;
