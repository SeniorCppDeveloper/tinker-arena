const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const W = 1000, H = 650;

const menu = document.getElementById('menu');
const game = document.getElementById('game');
const nickInput = document.getElementById('nickInput');
const playBtn = document.getElementById('playBtn');
const statusDiv = document.getElementById('status');

let ws;
let myId = null;
let players = {};
let projectiles = [];
let aoes = [];
let mouseX = 500, mouseY = 325;
let moveTarget = null;
let myName = '';
let connected = false;
let cooldowns = { q: 0, w: 0, e: 0, r: 0, z: 0, x: 0 };

function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);

    ws.onopen = () => {
        statusDiv.textContent = 'Подключено, ожидаем...';
        connected = true;
    };

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'init') {
            myId = data.id;
            menu.style.display = 'none';
            game.style.display = 'flex';
            statusDiv.textContent = 'Игра началась';
        }
        if (data.type === 'state') {
            players = data.players;
            projectiles = data.projectiles;
            aoes = data.aoes;
            updateUI();
            updateLeaderboard();
        }
    };

    ws.onclose = () => {
        statusDiv.textContent = 'Соединение потеряно';
        connected = false;
    };
}

function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

playBtn.addEventListener('click', () => {
    myName = nickInput.value.trim() || 'Tinker';
    connect();
    setTimeout(() => {
        send({ type: 'setName', name: myName });
    }, 300);
});

nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playBtn.click();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (W / rect.width);
    mouseY = (e.clientY - rect.top) * (H / rect.height);
    mouseX = Math.max(0, Math.min(W, mouseX));
    mouseY = Math.max(0, Math.min(H, mouseY));
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (W / rect.width);
        const y = (e.clientY - rect.top) * (H / rect.height);
        moveTarget = { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
    }
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const skills = { q: 'q', w: 'w', e: 'e', r: 'r', z: 'z', x: 'x' };
    if (skills[key]) {
        e.preventDefault();
        useSkill(key);
    }
});

function useSkill(skill) {
    if (!myId) return;
    if (cooldowns[skill] > 0) return;
    send({ type: 'skill', skill: skill });
}

function getMe() {
    return players[myId] || null;
}

function updateUI() {
    const me = getMe();
    if (me) {
        document.getElementById('myName').textContent = me.name || 'Вы';
        const hpPct = (me.hp / me.maxHp) * 100;
        document.getElementById('myHp').style.width = hpPct + '%';
        document.getElementById('myHpText').textContent = Math.floor(me.hp) + '/' + me.maxHp;
    }

    const enemy = Object.values(players).find(p => p.id !== myId);
    if (enemy) {
        document.getElementById('enemyName').textContent = enemy.name || 'Противник';
        const hpPct = (enemy.hp / enemy.maxHp) * 100;
        document.getElementById('enemyHp').style.width = hpPct + '%';
        document.getElementById('enemyHpText').textContent = Math.floor(enemy.hp) + '/' + enemy.maxHp;
    }

    for (let key in cooldowns) {
        const el = document.getElementById('cd' + key);
        if (cooldowns[key] > 0) {
            el.textContent = Math.ceil(cooldowns[key]);
        } else {
            el.textContent = '✓';
        }
    }
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboardList');
    const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
    list.innerHTML = sorted.map(p => 
        `<div class="lb-item ${p.id === myId ? 'lb-me' : ''}">
            <span>${p.name}</span>
            <span>${p.kills}</span>
        </div>`
    ).join('');
}

let lastSend = 0;

function update() {
    const me = getMe();
    if (!me || !connected) return;

    if (moveTarget) {
        const dx = moveTarget.x - me.x;
        const dy = moveTarget.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
            const speed = 4.2;
            const newX = me.x + (dx / dist) * speed;
            const newY = me.y + (dy / dist) * speed;
            const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
            send({ type: 'move', x: newX, y: newY, angle });
        } else {
            moveTarget = null;
        }
    } else {
        const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
        if (Math.abs(me.angle - angle) > 0.05) {
            send({ type: 'move', x: me.x, y: me.y, angle });
        }
    }

    // Обновляем кулдауны локально (с сервера они приходят в state)
    for (let key in cooldowns) {
        if (cooldowns[key] > 0) {
            cooldowns[key] -= 1/60;
            if (cooldowns[key] < 0) cooldowns[key] = 0;
        }
    }
}

