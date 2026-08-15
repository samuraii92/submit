const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

let isLocked = false;
const LOCK_DURATION = 4 * 60 * 1000; 
let currentMaxRequests = 0; 
let timeRecords = {}; 

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
        .card.status::before { content: ''; position: absolute; top: 0; right: 0; width: 4px; height: 100%; background: var(--success); }
        .card.status.locked::before { background: var(--danger); }
        .val-display { font-size: 2.5rem; font-weight: bold; color: var(--primary); margin: 10px 0; }
        .input-group { display: flex; gap: 10px; margin-top: 15px; }
        input[type="number"] { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: #000; color: #fff; text-align: center; font-size: 1.1rem; }
        button { padding: 12px 24px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .minute-group { background: #000; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; }
        .minute-header { background: #1a1a24; padding: 12px 20px; font-weight: bold; color: var(--primary); border-bottom: 1px solid var(--border); }
        .records-list { padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .time-item { background: var(--card-bg); border: 1px solid var(--border); padding: 10px; border-radius: 6px; text-align: center; font-family: monospace; }
        .time-item.winner { background: rgba(245, 158, 11, 0.1); border-color: var(--warning); color: var(--warning); font-weight: bold; grid-column: 1 / -1; }
        .connection-status { position: fixed; bottom: 10px; left: 10px; font-size: 0.8rem; padding: 5px 10px; border-radius: 20px; background: rgba(0,0,0,0.8); border: 1px solid #333; }
        .conn-online { color: var(--success); }
        .conn-offline { color: var(--danger); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>🥷 NINJA COMMAND CENTER</h1></div>
        <div class="dashboard-grid">
            <div class="card ctrl">
                <h2>⚙️ تحكم الطلبات (maxRequests)</h2>
                <div class="val-display" id="currentMax">0</div>
                <div class="input-group">
                    <input type="number" id="maxInput" min="0" value="0">
                    <button onclick="saveMaxRequests()">تطبيق فوراً 🚀</button>
                </div>
            </div>
            <div class="card status" id="statusCard">
                <h2>📡 حالة الهجوم المركزية</h2>
                <div style="font-size: 1.5rem; font-weight: bold; text-align: center; margin-top:20px;" id="lockStatus">مستعد لتلقي الإشارة 🔓</div>
            </div>
        </div>
        <div class="card records">
            <h2>⏱️ سجل "توقيت العويسي"</h2>
            <div id="recordsContainer"><div style="text-align: center; color: #888; padding: 40px;">⏳ في وضع الاستماع...</div></div>
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
                document.getElementById('connStatus').innerHTML = '🟢 متصل بالسيرفر المركزي';
                ws.send(JSON.stringify({ action: 'REGISTER_DASHBOARD' }));
            };
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.action === 'DASHBOARD_SYNC') {
                    document.getElementById('currentMax').innerText = data.maxRequests;
                    const statusCard = document.getElementById('statusCard');
                    const text = document.getElementById('lockStatus');
                    if(data.isLocked) {
                        statusCard.classList.add('locked');
                        text.innerText = 'السيرفر مقفل (قيد الهجوم) 🔒';
                        text.style.color = '#ef4444';
                    } else {
                        statusCard.classList.remove('locked');
                        text.innerText = 'مستعد لتلقي الإشارة 🔓';
                        text.style.color = '#10b981';
                    }
                    renderRecords(data.records);
                }
            };
            ws.onclose = () => {
                document.getElementById('connStatus').className = 'connection-status conn-offline';
                document.getElementById('connStatus').innerHTML = '🔴 تم فقدان الاتصال...';
                setTimeout(connect, 2000);
            };
        }
        function saveMaxRequests() { ws.send(JSON.stringify({ action: 'SET_MAX_REQUESTS', value: document.getElementById('maxInput').value })); }
        function renderRecords(records) {
            const container = document.getElementById('recordsContainer');
            const minutes = Object.keys(records).sort().reverse(); 
            if(minutes.length === 0) return;
            container.innerHTML = '';
            minutes.forEach(minute => {
                const groupDiv = document.createElement('div'); groupDiv.className = 'minute-group';
                groupDiv.innerHTML = \`<div class="minute-header">📅 الدقيقة: \${minute}</div>\`;
                const listDiv = document.createElement('div'); listDiv.className = 'records-list';
                records[minute].forEach((timeStr, index) => {
                    const timeEl = document.createElement('div');
                    timeEl.className = index === 0 ? 'time-item winner' : 'time-item';
                    timeEl.innerHTML = index === 0 ? \`🏆 الأسرع: \${timeStr}\` : \`⏱️ \${timeStr}\`;
                    listDiv.appendChild(timeEl);
                });
                groupDiv.appendChild(listDiv); container.appendChild(groupDiv);
            });
        }
        connect();
    </script>
</body>
</html>
`;

const wss = new WebSocket.Server({ noServer: true });

function updateDashboards() {
    const payload = JSON.stringify({ action: 'DASHBOARD_SYNC', maxRequests: currentMaxRequests, records: timeRecords, isLocked: isLocked });
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN && client.isDashboard) client.send(payload); });
}

// 🚀 الدالة المسؤولة عن إطلاق الهجوم
function triggerMassiveAttack(exactTime) {
    const minuteKey = exactTime.substring(0, 5);
    if (!timeRecords[minuteKey]) timeRecords[minuteKey] = [];
    if (!timeRecords[minuteKey].includes(exactTime)) {
        timeRecords[minuteKey].push(exactTime);
        timeRecords[minuteKey].sort(); 
    }
    updateDashboards(); 

    if (isLocked) return; 

    isLocked = true;
    console.log(`⚡ [هجوم] إشارة 200 OK وصلت بتوقيت ${exactTime}! إطلاق الهجوم الموحد...`);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && !client.isDashboard) {
            client.send(JSON.stringify({ action: 'EXECUTE_MASSIVE_SUBMIT' }));
        }
    });

    updateDashboards(); 
    setTimeout(() => { isLocked = false; updateDashboards(); }, LOCK_DURATION);
}

const server = http.createServer((req, res) => {
    // 🔥 إضافة مسار API لاستقبال الإشارة من الباكراوند فوراً بدون انتظار WebSocket
    if (req.method === 'POST' && req.url === '/api/signal') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                triggerMassiveAttack(data.time || "00:00:00.000");
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400); res.end();
            }
        });
        return;
    }

    // واجهة الداشبورد و API كونفيج
    if (req.url === '/api/config') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ maxRequests: currentMaxRequests }));
        return;
    }

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

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === 'SYNC_ME_PLEASE') {
                ws.send(JSON.stringify({ action: 'UPDATE_MAX_REQUESTS', value: currentMaxRequests }));
                return;
            }
            if (data.action === 'REGISTER_DASHBOARD') {
                ws.isDashboard = true; updateDashboards(); return;
            }
            if (data.action === 'SET_MAX_REQUESTS') {
                currentMaxRequests = parseInt(data.value, 10);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && !client.isDashboard) {
                        client.send(JSON.stringify({ action: 'UPDATE_MAX_REQUESTS', value: currentMaxRequests }));
                    }
                });
                updateDashboards();
                return;
            }
            if (data.action === 'SLOT_200_OK_FOUND') {
                triggerMassiveAttack(data.time);
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
