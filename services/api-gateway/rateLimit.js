const AI_RATE_LIMIT_MAX = 50;
const aiUsageTracker = new Map();
let aiUsageDate = null;

function checkAiRateLimit(studentId, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    if (aiUsageDate !== today) {
        aiUsageTracker.clear();
        aiUsageDate = today;
    }

    const usage = aiUsageTracker.get(studentId) || { count: 0 };
    if (usage.count >= AI_RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, limit: AI_RATE_LIMIT_MAX };
    }
    usage.count += 1;
    aiUsageTracker.set(studentId, usage);
    return { allowed: true, remaining: AI_RATE_LIMIT_MAX - usage.count, limit: AI_RATE_LIMIT_MAX };
}

module.exports = { AI_RATE_LIMIT_MAX, checkAiRateLimit };
