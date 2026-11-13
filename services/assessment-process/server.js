const MiniServer = require('../../shared/miniServer');
const dbManager = require('../../shared/db');
const eventBus = require('../../shared/eventBus');

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = new MiniServer('AssessmentProcess', PORT);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'assessment-process', timestamp: new Date().toISOString() });
});

// Lấy đề thi
app.get('/quizzes/:quizId', (req, res) => {
    const { quizId } = req.params;
    const quiz = dbManager.memoryStore.quizzes.find(q => q.quiz_id === quizId);
    if (!quiz) {
        return res.status(404).json({ error: { code: 'QUIZ_NOT_FOUND', message: 'Không tìm thấy bài kiểm tra.' } });
    }
    const questions = dbManager.memoryStore.questions
        .filter(q => q.quiz_id === quizId)
        .map(({ question_id, question_text, options }) => ({ question_id, question_text, options }));

    res.status(200).json({ ...quiz, questions });
});

// Tra cứu trạng thái bài nộp (Aggregator)
app.get('/submissions/:submissionId', (req, res) => {
    const { submissionId } = req.params;
    const sub = dbManager.memoryStore.submissions.find(s => s.submission_id === submissionId);
    if (!sub) {
        return res.status(404).json({
            error: {
                code: 'SUBMISSION_NOT_FOUND',
                message: `Không tìm thấy bài nộp với mã ${submissionId}.`
            }
        });
    }

    const statuses = dbManager.memoryStore.submission_statuses[submissionId] || {
        overall_status: sub.status,
        course_status: 'COMPLETED',
        progress_status: 'PENDING',
        ai_status: 'PENDING',
        notify_status: 'PENDING'
    };

    res.status(200).json({
        submissionId: sub.submission_id,
        studentId: sub.student_id,
        quizId: sub.quiz_id,
        courseId: sub.course_id,
        score: sub.score,
        status: statuses.overall_status,
        components: {
            courseStatus: statuses.course_status,
            progressStatus: statuses.progress_status,
            aiStatus: statuses.ai_status,
            notificationStatus: statuses.notify_status
        },
        createdAt: sub.created_at,
        completedAt: sub.completed_at
    });
});

