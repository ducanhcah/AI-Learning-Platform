const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const eventBus = require('../../shared/eventBus');
const { AI_RATE_LIMIT_MAX, checkAiRateLimit } = require('./rateLimit');

const PORT = parseInt(process.env.GATEWAY_PORT || '8080', 10);

function getServiceUrl(envName, localPort) {
    return process.env[envName] || `http://localhost:${localPort}`;
}

const UPSTREAMS = {
    course: { baseUrl: getServiceUrl('COURSE_SYSTEM_URL', process.env.COURSE_PORT || '3002') },
    assessment: { baseUrl: getServiceUrl('ASSESSMENT_PROCESS_URL', process.env.ASSESSMENT_PORT || '3001') },
    progress: { baseUrl: getServiceUrl('PROGRESS_SYSTEM_URL', process.env.PROGRESS_PORT || '3003') },
    ai: { baseUrl: getServiceUrl('AI_ASSISTANT_SYSTEM_URL', process.env.AI_PORT || '3004') },
    notify: { baseUrl: getServiceUrl('NOTIFICATION_SYSTEM_URL', process.env.NOTIFY_PORT || '3005') }
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function forwardRequest(target, targetPath, req, res, bodyBuffer, extraHeaders = {}) {
    const targetUrl = new URL(targetPath, target.baseUrl);
    const requester = targetUrl.protocol === 'https:' ? https : http;
    const options = {
        method: req.method,
        headers: {
            ...req.headers,
            ...extraHeaders,
            host: targetUrl.host
        }
    };

    const proxyReq = requester.request(targetUrl, options, (proxyRes) => {
        // Sao chép headers
        const headers = { ...proxyRes.headers, ...extraHeaders };
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[API Gateway] Forwarding error to ${targetUrl.origin}:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: `Không thể kết nối đến upstream service: ${err.message}` } }));
    });

    if (bodyBuffer && bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
}

function requestJson(target, targetPath) {
    return new Promise((resolve, reject) => {
        const targetUrl = new URL(targetPath, target.baseUrl);
        const requester = targetUrl.protocol === 'https:' ? https : http;
        const request = requester.get(targetUrl, {
            headers: { Accept: 'application/json' }
        }, (response) => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    const error = new Error(`Upstream returned HTTP ${response.statusCode}`);
                    error.statusCode = response.statusCode;
                    reject(error);
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`Upstream returned invalid JSON: ${error.message}`));
                }
            });
        });

        request.setTimeout(3000, () => request.destroy(new Error('Upstream request timed out')));
        request.on('error', reject);
    });
}

