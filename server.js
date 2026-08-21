const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// === متغيرات التحكم المركزي ===
let currentMaxRequests = 0; 
let isLocked = false;
const LOCK_DURATION = 4 * 60 * 1000; 
let timeRecords = {}; 

// المتغيرات الجديدة للعداد والإرسال التلقائي
let masterConfig = {
    targetSec: 0,
    targetMs: 0,
    isArmed: false,        // هل العداد شغال؟
    autoSubmit: false      // هل يضرب فور الدخول للصفحة؟
};

const dashboardHTML = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ninja Command Center 🥷</title>
    <style>
        :root { --bg: #09090b; --card-bg: #18181b; --border: #27272a; --primary: #3b82f6; --success: #10b981; --danger: #ef4444; --warning: #f59e0b; --text-main: #f4f4f5; --text-muted: #a1a1aa; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
        body { background-color: var(--bg); color: var(--text-main); padding: 20px; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .header h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: 2px; text-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px; margin-bottom: 24px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .card.ctrl::before { content: ''; position: absolute; top: 0; right: 0; width: 4px; height: 100%; background: var(--primary); }
        .card.timer::before { content: ''; position: absolute; top: 0; right: 0; width: 4px; height: 100%; background: var(--warning); }
        .input-group { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
        input[type="number"] { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: #000; color: #fff; text-align: center; font-size: 1.2rem; font-weight: bold; }
        button { padding: 12px 24px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.3s; }
        button:hover { opacity: 0.8; }
        .btn-start { background: var(--success); width: 100%; margin-top: 15px; font-size: 1.2rem; }
        .btn-stop { background: var(--danger); width: 100%; margin-top: 15px; font-size: 1.2rem; display: none; }
        
        .switch-container { display: flex; align-items: center; justify-content: space-between; background: #000; padding: 15px; border-radius: 8px; border: 1px solid var(--border); margin-top: 15px; }
        .switch { position: relative; display: inline-block; width: 60px; height: 34px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 26px; width: 26px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--danger); box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
        input:checked + .slider:before { transform: translateX(26px); }
        
        .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; margin-bottom: 15px; }
        .status-armed { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
        .status-disarmed { background: rgba(161, 161, 170, 0.2); color: var(--text-muted); border: 1px solid var(--text-muted); }
        
        .connection-status { position: fixed; bottom: 10px; left: 10px; font-size: 0.8rem; padding: 5px 10px; border-radius: 20px; background: rgba(0,0,0,0.8); border: 1px solid #333; }
        .conn-online { color: var(--success); }
        .conn-offline { color: var(--danger); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>🥷 NINJA COMMAND CENTER</h1></div>
        <div class="dashboard-grid">
            
            <!-- لوحة التوقيت والمزامنة -->
            <div class="card timer">
                <h2>⏰ نظام التوقيت المركزي</h2>
                <div id="armStatus" class="status-badge status-disarmed">العداد متوقف ⏸️</div>
                
                <div class="input-group">
                    <div>
                        <label>الثواني (Sec)</label>
                        <input type="number" id="secInput" min="0" max="59" value="0">
                    </div>
                    <div>
                        <label>الميلي (Ms)</label>
                        <input type="number" id="msInput" min="0" max="999" value="0">
                    </div>
                </div>
                <button id="btnStart" class="btn-start" onclick="toggleTimer(true)">تشغيل العداد للجميع ▶️</button>
                <button id="btnStop" class="btn-stop" onclick="toggleTimer(false)">إيقاف العداد 🛑</button>

                <div class="switch-container">
                    <div>
                        <strong style="color: var(--danger);">🔥 هجوم فوري عند الدخول</strong>
                        <div style="font-size: 0.8rem; color: #888;">(يضرب فور فتح الصفحة وتخطي الكابتشا)</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="autoSubmitCheck" onchange="updateAutoSubmit()">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <!-- تحكم الطلبات الأصلي -->
            <div class="card ctrl">
                <h2>⚙️ تحكم الطلبات</h2>
                <div style="font-size: 2.5rem; font-weight: bold; color: var(--primary); margin: 10px 0;" id="currentMax">0</div>
                <div class="input-group">
                    <input type="number" id="maxInput" min="0" value="0">
                    <button onclick="saveMaxRequests()">تطبيق 🚀</button>
                </div>
            </div>

        </div>
    </div>
    
    <div class="connection-status conn-offline" id="connStatus">⚫ جاري الاتصال...</div>

    <script>
        const wsUrl = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;
        let ws;
        
        function connect() {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                document.getElementById('connStatus').className = 'connection-status conn-online';
                document.getElementById('connStatus').innerHTML = '🟢 متصل بالسيرفر';
                ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            };
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.action === 'DASHBOARD_SYNC') {
                    document.getElementById('currentMax').innerText = data.maxRequests;
                    
                    // تحديث واجهة العداد
                    document.getElementById('secInput').value = data.config.targetSec;
                    document.getElementById('msInput').value = data.config.targetMs;
                    document.getElementById('autoSubmitCheck').checked = data.config.autoSubmit;
                    
                    const armBadge = document.getElementById('armStatus');
                    if (data.config.isArmed) {
                        armBadge.className = 'status-badge status-armed';
                        armBadge.innerHTML = 'العداد شغال ويتربص 🎯';
                        document.getElementById('btnStart').style.display = 'none';
                        document.getElementById('btnStop').style.display = 'block';
                    } else {
                        armBadge.className = 'status-badge status-disarmed';
                        armBadge.innerHTML = 'العداد متوقف ⏸️';
                        document.getElementById('btnStart').style.display = 'block';
                        document.getElementById('btnStop').style.display = 'none';
                    }
                }
            };
            ws.onclose = () => {
                document.getElementById('connStatus').className = 'connection-status conn-offline';
                document.getElementById('connStatus').innerHTML = '🔴 انقطع الاتصال...';
                setTimeout(connect, 2000);
            };
        }

        function saveMaxRequests() { 
            ws.send(JSON.stringify({ action: 'SET_MAX_REQUESTS', value: document.getElementById('maxInput').value })); 
        }

        function toggleTimer(arm) {
            const sec = parseInt(document.getElementById('secInput').value) || 0;
            const ms = parseInt(document.getElementById('msInput').value) || 0;
            ws.send(JSON.stringify({ action: 'UPDATE_MASTER_CONFIG', sec: sec, ms: ms, isArmed: arm, autoSubmit: document.getElementById('autoSubmitCheck').checked }));
        }

        function updateAutoSubmit() {
            const sec = parseInt(document.getElementById('secInput').value) || 0;
            const ms = parseInt(document.getElementById('msInput').value) || 0;
            const isArmed = document.getElementById('btnStop').style.display === 'block'; // حالة العداد الحالية
            const autoSubmit = document.getElementById('autoSubmitCheck').checked;
            ws.send(JSON.stringify({ action: 'UPDATE_MASTER_CONFIG', sec: sec, ms: ms, isArmed: isArmed, autoSubmit: autoSubmit }));
        }

        connect();
    </script>
</body>
</html>
`;

const wss = new WebSocket.Server({ noServer: true });

function updateDashboards() {
    const payload = JSON.stringify({ 
        action: 'DASHBOARD_SYNC', 
        maxRequests: currentMaxRequests, 
        isLocked: isLocked,
        config: masterConfig 
    });
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN && client.isDashboard) client.send(payload); });
}

// دالة بث الإعدادات للمتصفحات (العملاء)
function broadcastConfigToClients() {
    const payload = JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: masterConfig });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && !client.isDashboard) {
            client.send(payload);
        }
    });
}

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHTML);
    } else {
        res.writeHead(404); res.end();
    }
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => { wss.emit('connection', socket, request); });
});

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // إرسال الإعدادات فوراً لأي متصفح جديد يتصل
    ws.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: masterConfig }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === 'REGISTER_DASHBOARD') {
                ws.isDashboard = true; 
                updateDashboards(); 
                return;
            }
            if (data.action === 'SET_MAX_REQUESTS') {
                currentMaxRequests = parseInt(data.value, 10);
                updateDashboards();
                return;
            }
            if (data.action === 'UPDATE_MASTER_CONFIG') {
                masterConfig.targetSec = data.sec;
                masterConfig.targetMs = data.ms;
                masterConfig.isArmed = data.isArmed;
                masterConfig.autoSubmit = data.autoSubmit;
                
                broadcastConfigToClients(); // بث للمتصفحات فوراً
                updateDashboards();         // تحديث الداشبورد
                return;
            }
        } catch (e) {}
    });
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false; ws.ping();
    });
}, 30000);

server.listen(PORT, () => { console.log(`🚀 السيرفر يعمل الآن على البورت ${PORT}`); });
