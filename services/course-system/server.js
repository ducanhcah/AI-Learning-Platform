const MiniServer = require('../../shared/miniServer');
const dbManager = require('../../shared/db');
const eventBus = require('../../shared/eventBus');

const PORT = parseInt(process.env.PORT || '3002', 10);
const app = new MiniServer('CourseSystem', PORT);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'course-system', timestamp: new Date().toISOString() });
});

// Danh sách khóa học
app.get('/courses', (req, res) => {
    res.status(200).json(dbManager.memoryStore.courses);
});

// Chi tiết khóa học
app.get('/courses/:courseId', (req, res) => {
    const { courseId } = req.params;
    const course = dbManager.memoryStore.courses.find(c => c.course_id === courseId);
    if (!course) {
        return res.status(404).json({
            error: {
                code: 'COURSE_NOT_FOUND',
                message: `Khóa học với mã ${courseId} không tồn tại trong hệ thống LMS.`
            }
        });
    }
    res.status(200).json(course);
});

// Quota của sinh viên
app.get('/courses/:courseId/quota/:studentId', (req, res) => {
    const { courseId, studentId } = req.params;
    const quota = dbManager.memoryStore.student_quotas.find(
        q => q.course_id === courseId && q.student_id === studentId
    );
    if (!quota) {
        return res.status(404).json({
            error: {
                code: 'ENROLLMENT_NOT_FOUND',
                message: `Sinh viên ${studentId} chưa đăng ký khóa học ${courseId}.`
            }
        });
    }
    res.status(200).json({
        studentId: quota.student_id,
        courseId: quota.course_id,
        remainingAttempts: quota.remaining_attempts,
        totalAttempts: quota.total_attempts,
        isEligible: quota.remaining_attempts > 0
    });
});

// Trừ quota nguyên tử
app.post('/courses/:courseId/deduct-quota', async (req, res) => {
    const { courseId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Thiếu studentId' } });
    }

    const result = await dbManager.deductQuota(studentId, courseId);
    if (!result.success) {
        if (result.reason === 'ATTEMPTS_EXCEEDED') {
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
                message: 'Sinh viên chưa đăng ký khóa học.'
            }
        });
    }

    res.status(200).json({
        success: true,
        remainingAttempts: result.remaining,
        message: 'Trừ lượt làm bài thành công.'
    });
});

// Consumer RabbitMQ / EventBus
async function startConsumer() {
    await eventBus.init();
    await eventBus.subscribeQueue('course.quiz-completed', 'quiz.completed', async (event) => {
        const isNew = await dbManager.checkAndMarkEvent('course_db', event.eventId, event.eventType);
        if (!isNew) {
            console.warn(`[CourseSystem Consumer] BỎ QUA EVENT TRÙNG (Idempotency): ${event.eventId}`);
            return true;
        }
        console.log(`[CourseSystem Consumer] Xác nhận quota cho sinh viên ${event.data?.studentId}`);
        return true;
    });
}

startConsumer().catch(err => console.error('[CourseSystem Consumer Error]', err));
const server = app.listen();

module.exports = { app, server };
