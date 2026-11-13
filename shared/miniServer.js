const http = require('http');
const url = require('url');

class MiniServer {
    constructor(serviceName, port) {
        this.serviceName = serviceName;
        this.port = port;
        this.routes = [];
        this.server = null;
    }

    addRoute(method, pattern, handler) {
        const paramKeys = [];
        const regexStr = '^' + pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
            paramKeys.push(key);
            return '([^/]+)';
        }) + '$';
        const regex = new RegExp(regexStr);
        this.routes.push({ method: method.toUpperCase(), regex, paramKeys, handler });
    }

    get(pattern, handler) { this.addRoute('GET', pattern, handler); }
    post(pattern, handler) { this.addRoute('POST', pattern, handler); }
    patch(pattern, handler) { this.addRoute('PATCH', pattern, handler); }
    delete(pattern, handler) { this.addRoute('DELETE', pattern, handler); }

    async dispatch(method, reqUrl, body = {}, headers = {}) {
        const parsedUrl = url.parse(reqUrl, true);
        const req = {
            method: method.toUpperCase(),
            url: reqUrl,
            pathname: parsedUrl.pathname,
            query: parsedUrl.query,
            headers: headers,
            correlationId: headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            body: body
        };

        let responseStatusCode = 200;
        let responseHeaders = {};
        let responseBody = null;

        const res = {
            statusCode: 200,
            setHeader: (k, v) => { responseHeaders[k] = v; },
            status: (code) => {
                responseStatusCode = code;
                res.statusCode = code;
                return res;
            },
            json: (data) => {
                responseHeaders['Content-Type'] = 'application/json; charset=utf-8';
                responseBody = data;
            },
            end: (data) => {
                responseBody = data;
            }
        };

        for (const route of this.routes) {
            if (route.method === req.method) {
                const match = req.pathname.match(route.regex);
                if (match) {
                    req.params = {};
                    route.paramKeys.forEach((key, idx) => {
                        req.params[key] = match[idx + 1];
                    });
                    try {
                        await route.handler(req, res);
                        return { status: responseStatusCode, headers: responseHeaders, data: responseBody };
                    } catch (err) {
                        return { status: 500, headers: responseHeaders, data: { error: { code: 'SERVER_ERROR', message: err.message } } };
                    }
                }
            }
        }

        return {
            status: 404,
            headers: responseHeaders,
            data: { error: { code: 'NOT_FOUND', message: `Route ${method} ${req.pathname} không tìm thấy.` } }
        };
    }

    listen(callback) {
        this.server = http.createServer(async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, Idempotency-Key');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            let bodyData = '';
            for await (const chunk of req) {
                bodyData += chunk;
            }
            let body = {};
            if (bodyData) {
                try { body = JSON.parse(bodyData); } catch (e) { body = bodyData; }
            }

            const result = await this.dispatch(req.method, req.url, body, req.headers);
            res.writeHead(result.status, result.headers);
            res.end(typeof result.data === 'object' ? JSON.stringify(result.data) : (result.data || ''));
        });

        this.server.on('error', (err) => {
            console.warn(`[${this.serviceName}] Socket listen warning:`, err.message);
        });

        try {
            this.server.listen(this.port, () => {
                console.log(`[${this.serviceName}] Đang chạy trên cổng ${this.port}`);
                if (callback) callback();
            });
        } catch (e) {
            console.warn(`[${this.serviceName}] Socket listen exception:`, e.message);
        }

        return this.server;
    }
}

module.exports = MiniServer;
