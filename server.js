const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

const PORT = 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

let players = {};
let projectiles = [];
let aoes = [];
let nextId = 1;

function broadcast() {
    const data = JSON.stringify({
        type: 'state',
        players: players,
        projectiles: projectiles,
        aoes: aoes
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function getRandomSpawn() {
    const margin = 80;
    const spots = [
        { x: margin, y: margin },
        { x: 1000 - margin, y: margin },
        { x: margin, y: 650 - margin },
        { x: 1000 - margin, y: 650 - margin },
        { x: 500, y: 100 },
        { x: 500, y: 550 }
    ];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    return {
        x: spot.x + (Math.random() - 0.5) * 60,
        y: spot.y + (Math.random() - 0.5) * 60
    };
}

wss.on('connection', (ws) => {
    const id = nextId++;
    const spawn = getRandomSpawn();
    
    players[id] = {
        id: id,
        name: 'Игрок',
        x: spawn.x,
        y: spawn.y,
        hp: 100,
        maxHp: 100,
        angle: 0,
        shieldHp: 0,
        cooldowns: { q: 0, w: 0, e: 0, r: 0, z: 0, x: 0 }
    };

    ws.send(JSON.stringify({ type: 'init', id: id }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = players[id];
            if (!player) return;

            if (data.type === 'setName') {
                player.name = data.name || 'Игрок';
                broadcast();
            }

            if (data.type === 'move') {
                player.x = data.x;
                player.y = data.y;
                player.angle = data.angle || 0;
                broadcast();
            }

            if (data.type === 'skill') {
                const skill = data.skill;
                if (player.cooldowns[skill] > 0) return;

                const target = Object.values(players).find(p => p.id !== id);
                if (!target) return;

                const cooldowns = {
                    q: 4,
                    w: 8,
                    e: 16,
                    r: 30,
                    z: 14,
                    x: 22
                };
                player.cooldowns[skill] = cooldowns[skill] || 5;

                if (skill === 'q') {
                    const angle = Math.atan2(target.y - player.y, target.x - player.x);
                    projectiles.push({
                        x: player.x + Math.cos(angle) * 30,
                        y: player.y + Math.sin(angle) * 30,
                        vx: Math.cos(angle) * 9,
                        vy: Math.sin(angle) * 9,
                        owner: id,
                        damage: 22,
                        life: 40,
                        radius: 6,
                        type: 'laser'
                    });
                    for (let i = 0; i < 3; i++) {
                        const a = angle + (i - 1) * 0.6;
                        projectiles.push({
                            x: player.x + Math.cos(angle) * 30,
                            y: player.y + Math.sin(angle) * 30,
                            vx: Math.cos(a) * 7,
                            vy: Math.sin(a) * 7,
                            owner: id,
                            damage: 12,
                            life: 25,
                            radius: 4,
                            type: 'chain'
                        });
                    }
                }

                if (skill === 'w') {
                    for (let i = 0; i < 3; i++) {
                        const angle = Math.atan2(target.y - player.y, target.x - player.x) + (i - 1) * 0.3;
                        projectiles.push({
                            x: player.x + Math.cos(angle) * 30,
                            y: player.y + Math.sin(angle) * 30,
                            vx: Math.cos(angle) * 5.5,
                            vy: Math.sin(angle) * 5.5,
                            owner: id,
                            damage: 14,
                            life: 80,
                            radius: 8,
                            type: 'rocket',
                            homing: true,
                            targetId: target.id
                        });
                    }
                }

                if (skill === 'e') {
                    player.shieldHp = 25;
                    const a = player.angle || 0;
                    player.x += Math.cos(a) * 90;
                    player.y += Math.sin(a) * 90;
                    player.x = Math.max(20, Math.min(980, player.x));
                    player.y = Math.max(20, Math.min(630, player.y));
                }

                if (skill === 'r') {
                    for (let key in player.cooldowns) {
                        player.cooldowns[key] = 0;
                    }
                }

                if (skill === 'z') {
                    const a = player.angle || 0;
                    player.x += Math.cos(a) * 320;
                    player.y += Math.sin(a) * 320;
                    player.x = Math.max(20, Math.min(980, player.x));
                    player.y = Math.max(20, Math.min(630, player.y));
                }

                if (skill === 'x') {
                    aoes.push({
                        x: player.x,
                        y: player.y,
                        radius: 170,
                        damage: 12,
                        owner: id,
                        life: 55,
                        type: 'shiva'
                    });
                }

                broadcast();
            }
        } catch (e) {
            console.log('Ошибка обработки:', e);
        }
    });

    ws.on('close', () => {
        delete players[id];
        broadcast();
    });
});

setInterval(() => {
    for (let id in players) {
        const p = players[id];
        for (let key in p.cooldowns) {
            if (p.cooldowns[key] > 0) {
                p.cooldowns[key] -= 1/60;
                if (p.cooldowns[key] < 0) p.cooldowns[key] = 0;
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;
        pr.life--;

        if (pr.homing && pr.targetId && players[pr.targetId]) {
            const t = players[pr.targetId];
            const dx = t.x - pr.x;
            const dy = t.y - pr.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                pr.vx += (dx / dist) * 0.12;
                pr.vy += (dy / dist) * 0.12;
                const spd = Math.hypot(pr.vx, pr.vy);
                if (spd > 7) {
                    pr.vx = (pr.vx / spd) * 7;
                    pr.vy = (pr.vy / spd) * 7;
                }
            }
        }

        let hit = false;
        for (let id in players) {
            if (id == pr.owner) continue;
            const p = players[id];
            if (Math.hypot(pr.x - p.x, pr.y - p.y) < pr.radius + 22) {
                let dmg = pr.damage;
                if (p.shieldHp > 0) {
                    const absorbed = Math.min(p.shieldHp, dmg);
                    p.shieldHp -= absorbed;
                    dmg -= absorbed;
                }
                p.hp = Math.max(0, p.hp - dmg);
                hit = true;
                break;
            }
        }

        if (hit || pr.life <= 0 || pr.x < -50 || pr.x > 1050 || pr.y < -50 || pr.y > 700) {
            projectiles.splice(i, 1);
        }
    }

    for (let i = aoes.length - 1; i >= 0; i--) {
        const aoe = aoes[i];
        aoe.life--;
        if (aoe.life <= 0) {
            aoes.splice(i, 1);
            continue;
        }
        for (let id in players) {
            if (id == aoe.owner) continue;
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
    }

    for (let id in players) {
        if (players[id].hp <= 0) {
            const spawn = getRandomSpawn();
            players[id].hp = players[id].maxHp;
            players[id].x = spawn.x;
            players[id].y = spawn.y;
        }
    }

    broadcast();
}, 1000 / 60);

server.listen(PORT, '0.0.0.0', () => {
    console.log('Сервер запущен на порту ' + PORT);
});
