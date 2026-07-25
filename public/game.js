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
let particles = [];
let mouseX = 500, mouseY = 325;
let moveTarget = null;
let myName = '';
let connected = false;
let cooldowns = { q: 0, w: 0, e: 0, r: 0, z: 0, x: 0 };
let clickEffects = [];
let screenShake = 0;
let combo = 0;
let comboTimer = 0;

// Звуки через Web Audio
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playBeep(freq, duration, volume = 0.1, type = 'sine') {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function playBlinkSound() {
    playBeep(800, 0.1, 0.05);
    setTimeout(() => playBeep(1200, 0.08, 0.04), 80);
}

function playLaserSound() {
    playBeep(300, 0.3, 0.08, 'sawtooth');
    setTimeout(() => playBeep(150, 0.2, 0.06), 100);
}

function playRocketSound() {
    playBeep(200, 0.15, 0.06, 'sawtooth');
}

function playHitSound() {
    playBeep(600, 0.1, 0.1);
    setTimeout(() => playBeep(400, 0.1, 0.08), 50);
}

function playKillSound() {
    playBeep(800, 0.1, 0.1);
    setTimeout(() => playBeep(1000, 0.1, 0.1), 100);
    setTimeout(() => playBeep(1200, 0.15, 0.1), 200);
}

function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);

    ws.onopen = () => {
        statusDiv.textContent = 'Подключено, ожидаем...';
        connected = true;
        initAudio();
    };

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'init') {
            myId = data.id;
            menu.style.display = 'none';
            game.style.display = 'flex';
            statusDiv.textContent = 'Игра началась!';
        }
        if (data.type === 'state') {
            players = data.players;
            projectiles = data.projectiles;
            aoes = data.aoes;
            particles = data.particles || [];
            const me = players[myId];
            if (me && me.cooldowns) {
                cooldowns = me.cooldowns;
            }
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
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    const clickX = Math.max(0, Math.min(W, x));
    const clickY = Math.max(0, Math.min(H, y));
    
    if (e.button === 2) {
        moveTarget = { x: clickX, y: clickY };
        // Эффект клика ПКМ
        clickEffects.push({
            x: clickX, y: clickY,
            life: 30,
            maxLife: 30,
            color: 'rgba(100,200,255,0.6)'
        });
        playBeep(500, 0.05, 0.02);
    }
    
    if (e.button === 0) {
        const me = players[myId];
        if (me && cooldowns.z <= 0 && !me.rearming) {
            send({ type: 'blink', x: clickX, y: clickY });
            playBlinkSound();
            screenShake = 5;
            // Эффект клика ЛКМ
            clickEffects.push({
                x: clickX, y: clickY,
                life: 20,
                maxLife: 20,
                color: 'rgba(136,221,255,0.8)'
            });
        }
    }
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === 'z') {
        e.preventDefault();
        const me = players[myId];
        if (me && cooldowns.z <= 0 && !me.rearming) {
            send({ type: 'blink', x: mouseX, y: mouseY });
            playBlinkSound();
            screenShake = 5;
        }
        return;
    }
    
    const skills = { q: 'q', w: 'w', e: 'e', r: 'r', x: 'x' };
    if (skills[key]) {
        e.preventDefault();
        const me = players[myId];
        if (me && cooldowns[key] <= 0 && !me.rearming) {
            send({ type: 'skill', skill: key });
            if (key === 'q') playLaserSound();
            if (key === 'w') playRocketSound();
            if (key === 'e') { playBeep(400, 0.2, 0.05); screenShake = 3; }
            if (key === 'r') { playBeep(600, 0.3, 0.08); screenShake = 4; }
            if (key === 'x') { playBeep(200, 0.3, 0.1, 'sawtooth'); screenShake = 6; }
            clickEffects.push({
                x: mouseX, y: mouseY,
                life: 25,
                maxLife: 25,
                color: key === 'q' ? 'rgba(255,220,80,0.8)' :
                       key === 'w' ? 'rgba(255,150,50,0.8)' :
                       key === 'e' ? 'rgba(80,200,255,0.8)' :
                       key === 'r' ? 'rgba(255,200,80,0.8)' :
                       'rgba(136,221,255,0.8)'
            });
        }
    }
});

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
            el.style.color = '#ff6644';
        } else {
            el.textContent = '✓';
            el.style.color = '#68b868';
        }
    }
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboardList');
    const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
    list.innerHTML = sorted.map(p => 
        `<div class="lb-item ${p.id === myId ? 'lb-me' : ''}">
            <span>${p.name}</span>
            <span>⚔️ ${p.kills}</span>
        </div>`
    ).join('');
}

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

    // Обновление эффектов клика
    for (let i = clickEffects.length - 1; i >= 0; i--) {
        clickEffects[i].life--;
        if (clickEffects[i].life <= 0) {
            clickEffects.splice(i, 1);
        }
    }

    // Обновление тряски
    if (screenShake > 0) {
        screenShake *= 0.9;
        if (screenShake < 0.1) screenShake = 0;
    }
}

