// run-all.js - Khởi chạy đồng thời toàn bộ các Service của Hệ thống Tích hợp Nhóm 13
console.log('================================================================');
console.log('   ĐẠI HỌC DUY TÂN - KHOA CÔNG NGHỆ THÔNG TIN');
console.log('   HỆ THỐNG TRỢ LÝ HỌC TẬP THÔNG MINH ỨNG DỤNG AI - NHÓM 13');
console.log('================================================================\n');

require('./services/course-system/server');
require('./services/assessment-process/server');
require('./services/progress-system/server');
require('./services/ai-assistant-system/server');
require('./services/notification-system/server');
require('./web-client/server');
require('./services/api-gateway/server');

console.log('\n[INFO] Đã khởi chạy toàn bộ 6 Services & API Gateway:');
console.log('  * API Gateway:         http://localhost:8080');
console.log('  * Web Client Frontend: http://localhost:3000');
console.log('  * Assessment Process:  http://localhost:3001');
console.log('  * Course LMS System:   http://localhost:3002');
console.log('  * Learning Progress:   http://localhost:3003');
console.log('  * AI Assistant System: http://localhost:3004');
console.log('  * Notification System: http://localhost:3005');
console.log('\n[INFO] Mở trình duyệt tại http://localhost:8080 hoặc http://localhost:3000 để trải nghiệm!\n');
