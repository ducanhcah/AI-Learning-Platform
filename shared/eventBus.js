const EventEmitter = require('events');

// Danh mục sự kiện chuẩn hóa kế thừa từ Case Study 1 (Mục 1.2.2)
const EVENT_CATALOG = {
    STUDENT_REGISTERED: 'student.registered',
    COURSE_ENROLLED: 'course.enrolled',
    LESSON_COMPLETED: 'lesson.completed',
    QUIZ_COMPLETED: 'quiz.completed',
    ASSESSMENT_SUBMITTED: 'assessment.submitted',
    PROGRESS_UPDATED: 'learning.progress.updated',
    BEHAVIOR_DETECTED: 'learning.behavior.detected',
    AI_RECOMMENDATION_CREATED: 'ai.recommendation.created',
    PLAN_UPDATED: 'learning.plan.updated'
};

class HybridEventBus {
    constructor() {
        this.localEmitter = new EventEmitter();
        this.amqpConnection = null;
        this.amqpChannel = null;
        this.isAmqpReady = false;
        this.initPromise = null;
        this.subscribers = new Map();
        this.dlqMessages = [];
        this.eventHistory = []; // Lưu trữ Live Event Stream để hiển thị trên Dashboard
        this.rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://caseuser:casepassword123@localhost:5672';
    }

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const amqplib = require('amqplib');
                this.amqpConnection = await amqplib.connect(this.rabbitmqUrl, { timeout: 800 });
                this.amqpChannel = await this.amqpConnection.createConfirmChannel();
                
                const exchange = 'lms.events';
                await this.amqpChannel.assertExchange(exchange, 'topic', { durable: true });

                const dlx = 'lms.dlx';
                await this.amqpChannel.assertExchange(dlx, 'topic', { durable: true });
                await this.amqpChannel.assertQueue('dead-letter-queue', { durable: true });
                await this.amqpChannel.bindQueue('dead-letter-queue', dlx, '#');

                this.isAmqpReady = true;
                console.log('[EventBus] Đã kết nối RabbitMQ thành công: ' + this.rabbitmqUrl);
            } catch (err) {
                this.isAmqpReady = false;
            }
        })();

        return this.initPromise;
    }

    async publishEvent(exchange, routingKey, payload) {
        // Ghi lại vào Live Event Stream
        this.eventHistory.unshift({
            routingKey,
            eventId: payload.eventId || `evt-${Date.now()}`,
            occurredAt: payload.occurredAt || new Date().toISOString(),
            payload
        });
        if (this.eventHistory.length > 50) this.eventHistory.pop();

        if (this.isAmqpReady && this.amqpChannel) {
            try {
                const messageBuffer = Buffer.from(JSON.stringify(payload));
                return new Promise((resolve, reject) => {
                    this.amqpChannel.publish(exchange, routingKey, messageBuffer, {
                        persistent: true,
                        contentType: 'application/json',
                        messageId: payload.eventId,
                        correlationId: payload.correlationId,
                        timestamp: Date.now()
                    }, (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    });
                });
            } catch (err) {
                // Fallback
            }
        }

        // Native EventEmitter fallback
        setImmediate(() => {
            console.log(`[EventBus] Dispatched [${routingKey}] Event: ${payload.eventId}`);
            this.localEmitter.emit(routingKey, payload);
            this.localEmitter.emit('*', { routingKey, payload });
        });
        return true;
    }

    async subscribeQueue(queueName, routingKey, handler) {
        if (!this.subscribers.has(queueName)) {
            this.subscribers.set(queueName, []);
        }
        this.subscribers.get(queueName).push(handler);

        // Đăng ký local listener ngay lập tức
        this.localEmitter.on(routingKey, async (payload) => {
            try {
                await handler(payload);
            } catch (e) {
                this.dlqMessages.push({ queue: queueName, payload, error: e.message, at: new Date() });
            }
        });

        // Kết nối RabbitMQ nếu có
        await this.init();
        if (this.isAmqpReady && this.amqpChannel) {
            try {
                await this.amqpChannel.assertQueue(queueName, {
                    durable: true,
                    deadLetterExchange: 'lms.dlx',
                    deadLetterRoutingKey: 'dlq.' + queueName
                });
                await this.amqpChannel.bindQueue(queueName, 'lms.events', routingKey);

                await this.amqpChannel.consume(queueName, async (msg) => {
                    if (!msg) return;
                    try {
                        const payload = JSON.parse(msg.content.toString());
                        const success = await handler(payload);
                        if (success !== false) {
                            this.amqpChannel.ack(msg);
                        } else {
                            this.amqpChannel.nack(msg, false, false);
                        }
                    } catch (e) {
                        this.amqpChannel.nack(msg, false, false);
                    }
                });
            } catch (err) {
                // Ignore
            }
        }
    }

    getDLQ() {
        return this.dlqMessages;
    }

    getEventHistory() {
        return this.eventHistory;
    }
}

const instance = new HybridEventBus();
instance.EVENT_CATALOG = EVENT_CATALOG;
module.exports = instance;
