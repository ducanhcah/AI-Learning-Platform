process.env.VERCEL = '1';

const courseSystem = require('../services/course-system/server');
const assessmentProcess = require('../services/assessment-process/server');
const progressSystem = require('../services/progress-system/server');
const aiAssistant = require('../services/ai-assistant-system/server');
const notificationSystem = require('../services/notification-system/server');
const eventBus = require('../shared/eventBus');

async function start() {
    await Promise.all([
        assessmentProcess.startBackgroundWorker(),
        courseSystem.startConsumer(),
        progressSystem.startConsumer(),
        aiAssistant.startConsumer(),
        notificationSystem.startConsumer()
    ]);
    if (!eventBus.isAmqpReady) {
        throw new Error('RabbitMQ is unavailable; configure a reachable RABBITMQ_URL.');
    }
    console.log('[Vercel Daemon] RabbitMQ event consumers are ready.');
}

start().catch((error) => {
    console.error('[Vercel Daemon] Failed to start event consumers:', error);
    process.exit(1);
});