function drawCursor() {
    // Рисуем курсор (мышь)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 8, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(mouseX - 12, mouseY);
    ctx.lineTo(mouseX - 6, mouseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX + 12, mouseY);
    ctx.lineTo(mouseX + 6, mouseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY - 12);
    ctx.lineTo(mouseX, mouseY - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY + 12);
    ctx.lineTo(mouseX, mouseY + 6);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = '#18292e';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, H);
        ctx.stroke();
    }
    for (let i = 0; i < H; i += 60) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(W, i);
        ctx.stroke();
    }

    // aoes
    for (let aoe of aoes) {
        const grad = ctx.createRadialGradient(aoe.x, aoe.y, 10, aoe.x, aoe.y, aoe.radius);
        grad.addColorStop(0, 'rgba(120,220,255,0.25)');
        grad.addColorStop(0.7, 'rgba(60,160,255,0.1)');
        grad.addColorStop(1, 'rgba(0,50,120,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,220,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(180,235,255,0.7)';
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄', aoe.x, aoe.y + 8);
    }

    // projectiles
    for (let pr of projectiles) {
        if (pr.type === 'laser_beam') {
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ffdd44';
            ctx.strokeStyle = 'rgba(255,220,80,0.8)';
            ctx.lineWidth = pr.width || 30;
            ctx.beginPath();
            ctx.moveTo(pr.x, pr.y);
            ctx.lineTo(pr.endX, pr.endY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,200,0.9)';
            ctx.lineWidth = (pr.width || 30) * 0.3;
            ctx.beginPath();
            ctx.moveTo(pr.x, pr.y);
            ctx.lineTo(pr.endX, pr.endY);
            ctx.stroke();
            ctx.shadowBlur = 0;
            continue;
        }
        
        if (pr.type === 'blink_effect') {
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#88ddff';
            ctx.strokeStyle = 'rgba(136,221,255,0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, pr.radius || 40, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(136,221,255,0.1)';
            ctx.fill();
            ctx.shadowBlur = 0;
            continue;
        }

        const isMine = pr.owner === myId;
        ctx.shadowBlur = 18;
        ctx.shadowColor = isMine ? '#d4b84c' : '#e06a4a';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius || 6, 0, Math.PI * 2);
        ctx.fillStyle = isMine ? '#e8c84a' : '#e06a4a';
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // players
    for (let id in players) {
        const p = players[id];
        const isMine = id === myId;
        const x = p.x, y = p.y;
        const angle = p.angle || 0;

        ctx.shadowBlur = 25;
        ctx.shadowColor = isMine ? '#d4b84c' : '#d06a4a';
        const grad = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, 26);
        grad.addColorStop(0, isMine ? '#edd86a' : '#e8845a');
        grad.addColorStop(0.6, isMine ? '#c8a838' : '#c85a3a');
        grad.addColorStop(1, '#18292e');
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isMine ? '#d4b84c' : '#d06a4a';
        ctx.lineWidth = 2;
        ctx.stroke();

        const ex = x + Math.cos(angle) * 11;
        const ey = y + Math.sin(angle) * 11;
        ctx.fillStyle = '#eaf2f5';
        ctx.beginPath();
        ctx.arc(ex - 5, ey - 3, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + 5, ey - 3, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0d1417';
        ctx.beginPath();
        ctx.arc(ex - 5 + Math.cos(angle) * 2.5, ey - 3 + Math.sin(angle) * 2.5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + 5 + Math.cos(angle) * 2.5, ey - 3 + Math.sin(angle) * 2.5, 2, 0, Math.PI * 2);
        ctx.fill();

        if (p.shieldHp > 0) {
            ctx.strokeStyle = 'rgba(120,220,255,0.6)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(120,220,255,0.08)';
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, Math.PI * 2);
            ctx.fill();
        }

        if (p.rearming) {
            ctx.fillStyle = 'rgba(255,200,80,0.3)';
            ctx.beginPath();
            ctx.arc(x, y, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc44';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('REARM', x, y + 4);
        }

        ctx.fillStyle = '#bccfd4';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || (isMine ? 'Вы' : 'Враг'), x, y - 34);

        const hw = 46, hh = 5;
        ctx.fillStyle = '#18292e';
        ctx.fillRect(x - hw/2, y - 26, hw, hh);
        const hpPct = Math.max(0, p.hp / p.maxHp);
        ctx.fillStyle = hpPct > 0.5 ? '#68b868' : '#c86848';
        ctx.fillRect(x - hw/2, y - 26, hw * hpPct, hh);
    }

    drawCursor();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

setInterval(updateUI, 100);
loop();
