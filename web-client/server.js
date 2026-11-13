const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const publicDir = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const parsed = url.parse(req.url);
    let filePath = path.join(publicDir, parsed.pathname === '/' ? 'index.html' : parsed.pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    } else {
        const indexPath = path.join(publicDir, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
    }
});

server.listen(PORT, () => {
    console.log(`[WebClient] Chạy trên cổng http://localhost:${PORT}`);
});

module.exports = { server };
