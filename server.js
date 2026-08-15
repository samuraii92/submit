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

const dashboardHTML = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ninja Command Center 🥷</title>
    <style>
        :root {
            --bg: #09090b;
            --card-bg: #18181b;
            --border: #27272a;
            --primary: #3b82f6;
            --success: #10b981;
            --danger: #ef4444;
            --warning: #f59e0b;
            --text-main: #f4f4f5;
            --text-muted: #a1a1aa;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
        
        body { background-color: var(--bg); color: var(--text-main); padding: 20px; line-height: 1.6; }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .header h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: 2px; text-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
        .header p { color: var(--text-muted); font-size: 1.1rem; margin-top: 5px; }

        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px; margin-bottom: 24px; }
        
        .card { 
            background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; 
            padding: 24px; position: relative; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            transition: transform 0.2s;
        }
        .card:hover { transform: translateY(-2px); }
        .card::before { content: ''; position: absolute; top: 0; right: 0; width: 4px; height: 100%; }
        
        .card.ctrl::before { background: var(--primary); }
        .card.status::before { background: var(--success); transition: background 0.3s; }
        .card.status.locked::before { background: var(--danger); }
        .card.records::before { background: var(--warning); width: 100%; height: 4px; top: 0; right: 0; }

        .card h2 { font-size: 1.3rem; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; color: var(--text-main); }
        
        /* Control Section */
        .val-display { font-size: 2.5rem; font-weight: bold; color: var(--primary); text-shadow: 0 0 10px rgba(59, 130, 246, 0.3); margin: 10px 0; }
        .input-group { display: flex; gap: 10px; margin-top: 15px; }
        input[type="number"] { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: #000; color: #fff; font-size: 1.1rem; text-align: center; outline: none; transition: border 0.3s; }
        input[type="number"]:focus { border-color: var(--primary); }
        button { padding: 12px 24px; background: var(--primary); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 0 15px rgba(59, 130, 246, 0.4); }
        button:hover { background: #2563eb; transform: scale(1.02); }

        /* Status Section */
        .status-indicator { display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100%; padding: 20px 0; }
        .pulse-ring { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 15px; position: relative; }
        .pulse-ring::after { content: ''; position: absolute; width: 100%; height: 100%; border-radius: 50%; animation: pulse 2s infinite; }
        
        .status-open .pulse-ring { background: rgba(16, 185, 129, 0.2); }
        .status-open .pulse-ring::after { border: 2px solid var(--success); }
        .status-locked .pulse-ring { background: rgba(239, 68, 68, 0.2); }
        .status-locked .pulse-ring::after { border: 2px solid var(--danger); animation-duration: 1s; }
        
        .status-text { font-size: 1.5rem; font-weight: bold; text-align: center; }
        .status-open .status-text { color: var(--success); }
        .status-locked .status-text { color: var(--danger); }

        /* Records Section */
        .minute-group { background: #000; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
        .minute-header { background: #1a1a24; padding: 12px 20px; font-weight: bold; font-size: 1.1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; color: var(--primary); }
        .records-list { padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        
        .time-item { background: var(--card-bg); border: 1px solid var(--border); padding: 10px 15px; border-radius: 6px; font-family: monospace; font-size: 1.1rem; text-align: center; color: var(--text-muted); transition: 0.3s; }
        
        /* The Winner Style */
        .time-item.winner { 
            background: rgba(245, 158, 11, 0.1); 
            border: 1px solid var(--warning); 
            color: var(--warning); 
            font-size: 1.25rem; 
            font-weight: bold; 
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
            grid-column: 1 / -1; /* يجعله يأخذ العرض كاملاً في الأعلى */
            display: flex; justify-content: center; align-items: center; gap: 10px;
        }
        
        @keyframes pulse { 0% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
        
        .connection-status { position: fixed; bottom: 10px; left: 10px; font-size: 0.8rem; padding: 5px 10px; border-radius: 20px; background: rgba(0,0,0,0.8); border: 1px solid #333; }
        .conn-online { color: var(--success); }
        .conn-offline { color: var(--danger); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🥷 NINJA COMMAND CENTER</h1>
            <p>لوحة التحكم المركزية - مزامنة ورصد النيتوورك بسرعـة البرق</p>
        </div>

        <div class="dashboard-grid">
            <!-- Control Card -->
            <div class="card ctrl">
                <h2>⚙️ تحكم الطلبات (maxRequests)</h2>
                <div style="color: var(--text-muted); font-size: 0.9rem;">العدد الحالي المحفوظ في جميع المتصفحات المتصلة:</div>
                <div class="val-display" id="currentMax">0</div>
                <div class="input-group">
                    <input type="number" id="maxInput" min="0" value="0" placeholder="أدخل العدد...">
                    <button onclick="saveMaxRequests()">تطبيق فوراً 🚀</button>
                </div>
            </div>

            <!-- Status Card -->
            <div class="card status" id="statusCard">
                <h2>📡 حالة الهجوم المركزية</h2>
                <div class="status-indicator status-open" id="statusIndicator">
                    <div class="pulse-ring"><span style="font-size: 24px;" id="statusIcon">🔓</span></div>
                    <div class="status-text" id="lockStatus">مستعد لتلقي الإشارة</div>
                    <div style="color: var(--text-muted); margin-top: 10px; font-size: 0.9rem;" id="lockSubtext">السيرفر مفتوح وينتظر كشاف 200 OK</div>
                </div>
            </div>
        </div>

        <!-- Records Card -->
        <div class="card records">
            <h2>⏱️ سجل "توقيت العويسي" (الفرز المباشر)</h2>
            <div id="recordsContainer">
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    ⏳ لا توجد إشارات حتى الآن... السيرفر في وضع الاستماع.
                </div>
            </div>
        </div>
    </div>

    <div class="connection-status conn-offline" id="connStatus">⚫ جاري الاتصال...</div>

    <script>
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host;
        let ws;

        function connect() {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                document.getElementById('connStatus').className = 'connection-status conn-online';
                document.getElementById('connStatus').innerHTML = '🟢 متصل بالسيرفر المركزي';
                ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            };
            
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.action === 'DASHBOARD_SYNC') {
                    // Update Requests count
                    document.getElementById('currentMax').innerText = data.maxRequests;
                    
                    // Update Lock Status UI
                    const statusCard = document.getElementById('statusCard');
                    const indicator = document.getElementById('statusIndicator');
                    const text = document.getElementById('lockStatus');
                    const icon = document.getElementById('statusIcon');
                    const subtext = document.getElementById('lockSubtext');

                    if(data.isLocked) {
                        statusCard.className = 'card status locked';
                        indicator.className = 'status-indicator status-locked';
                        icon.innerText = '🔒';
                        text.innerText = 'السيرفر مقفل (قيد الهجوم)';
                        subtext.innerText = 'يتم الآن تجاهل أي إشارات لمدة 4 دقائق...';
                    } else {
                        statusCard.className = 'card status';
                        indicator.className = 'status-indicator status-open';
                        icon.innerText = '🔓';
                        text.innerText = 'مستعد لتلقي الإشارة';
                        subtext.innerText = 'السيرفر مفتوح وينتظر كشاف 200 OK';
                    }

                    // Render Records
                    renderRecords(data.records);
                }
            };
            
            ws.onclose = () => {
                document.getElementById('connStatus').className = 'connection-status conn-offline';
                document.getElementById('connStatus').innerHTML = '🔴 تم فقدان الاتصال! جاري إعادة المحاولة...';
                setTimeout(connect, 2000);
            };
        }

        function saveMaxRequests() {
            const val = document.getElementById('maxInput').value;
            ws.send(JSON.stringify({ action: 'SET_MAX_REQUESTS', value: val }));
        }

        function renderRecords(records) {
            const container = document.getElementById('recordsContainer');
            const minutes = Object.keys(records).sort().reverse(); 
            
            if(minutes.length === 0) return;

            container.innerHTML = '';
            
            minutes.forEach(minute => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'minute-group';
                
                const header = document.createElement('div');
                header.className = 'minute-header';
                header.innerHTML = \`<span>📅 الدقيقة: \${minute}</span> <span style="color:var(--text-muted); font-size:0.9rem;">الطلبات: \${records[minute].length}</span>\`;
                groupDiv.appendChild(header);

                const listDiv = document.createElement('div');
                listDiv.className = 'records-list';

                records[minute].forEach((timeStr, index) => {
                    const timeEl = document.createElement('div');
                    // الفائز (أول عنصر بعد الفرز) يأخذ الستايل المميز
                    if(index === 0) {
                        timeEl.className = 'time-item winner';
                        timeEl.innerHTML = \`🏆 الأسرع: \${timeStr}\`;
                    } else {
                        timeEl.className = 'time-item';
                        timeEl.innerHTML = \`⏱️ \${timeStr}\`;
                    }
                    listDiv.appendChild(timeEl);
                });
                
                groupDiv.appendChild(listDiv);
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
