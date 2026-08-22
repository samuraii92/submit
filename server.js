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
        
        .log-box { margin-top: 20px; background: #000; padding: 15px; border-radius: 8px; border: 1px solid var(--success); }
        .log-content { max-height: 150px; overflow-y: auto; font-family: monospace; font-size: 14px; }
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
                    <label class="switch"><input type="checkbox" id="m_firstReq" onchange="updateMasterFirstReq()"><span class="slider"></span></label>
                </div>

                <div class="input-group">
                    <button class="btn-start" onclick="masterAction(true)">تشغيل الكل ▶️</button>
                    <button class="btn-stop" onclick="masterAction(false)">إيقاف الكل 🛑</button>
                </div>

                <div class="log-box">
                    <h4 style="color: var(--success); margin-bottom: 10px;">⏱️ سجل الدخول الناجح (200 OK)</h4>
                    <div id="log200" class="log-content">
                        <span style="color:#555;">في وضع الاستماع لعمليات الدخول...</span>
                    </div>
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
        
        function connect() {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                
                if (data.action === 'DASHBOARD_SYNC') {
                    renderDashboardSmartly(data);
                }
                else if (data.action === 'SLOT_200_OK_FOUND') {
                    const logBox = document.getElementById('log200');
                    if(logBox.innerHTML.includes("في وضع الاستماع")) logBox.innerHTML = "";
                    logBox.innerHTML = \`<div style="margin-bottom: 5px; padding: 5px; border-bottom: 1px solid #333;">✅ دخلت صفحة بنجاح: <b style="color: var(--success); font-size: 16px;">\${data.time}</b></div>\` + logBox.innerHTML;
                }
            };
            ws.onclose = () => setTimeout(connect, 2000);
        }

        // 🔥 التحديث الذكي للصفحة للحفاظ على أرقامك
        function renderDashboardSmartly(data) {
            // تحديث قيم الماستر (فقط إذا لم يكن الماوس داخل المربع يكتب)
            const mSec = document.getElementById('m_sec');
            const mMs = document.getElementById('m_ms');
            if (document.activeElement !== mSec) mSec.value = data.master.targetSec;
            if (document.activeElement !== mMs) mMs.value = data.master.targetMs;
            
            document.getElementById('m_firstReq').checked = data.master.enableFirstRequest;
            
            const mBadge = document.getElementById('masterStatus');
            mBadge.className = data.master.isArmed ? 'status-badge status-armed' : 'status-badge status-disarmed';
            mBadge.innerHTML = data.master.isArmed ? 'الكل يعمل 🎯' : 'الكل متوقف ⏸️';

            const container = document.getElementById('clientsContainer');
            if(data.clients.length === 0) {
                container.innerHTML = '<p style="color:#888;">لا توجد صفحات متصلة حالياً.</p>';
                return;
            }

            if (container.innerHTML.includes('لا توجد صفحات')) {
                container.innerHTML = '';
            }

            // 1. مسح الكروت التي لم تعد متصلة
            const incomingIds = data.clients.map(c => 'client_' + c.id);
            Array.from(container.children).forEach(child => {
                if (child.id && !incomingIds.includes(child.id)) {
                    child.remove();
                }
            });

            // 2. تحديث الكروت الذكي
            data.clients.forEach(c => {
                const conf = c.config;
                let card = document.getElementById('client_' + c.id);

                // إذا كانت الصفحة جديدة تماماً ننشئ لها كارت
                if (!card) {
                    card = document.createElement('div');
                    card.className = 'card client';
                    card.id = 'client_' + c.id;
                    card.innerHTML = \`
                        <h3>صفحة: \${c.id.substring(4)}</h3>
                        <div id="badge_\${c.id}" class="status-badge \${conf.isArmed ? 'status-armed' : 'status-disarmed'}">
                            \${conf.isArmed ? 'شغال 🎯' : 'متوقف ⏸️'}
                        </div>
                        <div class="input-group">
                            <input type="number" id="sec_\${c.id}" value="\${conf.targetSec}">
                            <input type="number" id="ms_\${c.id}" value="\${conf.targetMs}">
                        </div>
                        <div class="switch-container">
                            <span>الطلب الأول</span>
                            <label class="switch">
                                <input type="checkbox" id="first_\${c.id}" \${conf.enableFirstRequest ? 'checked' : ''} onchange="clientAction('\${c.id}', null)">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <button id="btn_\${c.id}" class="\${conf.isArmed ? 'btn-stop' : 'btn-start'}" onclick="clientAction('\${c.id}', \${!conf.isArmed})">
                            \${conf.isArmed ? 'إيقاف 🛑' : 'تشغيل ▶️'}
                        </button>
                    \`;
                    container.appendChild(card);
                } 
                // إذا كان الكارت موجوداً، نقوم بتحديث أجزائه فقط لتفادي تصفير العداد
                else {
                    const badge = document.getElementById('badge_' + c.id);
                    badge.className = 'status-badge ' + (conf.isArmed ? 'status-armed' : 'status-disarmed');
                    badge.innerHTML = conf.isArmed ? 'شغال 🎯' : 'متوقف ⏸️';

                    const secInput = document.getElementById('sec_' + c.id);
                    const msInput = document.getElementById('ms_' + c.id);
                    
                    // 🔥 السر هنا: لا تقم بتحديث المربع إذا كنت تكتب فيه الآن!
                    if (document.activeElement !== secInput) secInput.value = conf.targetSec;
                    if (document.activeElement !== msInput) msInput.value = conf.targetMs;

                    document.getElementById('first_' + c.id).checked = conf.enableFirstRequest;

                    const btn = document.getElementById('btn_' + c.id);
                    btn.className = conf.isArmed ? 'btn-stop' : 'btn-start';
                    btn.innerHTML = conf.isArmed ? 'إيقاف 🛑' : 'تشغيل ▶️';
                    btn.onclick = () => clientAction(c.id, !conf.isArmed);
                }
            });
        }

        function masterAction(isArmed) {
            const sec = parseInt(document.getElementById('m_sec').value) || 0;
            const ms = parseInt(document.getElementById('m_ms').value) || 0;
            const firstReq = document.getElementById('m_firstReq').checked;
            ws.send(JSON.stringify({ action: 'UPDATE_MASTER', config: { targetSec: sec, targetMs: ms, isArmed, enableFirstRequest: firstReq } }));
        }

        function updateMasterFirstReq() {
            const firstReq = document.getElementById('m_firstReq').checked;
            ws.send(JSON.stringify({ action: 'UPDATE_MASTER_FIRST_REQ', enableFirstRequest: firstReq }));
        }

        function clientAction(id, isArmedArg) {
            const sec = parseInt(document.getElementById('sec_' + id).value) || 0;
            const ms = parseInt(document.getElementById('ms_' + id).value) || 0;
            const firstReq = document.getElementById('first_' + id).checked;
            
            // إذا كان التغيير قادم من زر "الطلب الأول"، نحافظ على حالة التشغيل كما هي
            let finalArmed = isArmedArg;
            if (isArmedArg === null) {
                finalArmed = document.getElementById('btn_' + id).className.includes('stop');
            }

            ws.send(JSON.stringify({ action: 'UPDATE_CLIENT', tabId: id, config: { targetSec: sec, targetMs: ms, isArmed: finalArmed, enableFirstRequest: firstReq } }));
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
            
            if (data.action === 'REGISTER_DASHBOARD') { 
                ws.isDashboard = true; 
                broadcastDashboards(); 
                return; 
            }
            
            if (data.action === 'REGISTER_CLIENT') {
                ws.isDashboard = false;
                ws.tabId = data.tabId;
                if (!connectedClients[data.tabId]) {
                    connectedClients[data.tabId] = { id: data.tabId, config: { ...masterConfig } };
                }
                ws.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: connectedClients[data.tabId].config }));
                broadcastDashboards();
                return;
            }

            if (data.action === 'UPDATE_MASTER') {
                masterConfig = data.config;
                wss.clients.forEach(c => {
                    if (!c.isDashboard && c.tabId) {
                        connectedClients[c.tabId].config = { ...masterConfig };
                        c.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: masterConfig }));
                    }
                });
                broadcastDashboards(); 
            }

            if (data.action === 'UPDATE_MASTER_FIRST_REQ') {
                masterConfig.enableFirstRequest = data.enableFirstRequest;
                wss.clients.forEach(c => {
                    if (!c.isDashboard && c.tabId && connectedClients[c.tabId]) {
                        connectedClients[c.tabId].config.enableFirstRequest = data.enableFirstRequest;
                        c.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: connectedClients[c.tabId].config }));
                    }
                });
                broadcastDashboards();
            }

            if (data.action === 'UPDATE_CLIENT') {
                if (connectedClients[data.tabId]) {
                    connectedClients[data.tabId].config = data.config;
                    wss.clients.forEach(c => {
                        if (!c.isDashboard && c.tabId === data.tabId) {
                            c.send(JSON.stringify({ action: 'SYNC_TIMER_CONFIG', config: data.config }));
                        }
                    });
                    broadcastDashboards();
                }
            }

            if (data.action === 'SLOT_200_OK_FOUND') {
                wss.clients.forEach(c => { 
                    if (c.isDashboard && c.readyState === WebSocket.OPEN) {
                        c.send(JSON.stringify(data)); 
                    } 
                });
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