function drawCursor() {
    const pulse = 1 + Math.sin(Date.now() / 300) * 0.1;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 8 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(mouseX - 14, mouseY);
    ctx.lineTo(mouseX - 6, mouseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX + 14, mouseY);
    ctx.lineTo(mouseX + 6, mouseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY - 14);
    ctx.lineTo(mouseX, mouseY - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY + 14);
    ctx.lineTo(mouseX, mouseY + 6);
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    // Тряска экрана
    ctx.save();
    if (screenShake > 0.5) {
        const shakeX = (Math.random() - 0.5) * screenShake * 2;
        const shakeY = (Math.random() - 0.5) * screenShake * 2;
        ctx.translate(shakeX, shakeY);
    }

    ctx.clearRect(0, 0, W, H);

    // Grid с анимацией
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

    // Частицы
    for (let p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // АОЕ Шива
    for (let aoe of aoes) {
        const pulse = 1 + Math.sin(Date.now() / 500 + aoe.x) * 0.05;
        const grad = ctx.createRadialGradient(aoe.x, aoe.y, 10, aoe.x, aoe.y, aoe.radius * pulse);
        grad.addColorStop(0, 'rgba(120,220,255,0.3)');
        grad.addColorStop(0.5, 'rgba(60,160,255,0.15)');
        grad.addColorStop(1, 'rgba(0,50,120,0)');
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#88ddff';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(aoe.x, aoe.y, aoe.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(120,220,255,${0.2 + Math.sin(Date.now() / 300) * 0.1})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(180,235,255,0.8)';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄', aoe.x, aoe.y + 10);
    }

    // Снаряды
    for (let pr of projectiles) {
        if (pr.type === 'laser_beam') {
            const grad = ctx.createLinearGradient(pr.x, pr.y, pr.endX, pr.endY);
            grad.addColorStop(0, 'rgba(255,220,80,0.9)');
            grad.addColorStop(0.5, 'rgba(255,255,200,0.9)');
            grad.addColorStop(1, 'rgba(255,220,80,0.9)');
            ctx.shadowBlur = 50;
            ctx.shadowColor = '#ffdd44';
            ctx.strokeStyle = grad;
            ctx.lineWidth = pr.width || 40;
            ctx.beginPath();
            ctx.moveTo(pr.x, pr.y);
            ctx.lineTo(pr.endX, pr.endY);
            ctx.stroke();
            ctx.shadowBlur = 30;
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = (pr.width || 40) * 0.2;
            ctx.beginPath();
            ctx.moveTo(pr.x, pr.y);
            ctx.lineTo(pr.endX, pr.endY);
            ctx.stroke();
            ctx.shadowBlur = 0;
            continue;
        }
        
        const isMine = pr.owner === myId;
        const size = pr.radius || 6;
        const glowSize = isMine ? '#ffcc33' : '#ff5533';
        ctx.shadowBlur = 25;
        ctx.shadowColor = glowSize;
        
        // Ракеты с хвостом
        if (pr.type === 'rocket') {
            for (let i = 0; i < 3; i++) {
                const trailX = pr.x - pr.vx * (i + 1) * 3;
                const trailY = pr.y - pr.vy * (i + 1) * 3;
                ctx.globalAlpha = 0.3 - i * 0.08;
                ctx.fillStyle = isMine ? '#ffcc33' : '#ff5533';
                ctx.beginPath();
                ctx.arc(trailX, trailY, size * (1 - i * 0.2), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        
        ctx.fillStyle = isMine ? '#ffdd44' : '#ff6644';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        if (pr.type === 'rocket') {
            ctx.fillStyle = isMine ? '#ffee88' : '#ffaa77';
            ctx.beginPath();
            ctx.arc(pr.x - 2, pr.y - 2, size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Игроки
    for (let id in players) {
        const p = players[id];
        const isMine = id === myId;
        const x = p.x, y = p.y;
        const angle = p.angle || 0;
        const floatY = isMine ? Math.sin(Date.now() / 1000 + x) * 1 : 0;

        ctx.shadowBlur = 30;
        ctx.shadowColor = isMine ? '#d4b84c' : '#d06a4a';
        const grad = ctx.createRadialGradient(x - 8, y - 8 + floatY, 4, x, y + floatY, 26);
        grad.addColorStop(0, isMine ? '#edd86a' : '#e8845a');
        grad.addColorStop(0.6, isMine ? '#c8a838' : '#c85a3a');
        grad.addColorStop(1, '#18292e');
        ctx.beginPath();
        ctx.arc(x, y + floatY, 22, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isMine ? '#d4b84c' : '#d06a4a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Глаза
        const ex = x + Math.cos(angle) * 11;
        const ey = y + Math.sin(angle) * 11 + floatY;
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

        // Щит
        if (p.shieldHp > 0) {
            const pulse = 1 + Math.sin(Date.now() / 200) * 0.05;
            ctx.strokeStyle = `rgba(120,220,255,${0.4 + Math.sin(Date.now() / 300) * 0.2})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(x, y + floatY, 30 * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(120,220,255,0.06)';
            ctx.beginPath();
            ctx.arc(x, y + floatY, 30 * pulse, 0, Math.PI * 2);
            ctx.fill();
        }

        // Реарм
        if (p.rearming) {
            const progress = 1 - p.rearmTime / 60;
            ctx.strokeStyle = '#ffcc44';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y + floatY, 28, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,200,80,0.2)';
            ctx.beginPath();
            ctx.arc(x, y + floatY, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc44';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('REARM', x, y + floatY + 4);
        }

        // Имя
        ctx.fillStyle = '#bccfd4';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || (isMine ? 'Вы' : 'Враг'), x, y - 34 + floatY);

        // HP
        const hw = 46, hh = 5;
        ctx.fillStyle = '#18292e';
        ctx.fillRect(x - hw/2, y - 26 + floatY, hw, hh);
        const hpPct = Math.max(0, p.hp / p.maxHp);
        ctx.fillStyle = hpPct > 0.5 ? '#68b868' : '#c86848';
        ctx.fillRect(x - hw/2, y - 26 + floatY, hw * hpPct, hh);
    }

    // Эффекты кликов
    for (let ce of clickEffects) {
        const alpha = ce.life / ce.maxLife;
        ctx.strokeStyle = ce.color.replace('0.6', alpha).replace('0.8', alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ce.x, ce.y, 15 * (1 - alpha) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ce.color.replace('0.6', alpha * 0.2).replace('0.8', alpha * 0.2);
        ctx.beginPath();
        ctx.arc(ce.x, ce.y, 10 * (1 - alpha) + 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCursor();
    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

setInterval(updateUI, 100);
loop();
