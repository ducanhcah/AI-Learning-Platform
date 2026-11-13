const MiniServer = require('../../shared/miniServer');
const dbManager = require('../../shared/db');
const eventBus = require('../../shared/eventBus');

const PORT = parseInt(process.env.PORT || '3005', 10);
const app = new MiniServer('NotificationSystem', PORT);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'notification-system', timestamp: new Date().toISOString() });
});

// Tra cứu danh sách thông báo của sinh viên
app.get('/notifications/:studentId', (req, res) => {
    const { studentId } = req.params;
    const notifs = dbManager.memoryStore.notifications
        .filter(n => n.student_id === studentId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.status(200).json(notifs);
});

async function startConsumer() {
    await eventBus.init();
    await eventBus.subscribeQueue('notify.quiz-completed', 'quiz.completed', async (event) => {
        const isNew = await dbManager.checkAndMarkEvent('notify_db', event.eventId, event.eventType);
        if (!isNew) {
            console.warn(`[Notify Consumer] BỎ QUA EVENT TRÙNG (Idempotency): ${event.eventId}`);
            return true;
        }

        const { studentId, submissionId, score, quizId } = event.data;
        const notification = {
            id: dbManager.memoryStore.notifications.length + 1,
            student_id: studentId,
            submission_id: submissionId,
            title: `Kết quả bài kiểm tra ${quizId}`,
            message: `Bài kiểm tra của bạn đã được chấm: ${score}/10 điểm. Trợ lý học tập AI đã phân tích kết quả và gửi kèm lộ trình cải thiện!`,
            is_read: false,
            created_at: new Date().toISOString()
        };

        dbManager.memoryStore.notifications.push(notification);
        console.log(`[Notify Consumer] Đã gửi thông báo đến sinh viên ${studentId}`);

        eventBus.localEmitter.emit('component.notify.done', { submissionId });
        return true;
    });
}

if (!process.env.VERCEL) {
    startConsumer().catch(err => console.error('[Notify Consumer Error]', err));
}
const server = app.listen();

module.exports = Object.assign(app.handle.bind(app), { app, server, startConsumer });