// Tiếp nhận nộp bài (POST /submissions)
app.post('/submissions', async (req, res) => {
    const { studentId, quizId, courseId = 'COURSE-001', answers, idempotencyKey } = req.body;
    const correlationId = req.correlationId;

    if (!studentId || !quizId || !answers || !Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
            error: {
                code: 'INVALID_PAYLOAD',
                message: 'Dữ liệu không hợp lệ: studentId, quizId và mảng answers không được để trống.'
            }
        });
    }

    if (idempotencyKey) {
        const existingSub = dbManager.memoryStore.submissions.find(
            s => s.student_id === studentId && s.quiz_id === quizId && s.idempotency_key === idempotencyKey
        );
        if (existingSub) {
            console.log(`[AssessmentProcess] Idempotency hit: submission ${existingSub.submission_id} đã tồn tại với key ${idempotencyKey}`);
            return res.status(200).json({
                submissionId: existingSub.submission_id,
                status: existingSub.status,
                message: 'Bài nộp đã được tiếp nhận trước đó (Idempotency Key khớp).'
            });
        }
    }

    const course = dbManager.memoryStore.courses.find(c => c.course_id === courseId);
    if (!course) {
        return res.status(404).json({
            error: {
                code: 'COURSE_NOT_FOUND',
                message: `Khóa học ${courseId} không tồn tại.`
            }
        });
    }

    const quotaResult = await dbManager.deductQuota(studentId, courseId);
    if (!quotaResult.success) {
        if (quotaResult.reason === 'ATTEMPTS_EXCEEDED') {
            return res.status(409).json({
                error: {
                    code: 'ATTEMPTS_EXCEEDED',
                    message: 'Sinh viên không còn lượt làm bài hợp lệ.'
                }
            });
        }
        return res.status(404).json({
            error: {
                code: 'STUDENT_NOT_ENROLLED',
                message: 'Sinh viên chưa đăng ký khóa học này.'
            }
        });
    }

    // Chấm điểm server-side
    const allQuestions = dbManager.memoryStore.questions.filter(q => q.quiz_id === quizId);
    let correctCount = 0;
    const answerDetails = [];

    allQuestions.forEach(q => {
        const studentAns = answers.find(a => a.questionId === q.question_id);
        const isCorrect = studentAns && studentAns.answer === q.correct_answer;
        if (isCorrect) correctCount++;
        answerDetails.push({
            questionId: q.question_id,
            questionText: q.question_text,
            studentAnswer: studentAns ? studentAns.answer : null,
            correctAnswer: q.correct_answer,
            isCorrect: !!isCorrect,
            explanation: q.explanation
        });
    });

    const calculatedScore = allQuestions.length > 0
        ? Math.round((correctCount / allQuestions.length) * 10 * 10) / 10
        : 0;

    const submissionId = `SUB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    // Transactional Outbox Pattern
    const submissionRecord = {
        submission_id: submissionId,
        student_id: studentId,
        quiz_id: quizId,
        course_id: courseId,
        score: calculatedScore,
        status: 'PROCESSING',
        idempotency_key: idempotencyKey,
        answers: answerDetails,
        created_at: new Date().toISOString(),
        completed_at: null
    };

    const eventId = `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const eventPayload = {
        eventId: eventId,
        eventType: 'quiz.completed',
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: correlationId,
        data: {
            submissionId: submissionId,
            studentId: studentId,
            quizId: quizId,
            courseId: courseId,
            score: calculatedScore,
            scoreSource: 'assessment-service',
            answerDetails: answerDetails
        }
    };

    const outboxRecord = {
        id: dbManager.memoryStore.outbox_events.length + 1,
        event_id: eventId,
        event_type: 'quiz.completed',
        correlation_id: correlationId,
        payload: eventPayload,
        status: 'PENDING',
        created_at: new Date().toISOString()
    };

    dbManager.memoryStore.submissions.push(submissionRecord);
    dbManager.memoryStore.outbox_events.push(outboxRecord);
    dbManager.memoryStore.submission_statuses[submissionId] = {
        overall_status: 'PROCESSING',
        course_status: 'COMPLETED',
        progress_status: 'PENDING',
        ai_status: 'PENDING',
        notify_status: 'PENDING'
    };

    res.status(202).json({
        submissionId: submissionId,
        status: 'PROCESSING',
        message: 'Bài nộp đã được tiếp nhận để xử lý.'
    });

    setImmediate(publishOutboxEvents);
});

// Outbox publisher
async function publishOutboxEvents() {
    const pendingEvents = dbManager.memoryStore.outbox_events.filter(e => e.status === 'PENDING');
    for (const record of pendingEvents) {
        try {
            await eventBus.publishEvent('lms.events', 'quiz.completed', record.payload);
            record.status = 'PUBLISHED';
            record.published_at = new Date().toISOString();
        } catch (err) {
            record.status = 'FAILED';
            record.retry_count = (record.retry_count || 0) + 1;
        }
    }
}

// Cập nhật trạng thái từ các consumer (Aggregator)
function updateConsumerStatus(submissionId, component, status) {
    const s = dbManager.memoryStore.submission_statuses[submissionId];
    if (s) {
        if (component === 'progress') s.progress_status = status;
        if (component === 'ai') s.ai_status = status;
        if (component === 'notify') s.notify_status = status;

        if (s.progress_status === 'COMPLETED' && s.ai_status === 'COMPLETED' && s.notify_status === 'COMPLETED') {
            s.overall_status = 'COMPLETED';
            const sub = dbManager.memoryStore.submissions.find(item => item.submission_id === submissionId);
            if (sub) {
                sub.status = 'COMPLETED';
                sub.completed_at = new Date().toISOString();
            }
            console.log(`[StatusAggregator] Submission ${submissionId} COMPLETED`);
        }
    }
}

eventBus.localEmitter.on('component.progress.done', ({ submissionId }) => updateConsumerStatus(submissionId, 'progress', 'COMPLETED'));
eventBus.localEmitter.on('component.ai.done', ({ submissionId }) => updateConsumerStatus(submissionId, 'ai', 'COMPLETED'));
eventBus.localEmitter.on('component.notify.done', ({ submissionId }) => updateConsumerStatus(submissionId, 'notify', 'COMPLETED'));

eventBus.init().catch(err => console.error('[EventBus Init Error]', err));
setInterval(publishOutboxEvents, 2000);
const server = app.listen();

module.exports = { app, server, updateConsumerStatus };
