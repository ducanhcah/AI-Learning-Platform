const MiniServer = require('../../shared/miniServer');
const dbManager = require('../../shared/db');
const eventBus = require('../../shared/eventBus');

const PORT = parseInt(process.env.PORT || '3003', 10);
const app = new MiniServer('ProgressSystem', PORT);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'progress-system', timestamp: new Date().toISOString() });
});

// Tra cứu tiến độ học tập
app.get('/progress/:studentId/:courseId', (req, res) => {
    const { studentId, courseId } = req.params;
    const key = `${studentId}:${courseId}`;
    const progress = dbManager.memoryStore.student_progress[key] || {
        studentId,
        courseId,
        completedQuizzes: 0,
        averageScore: 0,
        completionRate: 0,
        lastActivity: null
    };

    res.status(200).json(progress);
});

async function startConsumer() {
    await eventBus.init();
    await eventBus.subscribeQueue('progress.quiz-completed', 'quiz.completed', async (event) => {
        const isNew = await dbManager.checkAndMarkEvent('progress_db', event.eventId, event.eventType);
        if (!isNew) {
            console.warn(`[Progress Consumer] BỎ QUA EVENT TRÙNG (Idempotency): ${event.eventId}`);
            return true;
        }

        const { studentId, courseId, score, submissionId } = event.data;
        const key = `${studentId}:${courseId}`;
        const current = dbManager.memoryStore.student_progress[key] || {
            studentId,
            courseId,
            completedQuizzes: 0,
            averageScore: 0,
            completionRate: 0,
            totalScores: 0
        };

        current.completedQuizzes += 1;
        current.totalScores = (current.totalScores || 0) + score;
        current.averageScore = Math.round((current.totalScores / current.completedQuizzes) * 10) / 10;
        current.completionRate = Math.min(100, Math.round((current.completedQuizzes / 3) * 100));
        current.lastActivity = new Date().toISOString();

        dbManager.memoryStore.student_progress[key] = current;
        console.log(`[Progress Consumer] Sinh viên ${studentId} hoàn thành ${current.completionRate}%`);

        eventBus.localEmitter.emit('component.progress.done', { submissionId });
        return true;
    });
}

startConsumer().catch(err => console.error('[Progress Consumer Error]', err));
const server = app.listen();

module.exports = { app, server };
