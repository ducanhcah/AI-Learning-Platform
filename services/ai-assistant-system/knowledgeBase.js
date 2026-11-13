// knowledgeBase.js - Ngân hàng tri thức chuyên sâu và Bộ suy luận AI cho môn Tích hợp hệ thống
const KNOWLEDGE_GRAPH = {
    'outbox': {
        keywords: ['outbox', 'transactional outbox', 'dual-write', 'dual write', 'lưu và gửi'],
        topic: 'Transactional Outbox Pattern',
        category: 'Data Integrity & Transactions',
        summary: 'Mẫu thiết kế giải quyết bài toán Dual-Write kinh điển trong hệ thống phân tán, đảm bảo giao dịch cơ sở dữ liệu và phát sự kiện vào Message Broker luôn nhất quán.',
        problem: 'Khi một service vừa phải cập nhật CSDL vừa phải gửi thông điệp tới RabbitMQ, nếu ứng dụng bị crash hoặc mạng gián đoạn giữa 2 thao tác, dữ liệu sẽ bị mất đồng bộ (ví dụ: đã lưu bài nộp nhưng không gửi được event cho AI và Notification).',
        solution: 'Trong cùng 1 Database Transaction, ghi đồng thời bản ghi nghiệp vụ (Submission) và sự kiện cần phát (vào bảng `outbox_events`). Một tiến trình Outbox Publisher độc lập đọc các event `PENDING`, phát lên Broker và chuyển trạng thái thành `PUBLISHED` khi có broker confirmation.',
        codeSnippet: `// Minh họa Transactional Outbox trong cùng 1 Transaction
await client.query('BEGIN');
await client.query('INSERT INTO submissions (id, score, status) VALUES ($1, $2, $3)', [subId, score, 'PROCESSING']);
await client.query('INSERT INTO outbox_events (event_id, type, payload, status) VALUES ($1, $2, $3, $4)', [evtId, 'quiz.completed', payload, 'PENDING']);
await client.query('COMMIT');
// Tiến trình Publisher riêng biệt polling và gửi lên RabbitMQ`,
        followUps: [
            'Outbox Pattern khác gì so với Two-Phase Commit (2PC)?',
            'Làm thế nào để Outbox Publisher không bị trùng lặp message?',
            'Cách thiết lập Publisher Confirms trong RabbitMQ?'
        ],
        citations: ['Giáo trình SE445 - Tích hợp hệ thống', 'Microservices Patterns (Chris Richardson)', 'Enterprise Integration Patterns']
    },
    'idempotency': {
        keywords: ['idempotency', 'idempotent', 'bất biến', 'trùng', 'trùng lặp', 'giao nhận'],
        topic: 'Tính Bất Biến & Chống Xử Lý Trùng Lặp (Idempotency)',
        category: 'Resilience & Consumer Safety',
        summary: 'Thuộc tính đảm bảo rằng khi một thao tác hoặc thông điệp được thực thi nhiều lần thì kết quả cuối cùng vẫn giống như chỉ thực thi một lần duy nhất.',
        problem: 'RabbitMQ hoạt động theo cơ chế giao nhận ít nhất một lần (At-least-once delivery). Khi mạng chập chờn hoặc consumer xử lý xong nhưng bị mất kết nối trước khi gửi ACK, Broker sẽ giao lại message cho consumer khác, dẫn đến nguy cơ trừ 2 lần quota, gửi 2 lần thông báo.',
        solution: 'Mỗi Consumer duy trì bảng `processed_events` với khóa chính `PRIMARY KEY (event_id)`. Khi nhận message, Consumer thực hiện kiểm tra hoặc chèn `event_id` trong cùng transaction; nếu vi phạm unique constraint thì bỏ qua tác động nghiệp vụ và ACK message.',
        codeSnippet: `// Kiểm tra Idempotency nguyên tử tại Consumer
const res = await client.query(
    'INSERT INTO processed_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
    [event.eventId, event.eventType]
);
if (res.rowCount === 0) {
    console.log('Message trùng lặp, bỏ qua!');
    return ack(message);
}`,
        followUps: [
            'Tại sao kiểm tra SELECT trước khi INSERT lại không an toàn khi có nhiều consumer?',
            'Idempotency Key của Client khác gì Event ID của Broker?',
            'Dead Letter Queue hoạt động như thế nào khi gặp lỗi?'
        ],
        citations: ['Giáo trình SE445', 'RabbitMQ Reliability Guide', 'Martin Fowler - Idempotent Receiver Pattern']
    },
    'eda': {
        keywords: ['eda', 'event driven', 'bất đồng bộ', 'rabbit', 'rabbitmq', 'broker', 'message broker', 'exchange'],
        topic: 'Kiến Trúc Hướng Sự Kiện (Event-Driven Architecture) & RabbitMQ',
        category: 'Message Broker & EDA',
        summary: 'Kiến trúc giải phóng sự phụ thuộc trực tiếp giữa các service thông qua việc truyền tin bất đồng bộ qua trung gian Message Broker.',
        problem: 'Trong kiến trúc đồng bộ (Synchronous REST), Assessment phải gọi tuần tự Course, Progress, AI, Notification. Thời gian phản hồi là tổng thời gian của cả 4 service, và nếu AI service bị lỗi thì cả quy trình nộp bài sẽ thất bại.',
        solution: 'Assessment chỉ tiếp nhận bài thi, trả ngay HTTP 202 Accepted và phát sự kiện `quiz.completed` vào Topic Exchange `lms.events`. Các service Course, Progress, AI, Notification đăng ký hàng đợi riêng (Queues) và tiêu thụ sự kiện song song độc lập.',
        codeSnippet: `// Định nghĩa Topic Exchange và Bindings trong RabbitMQ
await channel.assertExchange('lms.events', 'topic', { durable: true });
// Từng service sở hữu queue riêng biệt
await channel.assertQueue('ai.quiz-completed', { durable: true, deadLetterExchange: 'lms.dlx' });
await channel.bindQueue('ai.quiz-completed', 'lms.events', 'quiz.completed');`,
        followUps: [
            'Sự khác biệt giữa Topic Exchange, Direct Exchange và Fanout Exchange?',
            'Cơ chế Dead Letter Exchange (DLX) và Dead Letter Queue (DLQ) là gì?',
            'Khi nào nên dùng REST đồng bộ và khi nào nên dùng EDA bất đồng bộ?'
        ],
        citations: ['Giáo trình SE445', 'RabbitMQ Documentation - Topic Exchange', 'Building Microservices (Sam Newman)']
    },
    'api_led': {
        keywords: ['api-led', 'api led', 'experience', 'process', 'system api', 'gateway', 'nginx'],
        topic: 'API-led Connectivity & Kiến Trúc Phân Tầng API',
        category: 'Architecture Understanding',
        summary: 'Phương pháp tổ chức API thành 3 lớp phân biệt: Experience API, Process API và System API nhằm tăng tính tái sử dụng và quản trị.',
        problem: 'Client trực tiếp gọi vào các CSDL hoặc các service lõi làm lộ cấu trúc nội bộ, khó thay đổi logic nghiệp vụ và bảo mật yếu.',
        solution: '1. Experience API (Gateway): Tối ưu cho Web/Mobile. 2. Process API (Assessment Process): Điều phối quy trình nộp bài đa hệ thống. 3. System API (Course, Progress, AI, Notify): Bảo bọc dữ liệu của từng phân hệ.',
        codeSnippet: `Client (Web/Mobile)
       │
       ▼
[ API Gateway / Experience API ] (:8080)
       │
       ▼
[ Process API: Assessment Process ] (:3001)
 ┌─────┴────────────────────────┐
 ▼                              ▼
[ System API: Course ]    [ System API: AI / Notify ]`,
        followUps: [
            'API Gateway có vai trò gì trong việc xác thực và giới hạn tốc độ (Rate Limiting)?',
            'Correlation ID (X-Request-ID) được truyền qua các tầng API như thế nào?',
            'Database per Service có bắt buộc phải dùng nhiều máy chủ CSDL riêng không?'
        ],
        citations: ['Giáo trình SE445', 'MuleSoft API-Led Connectivity Architecture']
    },
    'quota': {
        keywords: ['quota', 'race condition', 'đồng thời', 'concurrency', 'lượt làm bài', 'trừ quota'],
        topic: 'Kiểm Soát Quota & Xử Lý Tranh Chấp Đồng Thời (Atomic Quota Deduct)',
        category: 'Data Integrity & Transactions',
        summary: 'Cơ chế bảo vệ tài nguyên và số lượt thi của sinh viên, ngăn chặn triệt để hiện tượng gian lận hoặc vượt quá giới hạn khi nộp bài đồng thời.',
        problem: 'Nếu thực hiện kiểm tra `SELECT remaining_attempts` rồi mới `UPDATE`, hai request nộp bài cùng lúc có thể cùng đọc được giá trị `1` và cùng nộp bài thành công, dẫn đến sinh viên thi quá số lượt quy định (Race Condition).',
        solution: 'Thực hiện kiểm tra và trừ quota trong cùng một câu lệnh UPDATE nguyên tử (Atomic Update) có điều kiện `remaining_attempts > 0`. CSDL sẽ khóa dòng ghi nhận và trả về số dòng bị ảnh hưởng.',
        codeSnippet: `UPDATE student_quotas
SET remaining_attempts = remaining_attempts - 1, updated_at = NOW()
WHERE student_id = $1 AND course_id = $2 AND remaining_attempts > 0
RETURNING remaining_attempts;
-- Nếu rowCount === 0 => ném lỗi 409 Conflict (ATTEMPTS_EXCEEDED)`,
        followUps: [
            'Sự khác biệt giữa Optimistic Locking và Pessimistic Locking?',
            'Làm thế nào để hoàn trả quota nếu bài nộp bị hủy hợp lệ?',
            'Tại sao không nên tin tưởng điểm số hoặc quota do Client gửi lên?'
        ],
        citations: ['Giáo trình SE445', 'PostgreSQL Concurrency Control & ACID Guide']
    }
};

