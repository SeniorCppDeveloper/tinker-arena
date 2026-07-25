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
let particles = [];
let nextId = 1;

function broadcast() {
    const data = JSON.stringify({
        type: 'state',
        players: players,
        projectiles: projectiles,
        aoes: aoes,
        particles: particles
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function getRandomSpawn() {
    const spots = [
        { x: 150, y: 150 },
        { x: 850, y: 150 },
        { x: 150, y: 500 },
        { x: 850, y: 500 },
        { x: 500, y: 100 },
        { x: 500, y: 550 }
    ];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    return {
        x: spot.x + (Math.random() - 0.5) * 40,
        y: spot.y + (Math.random() - 0.5) * 40
    };
}

function getAlivePlayers() {
    return Object.values(players).filter(p => p.hp > 0);
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
        kills: 0,
        rearming: false,
        rearmTime: 0,
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
                if (player.rearming) return;
                player.x = data.x;
                player.y = data.y;
                player.angle = data.angle || 0;
                broadcast();
            }

            if (data.type === 'blink') {
                if (player.rearming) return;
                if (player.cooldowns.z > 0) return;
                player.cooldowns.z = 14;
                
                const targetX = Math.max(20, Math.min(980, data.x));
                const targetY = Math.max(20, Math.min(630, data.y));
                const dx = targetX - player.x;
                const dy = targetY - player.y;
                const dist = Math.hypot(dx, dy);
                
                const maxBlink = 1200;
                let newX, newY;
                if (dist <= maxBlink) {
                    newX = targetX;
                    newY = targetY;
                } else {
                    newX = player.x + (dx / dist) * maxBlink;
                    newY = player.y + (dy / dist) * maxBlink;
                }
                
                newX = Math.max(20, Math.min(980, newX));
                newY = Math.max(20, Math.min(630, newY));
                
                // Эффект блинка (начало)
                for (let i = 0; i < 20; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 4;
                    particles.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 20 + Math.random() * 20,
                        maxLife: 40,
                        color: '#88ddff',
                        size: 3 + Math.random() * 5
                    });
                }
                
                player.x = newX;
                player.y = newY;
                
                // Эффект блинка (конец)
                for (let i = 0; i < 25; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 6;
                    particles.push({
                        x: player.x,
                        y: player.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 20 + Math.random() * 25,
                        maxLife: 45,
                        color: '#88ddff',
                        size: 3 + Math.random() * 6
                    });
                }
                
                // След блинка
                for (let i = 0; i < 15; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    particles.push({
                        x: player.x + Math.cos(angle) * 30,
                        y: player.y + Math.sin(angle) * 30,
                        vx: Math.cos(angle) * 1,
                        vy: Math.sin(angle) * 1,
                        life: 15 + Math.random() * 15,
                        maxLife: 30,
                        color: '#aaddff',
                        size: 2 + Math.random() * 4
                    });
                }
                
                broadcast();
            }

            if (data.type === 'skill') {
                const skill = data.skill;
                if (player.rearming) return;
                if (player.cooldowns[skill] > 0) return;

                const targets = getAlivePlayers().filter(p => p.id !== id);
                if (targets.length === 0) return;

                const cooldowns = {
                    q: 5,
                    w: 9,
                    e: 16,
                    r: 35,
                    z: 14,
                    x: 24
                };
                player.cooldowns[skill] = cooldowns[skill] || 5;

                if (skill === 'q') {
                    const angle = player.angle || 0;
                    const len = 2000;
                    const width = 40;
                    
                    for (let t of targets) {
                        const dx = t.x - player.x;
                        const dy = t.y - player.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist > len) continue;
                        const proj = (dx * Math.cos(angle) + dy * Math.sin(angle)) / dist;
                        const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) / dist;
                        if (perp < width / dist) {
                            let dmg = 22;
                            if (t.shieldHp > 0) {
                                const absorbed = Math.min(t.shieldHp, dmg);
                                t.shieldHp -= absorbed;
                                dmg -= absorbed;
                            }
                            t.hp = Math.max(0, t.hp - dmg);
                            if (t.hp <= 0) {
                                player.kills++;
                                const spawn = getRandomSpawn();
                                t.hp = t.maxHp;
                                t.x = spawn.x;
                                t.y = spawn.y;
                                t.shieldHp = 0;
                            }
                        }
                    }
                    
                    projectiles.push({
                        x: player.x,
                        y: player.y,
                        endX: player.x + Math.cos(angle) * len,
                        endY: player.y + Math.sin(angle) * len,
                        owner: id,
                        life: 8,
                        type: 'laser_beam',
                        width: width
                    });
                }

                if (skill === 'w') {
                    const alive = getAlivePlayers().filter(p => p.id !== id);
                    const rocketCount = 3;
                    let targetsForRockets = [];
                    
                    if (alive.length === 1) {
                        for (let i = 0; i < rocketCount; i++) {
                            targetsForRockets.push(alive[0]);
                        }
                    } else if (alive.length === 2) {
                        targetsForRockets.push(alive[0], alive[1], alive[0]);
                    } else {
                        const shuffled = [...alive].sort(() => Math.random() - 0.5);
                        for (let i = 0; i < rocketCount; i++) {
                            targetsForRockets.push(shuffled[i % shuffled.length]);
                        }
                    }

                    for (let i = 0; i < targetsForRockets.length; i++) {
                        const target = targetsForRockets[i];
                        const angle = Math.atan2(target.y - player.y, target.x - player.x);
                        const offset = (i - 1) * 0.2;
                        projectiles.push({
                            x: player.x + Math.cos(angle + offset) * 30,
                            y: player.y + Math.sin(angle + offset) * 30,
                            vx: Math.cos(angle + offset) * 6,
                            vy: Math.sin(angle + offset) * 6,
                            owner: id,
                            damage: 16,
                            life: 200,
                            radius: 8,
                            type: 'rocket',
                            homing: true,
                            targetId: target.id,
                            speed: 7,
                            homingStrength: 0.25
                        });
                    }
                }

                if (skill === 'e') {
                    player.shieldHp = 25;
                    const a = player.angle || 0;
                    player.x += Math.cos(a) * 80;
                    player.y += Math.sin(a) * 80;
                    player.x = Math.max(20, Math.min(980, player.x));
                    player.y = Math.max(20, Math.min(630, player.y));
                    
                    for (let i = 0; i < 30; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 1 + Math.random() * 3;
                        particles.push({
                            x: player.x,
                            y: player.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 15 + Math.random() * 20,
                            maxLife: 35,
                            color: '#66ddff',
                            size: 2 + Math.random() * 4
                        });
                    }
                }

                if (skill === 'r') {
                    player.rearming = true;
                    player.rearmTime = 60;
                    
                    for (let i = 0; i < 40; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 1 + Math.random() * 5;
                        particles.push({
                            x: player.x + (Math.random() - 0.5) * 40,
                            y: player.y + (Math.random() - 0.5) * 40,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 20 + Math.random() * 30,
                            maxLife: 50,
                            color: '#ffcc44',
                            size: 2 + Math.random() * 5
                        });
                    }
                }

                if (skill === 'x') {
                    aoes.push({
                        x: player.x,
                        y: player.y,
                        radius: 180,
                        damage: 14,
                        owner: id,
                        life: 50,
                        type: 'shiva'
                    });
                    
                    for (let i = 0; i < 50; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * 180;
                        particles.push({
                            x: player.x + Math.cos(angle) * dist,
                            y: player.y + Math.sin(angle) * dist,
                            vx: Math.cos(angle) * (2 + Math.random() * 3),
                            vy: Math.sin(angle) * (2 + Math.random() * 3),
                            life: 20 + Math.random() * 30,
                            maxLife: 50,
                            color: '#88ddff',
                            size: 3 + Math.random() * 6
                        });
                    }
                }

                broadcast();
            }
        } catch (e) {
            console.log('Ошибка:', e);
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
        
        if (p.rearming) {
            p.rearmTime--;
            if (p.rearmTime <= 0) {
                p.rearming = false;
                for (let key in p.cooldowns) {
                    p.cooldowns[key] = 0;
                }
            }
        }
        
        for (let key in p.cooldowns) {
            if (p.cooldowns[key] > 0) {
                p.cooldowns[key] -= 1/60;
                if (p.cooldowns[key] < 0) p.cooldowns[key] = 0;
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        
        if (pr.type === 'laser_beam') {
            pr.life--;
            if (pr.life <= 0) {
                projectiles.splice(i, 1);
            }
            continue;
        }

        pr.x += pr.vx;
        pr.y += pr.vy;
        pr.life--;

        if (pr.homing && pr.targetId && players[pr.targetId]) {
            const t = players[pr.targetId];
            const dx = t.x - pr.x;
            const dy = t.y - pr.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                const strength = pr.homingStrength || 0.25;
                pr.vx += (dx / dist) * strength;
                pr.vy += (dy / dist) * strength;
                const spd = Math.hypot(pr.vx, pr.vy);
                const maxSpeed = pr.speed || 7;
                if (spd > maxSpeed) {
                    pr.vx = (pr.vx / spd) * maxSpeed;
                    pr.vy = (pr.vy / spd) * maxSpeed;
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
                if (p.hp <= 0 && players[pr.owner]) {
                    players[pr.owner].kills++;
                    const spawn = getRandomSpawn();
                    p.hp = p.maxHp;
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.shieldHp = 0;
                    
                    // Эффект смерти
                    for (let j = 0; j < 40; j++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 2 + Math.random() * 6;
                        particles.push({
                            x: p.x,
                            y: p.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 20 + Math.random() * 30,
                            maxLife: 50,
                            color: '#ff4444',
                            size: 3 + Math.random() * 8
                        });
                    }
                }
                hit = true;
                break;
            }
        }

        if (hit || pr.life <= 0 || pr.x < -100 || pr.x > 1100 || pr.y < -100 || pr.y > 750) {
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
                if (p.hp <= 0 && players[aoe.owner]) {
                    players[aoe.owner].kills++;
                    const spawn = getRandomSpawn();
                    p.hp = p.maxHp;
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.shieldHp = 0;
                }
            }
        }
    }

    // Обновление частиц
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life--;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    broadcast();
}, 1000 / 60);

server.listen(PORT, '0.0.0.0', () => {
    console.log('🔥 Сервер запущен на порту ' + PORT);
});
