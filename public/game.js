// Подключение к серверу
const ws = new WebSocket(`ws://${window.location.host}`);

const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const W = 1000, H = 650;

// Состояние
let myId = null;
let players = {};
let projectiles = [];
let aoes = [];
let myName = '';
let mouseX = 400, mouseY = 350;
let moveTarget = null;
let cds = { Q: 0, W: 0, E: 0, Z: 0, X: 0 };
const COOLDOWNS = { Q: 6, W: 10, E: 18, Z: 14, X: 25 };

// DOM
const menu = document.getElementById('menu');
const gameContainer = document.getElementById('gameContainer');
const nickInput = document.getElementById('nickInput');
const playBtn = document.getElementById('playBtn');
const statusDiv = document.getElementById('status');
const myNameSpan = document.getElementById('myName');
const enemyNameSpan = document.getElementById('enemyName');
const myHpSpan = document.getElementById('myHp');
const enemyHpSpan = document.getElementById('enemyHp');
const cdEls = {
    Q: document.getElementById('cdQ'),
    W: document.getElementById('cdW'),
    E: document.getElementById('cdE'),
    Z: document.getElementById('cdZ'),
    X: document.getElementById('cdX')
};

// WebSocket события
ws.onopen = () => {
    statusDiv.textContent = 'Подключено к серверу!';
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.playerId;
        players = data.players || {};
        statusDiv.textContent = 'Игра началась!';
        menu.style.display = 'none';
        gameContainer.style.display = 'block';
    }
    
    if (data.type === 'state') {
        players = data.state.players || {};
        projectiles = data.state.projectiles || [];
        aoes = data.state.aoes || [];
        updateUI();
    }
};

ws.onclose = () => {
    statusDiv.textContent = 'Соединение потеряно. Перезагрузи страницу.';
};

// Отправка действий
function send(action) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(action));
    }
}

// Управление
playBtn.addEventListener('click', () => {
    myName = nickInput.value.trim() || 'Игрок';
    send({ type: 'init', name: myName });
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (W / rect.width);
    mouseY = (e.clientY - rect.top) * (H / rect.height);
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (W / rect.width);
        const y = (e.clientY - rect.top) * (H / rect.height);
        moveTarget = { x, y };
        send({ type: 'move', x, y, angle: Math.atan2(mouseY - getMyPlayer().y, mouseX - getMyPlayer().x) });
    }
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'q') applySkill('Q');
    if (key === 'w') applySkill('W');
    if (key === 'e') applySkill('E');
    if (key === 'z') applySkill('Z');
    if (key === 'x') applySkill('X');
});

function getMyPlayer() {
    return players[myId] || null;
}

function applySkill(skill) {
    if (cds[skill] > 0) return;
    cds[skill] = COOLDOWNS[skill];
    send({ type: 'skill', skill });
}

// Обновление UI
function updateUI() {
    const me = getMyPlayer();
    if (me) {
        myNameSpan.textContent = me.name || 'Вы';
        myHpSpan.textContent = `${Math.floor(me.hp)}/${me.maxHp}`;
    }
    
    // Находим врага (первого не себя)
    for (let id in players) {
        if (id !== myId) {
            const enemy = players[id];
            enemyNameSpan.textContent = enemy.name || 'Противник';
            enemyHpSpan.textContent = `${Math.floor(enemy.hp)}/${enemy.maxHp}`;
            break;
        }
    }
    
    // Кулдауны
    for (let k in cds) {
        if (cds[k] > 0) {
            cds[k] -= 1/60;
            cdEls[k].textContent = Math.ceil(cds[k]);
        } else {
            cdEls[k].textContent = '✔';
        }
    }
}

// Отрисовка
function draw() {
    ctx.clearRect(0, 0, W, H);
    
    // Сетка
    ctx.strokeStyle = '#1d373e';
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
    
    // АОЕ
    for (let aoe of aoes) {
        const grad = ctx.createRadialGradient(aoe.x, aoe.y, 10, aoe.x, aoe.y, aoe.radius);
        grad.addColorStop(0, 'rgba(100,200,255,0.3)');
        grad.addColorStop(1, 'rgba(0,50,150,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,200,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(200,240,255,0.8)';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄', aoe.x, aoe.y + 10);
    }
    
    // Снаряды
    for (let pr of projectiles) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = pr.owner === myId ? '#ffdd44' : '#ff6644';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = pr.owner === myId ? '#ffcc33' : '#ff5533';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // Игроки
    for (let id in players) {
        drawPlayer(players[id], id === myId);
    }
}

function drawPlayer(player, isLocal) {
    const x = player.x, y = player.y;
    const angle = player.angle || 0;
    
    // Тело
    ctx.shadowBlur = 30;
    ctx.shadowColor = isLocal ? '#ffdd44' : '#ff6644';
    const grad = ctx.createRadialGradient(x - 10, y - 10, 5, x, y, 28);
    grad.addColorStop(0, isLocal ? '#ffe066' : '#ff8866');
    grad.addColorStop(0.5, isLocal ? '#ddaa33' : '#cc5533');
    grad.addColorStop(1, '#1a2a2f');
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isLocal ? '#ffdd44' : '#ff6644';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Глаза
    const ex = x + Math.cos(angle) * 12;
    const ey = y + Math.sin(angle) * 12;
    ctx.fillStyle = '#f0faff';
    ctx.beginPath();
    ctx.arc(ex - 6, ey - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 6, ey - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1215';
    ctx.beginPath();
    ctx.arc(ex - 6 + Math.cos(angle) * 3, ey - 4 + Math.sin(angle) * 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 6 + Math.cos(angle) * 3, ey - 4 + Math.sin(angle) * 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Щит
    if (player.shieldHp > 0) {
        ctx.strokeStyle = 'rgba(100,200,255,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Имя
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#d0e8ed';
    ctx.textAlign = 'center';
    ctx.fillText(player.name || (isLocal ? 'Вы' : 'Враг'), x, y - 38);
    
    // HP
    const hpW = 50, hpH = 5;
    ctx.fillStyle = '#1d2e33';
    ctx.fillRect(x - hpW/2, y - 30, hpW, hpH);
    ctx.fillStyle = player.hp / player.maxHp > 0.5 ? '#6fbf6f' : '#d97a4a';
    ctx.fillRect(x - hpW/2, y - 30, hpW * (player.hp / player.maxHp), hpH);
}

// Цикл игры
function gameLoop() {
    // Отправка позиции при движении
    const me = getMyPlayer();
    if (me && moveTarget) {
        const dx = moveTarget.x - me.x;
        const dy = moveTarget.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
            const speed = 4.5;
            const newX = me.x + (dx / dist) * speed;
            const newY = me.y + (dy / dist) * speed;
            const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
            send({ type: 'move', x: newX, y: newY, angle });
        } else {
            moveTarget = null;
        }
    }
    
    // Обновление угла (поворот к мыши)
    if (me) {
        const angle = Math.atan2(mouseY - me.y, mouseX - me.x);
        // Отправляем угол, если он изменился
        if (Math.abs(me.angle - angle) > 0.1) {
            send({ type: 'move', x: me.x, y: me.y, angle });
        }
    }
    
    draw();
    requestAnimationFrame(gameLoop);
}

// Запуск
gameLoop();
setInterval(updateUI, 100);
