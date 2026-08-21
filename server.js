const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// التحكم الشامل (الماستر)
let masterConfig = { targetSec: 0, targetMs: 0, isArmed: false, enableFirstRequest: false };

// تخزين إعدادات كل صفحة (Tab) على حدة
let connectedClients = {}; 

const dashboardHTML = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ninja Command Center 🥷</title>
    <style>
        :root { --bg: #09090b; --card-bg: #18181b; --border: #27272a; --primary: #3b82f6; --success: #10b981; --danger: #ef4444; --warning: #f59e0b; --text-main: #f4f4f5; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
        body { background-color: var(--bg); color: var(--text-main); padding: 20px; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 40px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .card.master { border: 2px solid var(--warning); background: #1a1a15; }
        .card.client { border-top: 4px solid var(--primary); }
        .input-group { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
        input[type="number"] { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: #000; color: #fff; text-align: center; font-size: 1.1rem; font-weight: bold; }
        button { padding: 10px 20px; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.3s; width: 100%; margin-top: 10px;}
        .btn-start { background: var(--success); }
        .btn-stop { background: var(--danger); }
        .switch-container { display: flex; align-items: center; justify-content: space-between; background: #000; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 15px; }
        .switch { position: relative; display: inline-block; width: 50px; height: 28px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(22px); }
        .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; margin-bottom: 10px; }
        .status-armed { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
        .status-disarmed { background: rgba(161, 161, 170, 0.2); color: #a1a1aa; border: 1px solid #a1a1aa; }
        .section-title { margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px; color: var(--primary); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>🥷 NINJA COMMAND CENTER</h1></div>
        
        <h2 class="section-title">👑 التحكم الشامل (Master Control)</h2>
        <div class="dashboard-grid">
            <div class="card master">
                <h3>يتحكم في جميع الصفحات معاً</h3>
                <div id="masterStatus" class="status-badge status-disarmed">الكل متوقف ⏸️</div>
                
                <div class="input-group">
                    <div><label>الثانية</label><input type="number" id="m_sec" value="0"></div>
                    <div><label>الميلي</label><input type="number" id="m_ms" value="0"></div>
                </div>
                
                <div class="switch-container">
                    <span>🚀 تفعيل الطلب الأول للكل</span>
                    <label class="switch"><input type="checkbox" id="m_firstReq"><span class="slider"></span></label>
                </div>

                <div class="input-group">
                    <button class="btn-start" onclick="masterAction(true)">تشغيل الكل ▶️</button>
                    <button class="btn-stop" onclick="masterAction(false)">إيقاف الكل 🛑</button>
                </div>
            </div>
        </div>

        <h2 class="section-title">📄 تحكم الصفحات الفردية (Tabs)</h2>
        <div id="clientsContainer" class="dashboard-grid">
            <p style="color:#888;">جاري انتظار اتصال الصفحات...</p>
        </div>
    </div>
    
    <script>
        const wsUrl = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;
        let ws;
        let localClientsState = {};
        
        function connect() {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.action === 'DASHBOARD_SYNC') {
                    renderDashboard(data);
                }
            };
            ws.onclose = () => setTimeout(connect, 2000);
        }

        function renderDashboard(data) {
            // تحديث واجهة الماستر
            document.getElementById('m_sec').value = data.master.targetSec;
            document.getElementById('m_ms').value = data.master.targetMs;
            document.getElementById('m_firstReq').checked = data.master.enableFirstRequest;
            
            const mBadge = document.getElementById('masterStatus');
            mBadge.className = data.master.isArmed ? 'status-badge status-armed' : 'status-badge status-disarmed';
            mBadge.innerHTML = data.master.isArmed ? 'الكل يعمل 🎯' : 'الكل متوقف ⏸️';

            // بناء كروت الصفحات الفردية المتصلة
            const container = document.getElementById('clientsContainer');
            if(data.clients.length === 0) {
                container.innerHTML = '<p style="color:#888;">لا توجد صفحات متصلة حالياً.</p>';
                return;
            }
            
            let html = '';
            data.clients.forEach(c => {
                const conf = c.config;
                html += \`
                <div class="card client">
                    <h3>صفحة: \${c.id.substring(4)}</h3>
                    <div class="status-badge \${conf.isArmed ? 'status-armed' : 'status-disarmed'}">
                        \${conf.isArmed ? 'شغال 🎯' : 'متوقف ⏸️'}
                    </div>
                    <div class="input-group">
                        <input type="number" id="sec_\${c.id}" value="\${conf.targetSec}">
                        <input type="number" id="ms_\${c.id}" value="\${conf.targetMs}">
                    </div>
                    <div class="switch-container">
                        <span>الطلب الأول</span>
                        <label class="switch">
                            <input type="checkbox" id="first_\${c.id}" \${conf.enableFirstRequest ? 'checked' : ''} onchange="clientAction('\${c.id}', \${conf.isArmed})">
                            <span class="slider"></span>
                        </label>
                    </div>
                    \${conf.isArmed 
                        ? \`<button class="btn-stop" onclick="clientAction('\${c.id}', false)">إيقاف 🛑</button>\` 
                        : \`<button class="btn-start" onclick="clientAction('\${c.id}', true)">تشغيل ▶️</button>\`}
                </div>\`;
            });
            container.innerHTML = html;
        }

        // إرسال أوامر الماستر (التحكم بالكل)
        function masterAction(isArmed) {
            const sec = parseInt(document.getElementById('m_sec').value) || 0;
            const ms = parseInt(document.getElementById('m_ms').value) || 0;
            const firstReq = document.getElementById('m_firstReq').checked;
            ws.send(JSON.stringify({ action: 'UPDATE_MASTER', config: { targetSec: sec, targetMs: ms, isArmed, enableFirstRequest: firstReq } }));
        }

        // إرسال أمر لصفحة محددة فقط
        function clientAction(id, isArmed) {
            const sec = parseInt(document.getElementById('sec_' + id).value) || 0;
            const ms = parseInt(document.getElementById('ms_' + id).value) || 0;
            const firstReq = document.getElementById('first_' + id).checked;
            ws.send(JSON.stringify({ action: 'UPDATE_CLIENT', tabId: id, config: { targetSec: sec, targetMs: ms, isArmed, enableFirstRequest: firstReq } }));
        }

        connect();
    </script>
</body>
</html>
`;

const wss = new WebSocket.Server({ noServer: true });

function broadcastDashboards() {
    let activeClients = [];
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN && !c.isDashboard && c.tabId) {
            activeClients.push(connectedClients[c.tabId]);
        }
    });
    
    const payload = JSON.stringify({ action: 'DASHBOARD_SYNC', master: masterConfig, clients: activeClients });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN && c.isDashboard) c.send(payload); });
}

const server = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(dashboardHTML); } 
    else { res.writeHead(404); res.end(); }
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => wss.emit('connection', socket, request));
});

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // تسجيل الداشبورد
            if (data.action === 'REGISTER_DASHBOARD') { 
                ws.isDashboard = true; 
                broadcastDashboards(); 
                return; 
            }
            
            // تسجيل صفحة عميل جديدة
            if (data.action === 'REGISTER_CLIENT') {
                ws.isDashboard = false;
                ws.tabId = data.tabId;
                if (!connectedClients[data.tabId]) {
                    // الصفحة الجديدة تأخذ إعدادات الماستر الافتراضية
                    connectedClients[data.tabId] = { id: data.tabId, config: { ...masterConfig } };
                }
                ws.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: connectedClients[data.tabId].config }));
                broadcastDashboards();
                return;
            }

            // تحديث الشامل (يُجبر كل الصفحات على هذا التحديث)
            if (data.action === 'UPDATE_MASTER') {
                masterConfig = data.config;
                // تحديث بيانات كل العملاء وتوجيه الأمر لهم
                wss.clients.forEach(c => {
                    if (!c.isDashboard && c.tabId) {
                        connectedClients[c.tabId].config = { ...masterConfig };
                        c.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: masterConfig }));
                    }
                });
                broadcastDashboards(); 
            }

            // تحديث صفحة واحدة فقط
            if (data.action === 'UPDATE_CLIENT') {
                if (connectedClients[data.tabId]) {
                    connectedClients[data.tabId].config = data.config;
                    // توجيه التحديث لهذه الصفحة بعينها فقط
                    wss.clients.forEach(c => {
                        if (!c.isDashboard && c.tabId === data.tabId) {
                            c.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: data.config }));
                        }
                    });
                    broadcastDashboards();
                }
            }

            // إرسال توقيت دخول الصفحة (اللوجيك الإضافي)
            if (data.action === 'SLOT_200_OK_FOUND') {
                wss.clients.forEach(c => { if (c.isDashboard) c.send(JSON.stringify(data)); });
            }

        } catch (e) {}
    });

    ws.on('close', () => { broadcastDashboards(); });
});

setInterval(() => {
    wss.clients.forEach(ws => { 
        if (!ws.isAlive) { ws.terminate(); broadcastDashboards(); return; }
        ws.isAlive = false; ws.ping(); 
    });
}, 5000);

server.listen(PORT, () => { console.log(`🚀 السيرفر يعمل الآن على البورت ${PORT}`); });