async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, Idempotency-Key');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const correlationId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    req.headers['x-request-id'] = correlationId;
    res.setHeader('X-Request-ID', correlationId);

    // Thu thập body
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);
    let parsedBody;
    if (bodyBuffer.length > 0) {
        try {
            parsedBody = JSON.parse(bodyBuffer.toString());
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } }));
            return;
        }
    } else {
        parsedBody = {};
    }

    // 1. Health check tổng thể Gateway
    if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            gateway: 'UP',
            architecture: 'API-led Connectivity + Event-Driven Architecture (Case Study 1 & 2)',
            timestamp: new Date().toISOString(),
            upstreams: UPSTREAMS
        }));
        return;
    }

    // 2. Tra cứu Live Event Stream (Mục 1.2.2 Case Study 1)
    if (pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            events: eventBus.getEventHistory(),
            catalog: eventBus.EVENT_CATALOG
        }));
        return;
    }

    // 3. Process API: Learning Analysis Process API (Mục 1.2 Case Study 1)
    // Phối hợp: Learning Progress API + Assessment API + Course API -> Tổng hợp ngữ cảnh cho AI
    const learningAnalysisMatch = pathname.match(/^\/api\/process\/learning-analysis\/([^/]+)\/([^/]+)$/);
    if (pathname.startsWith('/api/process/learning-analysis')) {
        if (!learningAnalysisMatch) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'Use /api/process/learning-analysis/:studentId/:courseId.' } }));
            return;
        }

        const studentId = decodeURIComponent(learningAnalysisMatch[1]);
        const courseId = decodeURIComponent(learningAnalysisMatch[2]);
        try {
            const [course, progress, submissions] = await Promise.all([
                requestJson(UPSTREAMS.course, `/courses/${encodeURIComponent(courseId)}`),
                requestJson(UPSTREAMS.progress, `/progress/${encodeURIComponent(studentId)}/${encodeURIComponent(courseId)}`),
                requestJson(UPSTREAMS.assessment, `/submissions?studentId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(courseId)}&limit=3`)
            ]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                processName: 'Learning Analysis Process API (Mục 1.2 Case Study 1)',
                studentId,
                courseId,
                contextEnvelope: {
                    courseTitle: course.title,
                    completionRate: progress.completionRate,
                    gpa: progress.averageScore,
                    totalSubmissions: submissions.total,
                    recentSubmissions: submissions.items
                },
                status: 'READY_FOR_AI_SYNTHESIS',
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.error(`[API Gateway] Learning Analysis failed (${correlationId}):`, error.message);
            const statusCode = error.statusCode === 404 ? 404 : 502;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    code: statusCode === 404 ? 'LEARNING_CONTEXT_NOT_FOUND' : 'PROCESS_API_UPSTREAM_ERROR',
                    message: error.message
                }
            }));
        }
        return;
    }

    // 4. Rate Limiting cho AI Chat (Mục 1.2.3 Case Study 1: 50 lượt/ngày)
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
        const studentId = typeof parsedBody.studentId === 'string' ? parsedBody.studentId.trim() : '';
        if (!studentId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'STUDENT_ID_REQUIRED', message: 'studentId is required for AI chat rate limiting.' } }));
            return;
        }

        const rateCheck = checkAiRateLimit(studentId);

        if (!rateCheck.allowed) {
            res.writeHead(429, {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': rateCheck.limit,
                'X-RateLimit-Remaining': rateCheck.remaining
            });
            res.end(JSON.stringify({
                error: {
                    code: 'AI_RATE_LIMIT_EXCEEDED',
                    message: `Bạn đã đạt giới hạn ${AI_RATE_LIMIT_MAX} câu hỏi AI trong ngày hôm nay theo chính sách phân phối tài nguyên (Case Study 1 - Mục 1.2.3).`
                }
            }));
            return;
        }

        return forwardRequest(UPSTREAMS.ai, '/ai/chat', req, res, bodyBuffer, {
            'X-RateLimit-Limit': String(rateCheck.limit),
            'X-RateLimit-Remaining': String(rateCheck.remaining)
        });
    }

    // 5. Định tuyến các service còn lại
    if (pathname === '/api/courses/health') {
        return forwardRequest(UPSTREAMS.course, '/health', req, res, bodyBuffer);
    }
    if (pathname.startsWith('/api/courses')) {
        const subPath = pathname.replace(/^\/api\/courses/, '/courses') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.course, subPath, req, res, bodyBuffer);
    }

    if (pathname === '/api/submissions/health') {
        return forwardRequest(UPSTREAMS.assessment, '/health', req, res, bodyBuffer);
    }
    if (pathname.startsWith('/api/submissions')) {
        const subPath = pathname.replace(/^\/api\/submissions/, '/submissions') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.assessment, subPath, req, res, bodyBuffer);
    }
    if (pathname.startsWith('/api/quizzes')) {
        const subPath = pathname.replace(/^\/api\/quizzes/, '/quizzes') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.assessment, subPath, req, res, bodyBuffer);
    }

    if (pathname.startsWith('/api/progress')) {
        const subPath = pathname.replace(/^\/api\/progress/, '/progress') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.progress, subPath, req, res, bodyBuffer);
    }

    if (pathname === '/api/ai/health') {
        return forwardRequest(UPSTREAMS.ai, '/health', req, res, bodyBuffer);
    }
    if (pathname.startsWith('/api/ai')) {
        const subPath = pathname.replace(/^\/api\/ai/, '/ai') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.ai, subPath, req, res, bodyBuffer);
    }

    if (pathname.startsWith('/api/notifications')) {
        const subPath = pathname.replace(/^\/api\/notifications/, '/notifications') + (parsedUrl.search || '');
        return forwardRequest(UPSTREAMS.notify, subPath, req, res, bodyBuffer);
    }

    // Static Web Client
    const publicDir = path.join(__dirname, '../../web-client/public');
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        const indexPath = path.join(publicDir, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }
}

if (!process.env.VERCEL) {
    http.createServer(handler).listen(PORT, () => {
        console.log(`[API Gateway] Đang lắng nghe trên cổng http://localhost:${PORT}`);
    });
}

module.exports = handler;
