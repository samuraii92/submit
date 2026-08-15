const WebSocket = require('ws');

// استخدام البورت الذي توفره الاستضافة (Render أو Railway) أو البورت 8080 محلياً
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`🚀 [NINJA SERVER] السيرفر يعمل ومستعد لتلقي الإشارات على البورت ${PORT}...`);
});

// متغيرات القفل ونظام التبريد (Cooldown)
let isLocked = false;
const LOCK_DURATION = 4 * 60 * 1000; // 4 دقائق بالملي ثانية

wss.on('connection', (ws) => {
    console.log('🔗 [NINJA SERVER] متصفح جديد انضم للجيش (قناص جاهز)!');

    // إعدادات الحفاظ على الاتصال (لمنع الاستضافة من قطع الـ WebSocket الخامل)
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // الاستماع لرسائل المتصفحات
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // تجاهل أي رسائل غير رسالة الكشاف (لزيادة الأمان)
            if (data.action === 'SLOT_200_OK_FOUND') {
                
                // 1. إذا كان السيرفر مقفولاً، تجاهل الإشارة تماماً ولا تفعل شيئاً
                if (isLocked) {
                    console.log('🔒 [تجاهل] تلقيت إشارة 200 OK، ولكن السيرفر في فترة الـ 4 دقائق (مقفل).');
                    return;
                }

                // 2. إذا كان السيرفر مفتوحاً (أول كشاف يصل)
                isLocked = true; // أقفل السيرفر فوراً
                console.log('⚡ [هجوم] أول إشارة وصلت بنجاح! جاري إعطاء الأمر لجميع المتصفحات وقفل السيرفر لمدة 4 دقائق...');

                // إرسال أمر الانقضاض الموحد لجميع المتصفحات المتصلة والمفتوحة
                let targetCount = 0;
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            action: 'EXECUTE_MASSIVE_SUBMIT' 
                        }));
                        targetCount++;
                    }
                });
                
                console.log(`💥 [تم التنفيذ] تم إرسال أمر الهجوم إلى ${targetCount} متصفح/أجهزة.`);

                // 3. فك القفل بعد مرور 4 دقائق للعودة للاستماع من جديد
                setTimeout(() => {
                    isLocked = false;
                    console.log('🔓 [مفتوح] انتهت الـ 4 دقائق بنجاح. السيرفر مستعد لتلقي أول إشارة من جديد.');
                }, LOCK_DURATION);
            }
        } catch (e) {
            console.error('❌ [NINJA SERVER] خطأ في قراءة أو معالجة البيانات:', e);
        }
    });

    // عند انقطاع اتصال متصفح
    ws.on('close', () => {
        console.log('⚠️ [NINJA SERVER] أحد المتصفحات قطع الاتصال.');
    });
});

// نظام النبضات (Ping) كل 30 ثانية للحفاظ على استقرار الاتصال بالاستضافة (Keep-Alive)
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(pingInterval);
});
