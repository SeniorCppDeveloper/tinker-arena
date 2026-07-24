const express = require('express');
const app = express();
const path = require('path');
const http = require('http');
const server = http.createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// Порт для сервера
const PORT = 3000;

// Отдаём статику (клиентские файлы)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Игровая логика ---
const players = {};
let gameState = {
    players: {},
    projectiles: [],
    aoes: []
};

wss.on('connection', (ws, req) => {
    const playerId = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    
    console.log(`👤 Игрок ${playerId} подключился`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handlePlayerAction(playerId, data, ws);
        } catch (e) {
            console.log('Ошибка парсинга:', e);
        }
    });

    ws.on('close', () => {
        console.log(`👋 Игрок ${playerId} отключился`);
        delete players[playerId];
        broadcast();
    });

    // Отправляем ID игроку
    ws.send(JSON.stringify({ type: 'init', playerId, players: gameState.players }));
});

function handlePlayerAction(playerId, data, ws) {
    if (data.type === 'init') {
        // Новый игрок
        players[playerId] = {
            id: playerId,
            name: data.name || 'Игрок',
            x: 100 + Math.random() * 500,
            y: 100 + Math.random() * 300,
            hp: 100,
            maxHp: 100,
            angle: 0,
            shieldHp: 0
        };
        gameState.players = players;
        broadcast();
    }
    
    if (data.type === 'move') {
        if (players[playerId]) {
            players[playerId].x = data.x;
            players[playerId].y = data.y;
            players[playerId].angle = data.angle || 0;
        }
    }
    
    if (data.type === 'skill') {
        // Обработка скиллов
        const player = players[playerId];
        if (!player) return;
        
        if (data.skill === 'Q') {
            // Лазер - самонаводящийся
            const target = findNearestEnemy(playerId);
            if (target) {
                gameState.projectiles.push({
                    x: player.x,
                    y: player.y,
                    targetX: target.x,
                    targetY: target.y,
                    type: 'laser',
                    owner: playerId,
                    damage: 20,
                    life: 60,
                    speed: 8
                });
            }
        }
        
        if (data.skill === 'W') {
            // Ракеты - 3 штуки
            const target = findNearestEnemy(playerId);
            if (target) {
                for (let i = 0; i < 3; i++) {
                    const angle = (i - 1) * 0.5;
                    gameState.projectiles.push({
                        x: player.x,
                        y: player.y,
                        targetId: target.id,
                        type: 'rocket',
                        owner: playerId,
                        damage: 12,
                        life: 90,
                        speed: 5,
                        homing: true,
                        offset: angle
                    });
                }
            }
        }
        
        if (data.skill === 'E') {
            // Матрица - щит + телепорт
            if (player.shieldHp <= 0) {
                player.shieldHp = 25;
                const angle = player.angle || 0;
                player.x += Math.cos(angle) * 80;
                player.y += Math.sin(angle) * 80;
            }
        }
        
        if (data.skill === 'Z') {
            // Блинк
            const angle = player.angle || 0;
            player.x += Math.cos(angle) * 300;
            player.y += Math.sin(angle) * 300;
            // Ограничения по карте
            player.x = Math.max(20, Math.min(1080, player.x));
            player.y = Math.max(20, Math.min(680, player.y));
        }
        
        if (data.skill === 'X') {
            // Шива
            gameState.aoes.push({
                x: player.x,
                y: player.y,
                radius: 180,
                damage: 15,
                owner: playerId,
                life: 60,
                type: 'shiva'
            });
        }
        
        broadcast();
    }
}

function findNearestEnemy(playerId) {
    let nearest = null;
    let minDist = Infinity;
    
    for (let id in players) {
        if (id === playerId) continue;
        const p = players[id];
        const me = players[playerId];
        if (!me) continue;
        const dist = Math.hypot(p.x - me.x, p.y - me.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = p;
        }
    }
    return nearest;
}

function broadcast() {
    const state = {
        players: players,
        projectiles: gameState.projectiles,
        aoes: gameState.aoes
    };
    
    const data = JSON.stringify({ type: 'state', state });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Обновление игры (серверный тик)
setInterval(() => {
    // Обновляем снаряды
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const pr = gameState.projectiles[i];
        pr.life--;
        
        // Движение к цели
        if (pr.homing && pr.targetId && players[pr.targetId]) {
            const target = players[pr.targetId];
            const dx = target.x - pr.x;
            const dy = target.y - pr.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                pr.x += (dx / dist) * pr.speed;
                pr.y += (dy / dist) * pr.speed;
            }
        } else if (pr.targetX !== undefined) {
            const dx = pr.targetX - pr.x;
            const dy = pr.targetY - pr.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                pr.x += (dx / dist) * pr.speed;
                pr.y += (dy / dist) * pr.speed;
            }
        }
        
        // Проверка попадания
        for (let id in players) {
            if (id === pr.owner) continue;
            const p = players[id];
            if (Math.hypot(pr.x - p.x, pr.y - p.y) < 25) {
                // Наносим урон
                let dmg = pr.damage || 10;
                if (p.shieldHp > 0) {
                    const absorbed = Math.min(p.shieldHp, dmg);
                    p.shieldHp -= absorbed;
                    dmg -= absorbed;
                }
                p.hp = Math.max(0, p.hp - dmg);
                gameState.projectiles.splice(i, 1);
                broadcast();
                break;
            }
        }
        
        if (pr.life <= 0) {
            gameState.projectiles.splice(i, 1);
        }
    }
    
    // Обновляем АОЕ
    for (let i = gameState.aoes.length - 1; i >= 0; i--) {
        const aoe = gameState.aoes[i];
        aoe.life--;
        
        // Урон по игрокам в радиусе
        for (let id in players) {
            if (id === aoe.owner) continue;
            const p = players[id];
            if (Math.hypot(aoe.x - p.x, aoe.y - p.y) < aoe.radius) {
                let dmg = aoe.damage / 60;
                if (p.shieldHp > 0) {
                    const absorbed = Math.min(p.shieldHp, dmg);
                    p.shieldHp -= absorbed;
                    dmg -= absorbed;
                }
                p.hp = Math.max(0, p.hp - dmg);
            }
        }
        
        if (aoe.life <= 0) {
            gameState.aoes.splice(i, 1);
        }
    }
    
    // Проверка смерти и респавн
    for (let id in players) {
        if (players[id].hp <= 0) {
            players[id].hp = players[id].maxHp;
            players[id].x = 50 + Math.random() * 400;
            players[id].y = 50 + Math.random() * 300;
        }
    }
    
    broadcast();
}, 1000 / 60); // 60 FPS

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
