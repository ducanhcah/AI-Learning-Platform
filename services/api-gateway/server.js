const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.GATEWAY_PORT || '8080', 10);

const UPSTREAMS = {
    course: { host: 'localhost', port: parseInt(process.env.COURSE_PORT || '3002', 10) },
    assessment: { host: 'localhost', port: parseInt(process.env.ASSESSMENT_PORT || '3001', 10) },
    progress: { host: 'localhost', port: parseInt(process.env.PROGRESS_PORT || '3003', 10) },
    ai: { host: 'localhost', port: parseInt(process.env.AI_PORT || '3004', 10) },
    notify: { host: 'localhost', port: parseInt(process.env.NOTIFY_PORT || '3005', 10) }
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

function forwardRequest(target, targetPath, req, res, bodyBuffer) {
    const options = {
        hostname: target.host,
        port: target.port,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: `${target.host}:${target.port}`
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[API Gateway] Forwarding error to ${target.host}:${target.port}:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: `Không thể kết nối đến upstream service: ${err.message}` } }));
    });

    if (bodyBuffer && bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
}

const server = http.createServer(async (req, res) => {
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

    // Health check tổng thể Gateway
    if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            gateway: 'UP',
            timestamp: new Date().toISOString(),
            upstreams: UPSTREAMS
        }));
        return;
    }

    // Định tuyến API theo mục 6.4
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

    // Static files phục vụ Web Client
    const publicDir = path.join(__dirname, '../../web-client/public');
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        // Fallback về index.html cho SPA
        const indexPath = path.join(publicDir, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }
});

server.listen(PORT, () => {
    console.log(`[API Gateway] Đang lắng nghe trên cổng http://localhost:${PORT}`);
});

module.exports = { server };