// Ngân hàng câu hỏi luyện tập tự động sinh theo chủ đề (AI Practice Question Bank)
const TOPIC_PRACTICE_BANK = {
    'Transactional Outbox Pattern': [
        {
            question: 'Khi triển khai Transactional Outbox Pattern, trạng thái ban đầu của bản ghi sự kiện trong bảng outbox_events là gì?',
            options: {
                A: 'PUBLISHED',
                B: 'PENDING',
                C: 'ACKNOWLEDGED',
                D: 'DISPATCHED'
            },
            correctAnswer: 'B',
            explanation: 'Bản ghi ban đầu ở trạng thái PENDING. Sau khi Outbox Publisher phát thành công vào Broker và nhận xác nhận (ACK), trạng thái mới chuyển thành PUBLISHED.'
        },
        {
            question: 'Ưu điểm lớn nhất của Transactional Outbox so với việc publish trực tiếp vào Message Broker là gì?',
            options: {
                A: 'Tăng tốc độ truyền tin lên 10 lần',
                B: 'Loại bỏ hoàn toàn rủi ro Dual-Write và đảm bảo tính toàn vẹn giao dịch CSDL',
                C: 'Không cần sử dụng Message Broker',
                D: 'Tự động sửa lỗi sai cú pháp JSON'
            },
            correctAnswer: 'B',
            explanation: 'Transactional Outbox bảo đảm thao tác lưu CSDL và ghi nhận sự kiện cùng nằm trong 1 ACID transaction, giải quyết triệt để rủi ro mất đồng bộ Dual-Write.'
        }
    ],
    'Tính Bất Biến & Chống Xử Lý Trùng Lặp (Idempotency)': [
        {
            question: 'Trong kiến trúc RabbitMQ, tại sao Consumer bắt buộc phải có tính chất Idempotent?',
            options: {
                A: 'Vì RabbitMQ chỉ hỗ trợ mô hình truyền tin At-least-once (ít nhất một lần)',
                B: 'Vì RabbitMQ tự động xóa message khi có lỗi',
                C: 'Vì Consumer không thể lưu dữ liệu vào CSDL',
                D: 'Vì mạng máy tính luôn đảm bảo truyền tin đúng một lần duy nhất'
            },
            correctAnswer: 'A',
            explanation: 'Do mô hình At-least-once, cùng một message có thể được gửi lại khi mất kết nối mạng; Consumer phải có Idempotency để không làm sai lệch số liệu khi nhận lặp.'
        },
        {
            question: 'Cơ chế nào là tin cậy nhất để Consumer phát hiện message trùng lặp?',
            options: {
                A: 'Chỉ dựa vào câu lệnh SELECT kiểm tra trước khi thêm',
                B: 'Dùng Unique Constraint trên event_id trong CSDL kết hợp Transaction',
                C: 'Dựa vào thời gian timestamp của message',
                D: 'Tăng timeout của RabbitMQ lên vô hạn'
            },
            correctAnswer: 'B',
            explanation: 'Unique Constraint trên event_id ở tầng CSDL là chốt chặn an toàn nhất chống race condition giữa các consumer tiến trình song song.'
        }
    ],
    'Kiến Trúc Hướng Sự Kiện (Event-Driven Architecture) & RabbitMQ': [
        {
            question: 'Khi một Consumer không thể xử lý message sau số lần retry tối đa, giải pháp kiến trúc chuẩn là gì?',
            options: {
                A: 'Xóa bỏ message và không ghi nhận',
                B: 'Chuyển message vào Dead Letter Queue (DLQ) qua Dead Letter Exchange',
                C: 'Tắt toàn bộ hệ thống RabbitMQ',
                D: 'Lặp lại vô hạn việc tiêu thụ message'
            },
            correctAnswer: 'B',
            explanation: 'Message lỗi được định tuyến sang Dead Letter Queue (DLQ) để phục vụ việc điều tra nguyên nhân và thử lại có kiểm soát, tránh làm tắc nghẽn queue chính.'
        }
    ]
};

module.exports = {
    KNOWLEDGE_GRAPH,
    TOPIC_PRACTICE_BANK
};
