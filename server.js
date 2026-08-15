const http = require('http');
const WebSocket = require('ws');

// استخدام البورت من الاستضافة أو 8080 محلياً
const PORT = process.env.PORT || 8080;

// ==========================================
// 1. قواعد البيانات المؤقتة (State)
// ==========================================
let isLocked = false;
const LOCK_DURATION = 4 * 60 * 1000; // 4 دقائق بالملي ثانية
let currentMaxRequests = 0; // العدد الافتراضي للطلبات
let timeRecords = {}; // كائن لتخزين الأوقات مفروزة بالدقيقة

// ==========================================
// 2. واجهة الداشبورد (HTML الأساسي)
// ==========================================
// بنيت لك هيكل HTML أساسي ومرتب لكي نرى المنطق، وبعدها سنعمل على ستايل احترافي كما اتفقنا
const dashboardHTML = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>Ninja Dashboard 🥷</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #111; color: #fff; padding: 20px; margin: 0; }
        h1 { color: #ffeb3b; text-align: center; margin-bottom: 30px; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .card { background: #222; padding: 20px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #444; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .input-group { display: flex; align-items: center; gap: 10px; margin-top: 15px; }
        input[type="number"] { padding: 10px; border-radius: 5px; border: 1px solid #555; background: #333; color: white; font-size: 16px; width: 100px; text-align: center; }
        button { padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        button:hover { background: #1976d2; }
        .minute-group { margin-bottom: 20px; padding: 15px; background: #1a1a1a; border-radius: 8px; border-right: 4px solid #4caf50; }
        .minute-title { font-weight: bold; color: #4caf50; margin-bottom: 10px; font-size: 1.3em; border-bottom: 1px dashed #444; padding-bottom: 5px;}
        .time-item { padding: 8px; color: #ccc; font-family: monospace; font-size: 1.2em; background: #2a2a2a; margin-bottom: 5px; border-radius: 4px;}
        .time-item.winner { color: #ff5722; font-weight: bold; background: #331a1a; border: 1px solid #ff5722; } /* تمييز التوقيت الأسرع */
    </style>
</head>
<body>
    <h1>🥷 NINJA COMMAND CENTER 🥷</h1>
    
    <!-- قسم التحكم في عدد الطلبات -->
    <div class="card">
        <h2 style="margin-top:0;">⚙️ التحكم في عدد الطلبات (maxRequests)</h2>
        <div style="font-size: 1.2em;">القيمة الحالية في المتصفحات: <span id="currentMax" style="color:#4caf50; font-weight:bold; font-size:1.5em;">0</span></div>
        <div class="input-group">
            <input type="number" id="maxInput" min="0" value="0">
            <button onclick="saveMaxRequests()">تحديث وإرسال للكل</button>
        </div>
    </div>

    <!-- قسم حالة السيرفر (قفل 4 دقائق) -->
    <div class="card">
        <h2 style="margin-top:0;">🔴 حالة الهجوم الموحد</h2>
        <div id="lockStatus" style="font-size: 1.4em; font-weight: bold; color: #4caf50;">🔓 مستعد لتلقي الإشارة (السيرفر مفتوح)</div>
    </div>

    <!-- قسم توقيت العويسي -->
    <div class="card">
        <h2 style="margin-top:0;">⏱️ سجل "توقيت العويسي" (الرصد الشبكي 200 OK)</h2>
        <p style="color: #888;">الأسرع في كل دقيقة يظهر في القمة باللون الأحمر</p>
        <div id="recordsContainer">لا توجد إشارات حتى الآن...</div>
    </div>

    <script>
        // الاتصال التلقائي بنفس السيرفر (WebSocket)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host;
        let ws;

        function connect() {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                console.log('متصل بالسيرفر كـ لوحة تحكم');
                ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            };
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.action === 'DASHBOARD_SYNC') {
                    // تحديث القيمة
                    document.getElementById('currentMax').innerText = data.maxRequests;
                    document.getElementById('maxInput').value = data.maxRequests;
                    
                    // تحديث حالة القفل
                    const lockEl = document.getElementById('lockStatus');
                    if(data.isLocked) {
                        lockEl.innerText = "🔒 السيرفر مقفل (في فترة الـ 4 دقائق تبريد)";
                        lockEl.style.color = "#ff5722";
                    } else {
                        lockEl.innerText = "🔓 مستعد لتلقي الإشارة (مفتوح)";
                        lockEl.style.color = "#4caf50";
                    }

                    // رسم السجلات
                    renderRecords(data.records);
                }
            };
            ws.onclose = () => setTimeout(connect, 2000);
        }

        function saveMaxRequests() {
            const val = document.getElementById('maxInput').value;
            ws.send(JSON.stringify({ action: 'SET_MAX_REQUESTS', value: val }));
        }

        function renderRecords(records) {
            const container = document.getElementById('recordsContainer');
            container.innerHTML = '';
            
            // جلب الدقائق وترتيبها لعرض الأحدث أولاً
            const minutes = Object.keys(records).sort().reverse(); 
            
            if(minutes.length === 0) {
                container.innerHTML = '<div style="color:#777;">لا توجد سجلات بعد...</div>';
                return;
            }

            minutes.forEach(minute => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'minute-group';
                
                const title = document.createElement('div');
                title.className = 'minute-title';
                title.innerText = 'الدقيقة: ' + minute;
                groupDiv.appendChild(title);

                // الأوقات تأتي مرتبة من السيرفر (الأسرع أولاً)
                records[minute].forEach((timeStr, index) => {
                    const timeEl = document.createElement('div');
                    timeEl.className = 'time-item' + (index === 0 ? ' winner' : '');
                    timeEl.innerText = (index === 0 ? '🏆 الأسرع: ' : '⏱️ ') + timeStr;
                    groupDiv.appendChild(timeEl);
                });
                
                container.appendChild(groupDiv);
            });
        }

        connect();
    </script>
</body>
</html>
`;

// ==========================================
// 3. إنشاء سيرفر الـ HTTP (لعرض الداشبورد)
// ==========================================
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHTML);
    } else {
        res.writeHead(404);
        res.end();
    }
});

// ==========================================
// 4. إنشاء سيرفر الـ WebSocket (لتبادل الإشارات)
// ==========================================
const wss = new WebSocket.Server({ server });

// دالة لتحديث البيانات في كل الداشبوردات المفتوحة
function updateDashboards() {
    const payload = JSON.stringify({
        action: 'DASHBOARD_SYNC',
        maxRequests: currentMaxRequests,
        records: timeRecords,
        isLocked: isLocked
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.isDashboard) {
            client.send(payload);
        }
    });
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // أ. تسجيل لوحة التحكم (الداشبورد) عند الدخول
            if (data.action === 'REGISTER_DASHBOARD') {
                ws.isDashboard = true;
                updateDashboards(); // إرسال الداتا فوراً
                return;
            }

            // ب. استقبال طلب تغيير عدد الطلبات من الداشبورد
            if (data.action === 'SET_MAX_REQUESTS') {
                currentMaxRequests = parseInt(data.value, 10);
                console.log(`[DAHSBOARD] 🔄 تم تعديل الطلبات إلى: ${currentMaxRequests}`);
                
                // إرسال التحديث لجميع المتصفحات (الإضافات) المتصلة
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && !client.isDashboard) {
                        client.send(JSON.stringify({
                            action: 'UPDATE_MAX_REQUESTS',
                            value: currentMaxRequests
                        }));
                    }
                });
                updateDashboards(); // تحديث الرقم في الداشبورد نفسه
                return;
            }

            // ج. استقبال إشارة 200 OK من الكشاف (الرصد الشبكي)
            if (data.action === 'SLOT_200_OK_FOUND') {
                const exactTime = data.time || "00:00:00.000"; // توقيت العويسي
                
                // --- نظام الفرز والتسجيل ---
                // استخراج الدقيقة (مثال: من 14:25:30.150 نأخذ 14:25 فقط كـ مفتاح)
                const minuteKey = exactTime.substring(0, 5);
                
                if (!timeRecords[minuteKey]) {
                    timeRecords[minuteKey] = [];
                }
                
                // إضافة التوقيت إذا لم يكن مسجلاً مسبقاً لمنع التكرار التام
                if (!timeRecords[minuteKey].includes(exactTime)) {
                    timeRecords[minuteKey].push(exactTime);
                    // فرز المصفوفة (بما أن التنسيق نصي وثابت، سيتم وضع الثواني والميلي ثانية الأصغر في القمة)
                    timeRecords[minuteKey].sort();
                }
                
                // إرسال التوقيت فورا للداشبورد ليظهر لك
                updateDashboards(); 

                // --- نظام الهجوم والقفل الـ 4 دقائق ---
                if (isLocked) {
                    console.log(`🔒 [تجاهل هجوم] إشارة 200 OK بتوقيت ${exactTime} (السيرفر مقفل)`);
                    return;
                }

                // هذا أول كشاف! أقفل السيرفر وهاجم!
                isLocked = true;
                console.log(`⚡ [هجوم] أول إشارة وصلت بتوقيت ${exactTime}! جاري الهجوم وقفل السيرفر...`);

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && !client.isDashboard) {
                        client.send(JSON.stringify({ action: 'EXECUTE_MASSIVE_SUBMIT' }));
                    }
                });

                updateDashboards(); // تحديث حالة القفل في الداشبورد إلى "مقفل"

                // فك القفل بعد 4 دقائق
                setTimeout(() => {
                    isLocked = false;
                    console.log('🔓 [مفتوح] انتهت الـ 4 دقائق. السيرفر مستعد.');
                    updateDashboards();
                }, LOCK_DURATION);
            }

        } catch (e) {
            console.error('❌ خطأ في معالجة البيانات:', e);
        }
    });
});

// نظام النبضات (Keep-Alive) لمنع Render من قطع الاتصال
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(pingInterval); });

// تشغيل السيرفر
server.listen(PORT, () => {
    console.log(`🚀 [NINJA SERVER & DASHBOARD] السيرفر يعمل الآن على البورت ${PORT}`);
});
