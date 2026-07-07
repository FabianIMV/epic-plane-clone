/* ============================================================
   Epic Plane Evolution — Clon libre en HTML5 Canvas
   Mecánica: catapulta → vuelo/planeo → monedas → mejoras → evolución
   Todo el código y los gráficos son originales.
   ============================================================ */
'use strict';

/* ---------------- Ajustes en vivo (panel ⚙️) ---------------- */
const TUNING_DEFS = [
  { key: 'gameSpeed',   name: 'Velocidad del juego', min: 0.25, max: 4,   step: 0.05, def: 1 },
  { key: 'gravity',     name: 'Gravedad',            min: 2,    max: 60,  step: 1,    def: 22 },
  { key: 'launchMult',  name: 'Potencia de catapulta', min: 0.5, max: 5,  step: 0.1,  def: 1 },
  { key: 'thrustMult',  name: 'Potencia del motor',  min: 0.5,  max: 5,   step: 0.1,  def: 1 },
  { key: 'fuelMult',    name: 'Combustible',         min: 0.5,  max: 5,   step: 0.1,  def: 1 },
  { key: 'liftMult',    name: 'Sustentación (planeo)', min: 0.2, max: 3,  step: 0.05, def: 1 },
  { key: 'coinMult',    name: 'Valor de monedas',    min: 1,    max: 10,  step: 0.5,  def: 1 },
];
const TUNING = {};
const TUNING_LS_KEY = 'epe-clone-tuning';
let infiniteFuel = false;

function loadTuning() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(TUNING_LS_KEY)) || {}; } catch (e) {}
  for (const d of TUNING_DEFS) {
    TUNING[d.key] = typeof saved[d.key] === 'number' ? saved[d.key] : d.def;
  }
}
function saveTuning() {
  localStorage.setItem(TUNING_LS_KEY, JSON.stringify(TUNING));
}
function resetTuning() {
  for (const d of TUNING_DEFS) TUNING[d.key] = d.def;
  saveTuning();
  buildTuningPanel();
}

/* ---------------- Progreso guardado ---------------- */
const SAVE_LS_KEY = 'epe-clone-save';
const save = {
  coins: 0,
  best: 0,
  upgrades: { launch: 0, engine: 0, fuel: 0, wings: 0 },
};
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_LS_KEY));
    if (s) {
      save.coins = s.coins || 0;
      save.best = s.best || 0;
      Object.assign(save.upgrades, s.upgrades || {});
    }
  } catch (e) {}
}
function persistSave() {
  localStorage.setItem(SAVE_LS_KEY, JSON.stringify(save));
}

/* ---------------- Mejoras y evolución ---------------- */
const MAX_LEVEL = 10;
const UPGRADE_DEFS = [
  { key: 'launch', icon: '🎯', name: 'Catapulta',  desc: 'Más potencia de lanzamiento', baseCost: 30 },
  { key: 'engine', icon: '🔥', name: 'Motor',      desc: 'Más empuje en el aire',       baseCost: 40 },
  { key: 'fuel',   icon: '⛽', name: 'Tanque',     desc: 'Más combustible',             baseCost: 35 },
  { key: 'wings',  icon: '🪽', name: 'Alas',       desc: 'Mejor planeo, menos caída',   baseCost: 45 },
];
function upgradeCost(def, level) {
  return Math.round(def.baseCost * Math.pow(1.55, level));
}
function totalUpgradeLevels() {
  return Object.values(save.upgrades).reduce((a, b) => a + b, 0);
}
const EVOLUTIONS = [
  { name: 'Avión de papel', body: '#e8e8e8', wing: '#c9c9c9', trail: 'rgba(255,255,255,.5)' },
  { name: 'Planeador',      body: '#8ecae6', wing: '#219ebc', trail: 'rgba(142,202,230,.55)' },
  { name: 'Avioneta',       body: '#ffb703', wing: '#fb8500', trail: 'rgba(255,183,3,.55)' },
  { name: 'Jet',            body: '#adb5bd', wing: '#6c757d', trail: 'rgba(173,181,189,.6)' },
  { name: 'Cohete',         body: '#ef476f', wing: '#b5179e', trail: 'rgba(239,71,111,.65)' },
];
function evolutionStage() {
  return Math.min(EVOLUTIONS.length - 1, Math.floor(totalUpgradeLevels() / 8));
}

/* Valores derivados de las mejoras */
function stats() {
  const u = save.upgrades;
  return {
    launchPower: (42 + u.launch * 11) * TUNING.launchMult,
    thrust:      (26 + u.engine * 7)  * TUNING.thrustMult,
    fuelMax:     (2.2 + u.fuel * 0.9) * TUNING.fuelMult,
    lift:        (0.55 + u.wings * 0.09) * TUNING.liftMult,
    drag:        Math.max(0.02, 0.10 - u.wings * 0.006),
  };
}

/* ---------------- Canvas y estado global ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const PX_PER_M = 7;            // escala mundo→pantalla
const GROUND_Y_FRAC = 0.82;    // posición del suelo en pantalla

/* Estados: 'hangar' | 'aim' | 'flying' | 'results' */
let state = 'hangar';

const plane = {
  x: 0, y: 3, vx: 0, vy: 0, angle: 0,
  fuel: 0, boosting: false,
  maxAlt: 0, coinsRun: 0, dead: false, groundTime: 0,
};
let camX = 0, camY = 0;

/* Catapulta (arrastre) */
const aim = { dragging: false, dx: 0, dy: 0, power: 0, angle: Math.PI / 4 };

/* Objetos del mundo */
let pickups = [];      // {x, y, type: 'coin'|'fuel'|'ring', taken}
let spawnedUntil = 0;  // hasta qué distancia (m) ya generamos pickups
let particles = [];
let trail = [];
let clouds = [];
let hills = [];

function seedScenery() {
  clouds = [];
  for (let i = 0; i < 40; i++) {
    clouds.push({
      x: Math.random() * 4000 - 200,
      y: 15 + Math.random() * 120,
      s: 0.6 + Math.random() * 1.6,
      layer: Math.random() < 0.5 ? 0.35 : 0.6,
    });
  }
  hills = [];
  for (let i = 0; i < 60; i++) {
    hills.push({ x: i * 90 + Math.random() * 40, h: 12 + Math.random() * 26, w: 70 + Math.random() * 80 });
  }
}
seedScenery();

/* ---------------- Generación de pickups ---------------- */
function spawnPickupsUpTo(dist) {
  while (spawnedUntil < dist + 400) {
    spawnedUntil += 45 + Math.random() * 80;
    const baseY = 8 + Math.random() * 110;
    const r = Math.random();
    if (r < 0.62) {
      // línea o arco de monedas
      const n = 4 + Math.floor(Math.random() * 5);
      const arc = Math.random() < 0.5;
      for (let i = 0; i < n; i++) {
        pickups.push({
          type: 'coin',
          x: spawnedUntil + i * 4,
          y: baseY + (arc ? Math.sin((i / (n - 1)) * Math.PI) * 8 : 0),
          taken: false,
        });
      }
      spawnedUntil += n * 4;
    } else if (r < 0.82) {
      pickups.push({ type: 'fuel', x: spawnedUntil, y: baseY, taken: false });
    } else {
      pickups.push({ type: 'ring', x: spawnedUntil, y: baseY, taken: false });
    }
  }
  // limpieza de los que quedaron atrás
  if (pickups.length > 400) {
    pickups = pickups.filter(p => !p.taken && p.x > plane.x - 100);
  }
}

/* ---------------- Ciclo de vuelo ---------------- */
function startAim() {
  const s = stats();
  state = 'aim';
  plane.x = 0; plane.y = 3.2; plane.vx = 0; plane.vy = 0;
  plane.angle = -Math.PI / 5;
  plane.fuel = s.fuelMax;
  plane.maxAlt = 0; plane.coinsRun = 0; plane.dead = false; plane.groundTime = 0;
  plane.boosting = false;
  camX = -W * 0.35 / PX_PER_M; camY = 0;
  pickups = []; spawnedUntil = 30;
  particles = []; trail = [];
  aim.dragging = false; aim.power = 0; aim.angle = Math.PI / 4;
  show('hud'); hide('hangar'); hide('results');
}

function launch() {
  const s = stats();
  const p = Math.max(0.25, aim.power);
  state = 'flying';
  plane.vx = Math.cos(aim.angle) * s.launchPower * p;
  plane.vy = Math.sin(aim.angle) * s.launchPower * p;
  spawnBurst(plane.x, plane.y, 18, '#ffd166');
}

function endRun() {
  state = 'results';
  const dist = Math.max(0, Math.round(plane.x));
  const bonus = Math.round(dist / 8 * TUNING.coinMult);
  const total = plane.coinsRun + bonus;
  save.coins += total;
  const isRecord = dist > save.best;
  if (isRecord) save.best = dist;
  persistSave();

  txt('res-dist', dist);
  txt('res-alt', Math.round(plane.maxAlt));
  txt('res-coins', plane.coinsRun);
  txt('res-bonus', bonus);
  txt('res-total', total);
  document.getElementById('res-record').classList.toggle('hidden', !isRecord);
  hide('hud'); show('results');
}

/* ---------------- Física ---------------- */
function updateFlight(dt) {
  const s = stats();
  const g = TUNING.gravity;

  // Empuje del motor (mantener presionado)
  if (plane.boosting && (plane.fuel > 0 || infiniteFuel)) {
    plane.angle = Math.max(plane.angle - 2.2 * dt, -Math.PI * 0.30); // pitch up (y invertida)
    plane.vx += Math.cos(plane.angle) * s.thrust * dt;
    plane.vy += -Math.sin(plane.angle) * s.thrust * dt;
    if (!infiniteFuel) plane.fuel = Math.max(0, plane.fuel - dt);
    if (Math.random() < 0.6) spawnFlame();
  } else {
    // sin motor: la nariz sigue a la velocidad
    const target = -Math.atan2(plane.vy, Math.max(plane.vx, 1));
    plane.angle += (target - plane.angle) * Math.min(1, 3 * dt);
  }

  // Gravedad
  plane.vy -= g * dt;

  // Sustentación: el avance reduce la caída
  if (plane.vy < 0 && plane.vx > 4) {
    plane.vy += Math.min(-plane.vy, plane.vx * s.lift) * dt * 2.2;
  }

  // Resistencia del aire
  const drag = 1 - Math.min(0.9, s.drag * dt);
  plane.vx *= drag;
  plane.vy *= drag;

  plane.x += plane.vx * dt;
  plane.y += plane.vy * dt;
  plane.maxAlt = Math.max(plane.maxAlt, plane.y);

  // Contacto con el suelo
  if (plane.y <= 0.6) {
    plane.y = 0.6;
    if (plane.vy < -6) {
      // rebote
      plane.vy = -plane.vy * 0.35;
      plane.vx *= 0.75;
      spawnBurst(plane.x, 0.8, 10, '#c2b280');
    } else {
      // deslizamiento con fricción
      plane.vy = 0;
      plane.vx *= 1 - Math.min(0.95, 1.6 * dt);
      spawnDust();
      if (plane.vx < 1.5) {
        plane.groundTime += dt;
        if (plane.groundTime > 0.4) { endRun(); return; }
      }
    }
  }

  // Pickups
  spawnPickupsUpTo(plane.x);
  for (const p of pickups) {
    if (p.taken || Math.abs(p.x - plane.x) > 4) continue;
    const dy = Math.abs(p.y - plane.y);
    const rad = p.type === 'ring' ? 6 : 3;
    if (dy < rad && Math.abs(p.x - plane.x) < rad) {
      p.taken = true;
      if (p.type === 'coin') {
        plane.coinsRun += Math.round(1 * TUNING.coinMult);
        spawnBurst(p.x, p.y, 6, '#ffd166');
      } else if (p.type === 'fuel') {
        plane.fuel = Math.min(stats().fuelMax, plane.fuel + stats().fuelMax * 0.3);
        spawnBurst(p.x, p.y, 8, '#ff8800');
      } else if (p.type === 'ring') {
        const sp = Math.hypot(plane.vx, plane.vy) || 1;
        plane.vx += (plane.vx / sp) * 18;
        plane.vy += (plane.vy / sp) * 18 + 6;
        spawnBurst(p.x, p.y, 14, '#7fd8ff');
      }
    }
  }

  // Estela
  trail.push({ x: plane.x, y: plane.y, t: 0.7 });
  if (trail.length > 90) trail.shift();

  // Cámara
  const lookAhead = Math.min(plane.vx * 0.4, W * 0.25 / PX_PER_M);
  camX += (plane.x + lookAhead - W * 0.38 / PX_PER_M - camX) * Math.min(1, 5 * dt);
  const targetCamY = Math.max(0, plane.y - H * (GROUND_Y_FRAC - 0.4) / PX_PER_M);
  camY += (targetCamY - camY) * Math.min(1, 4 * dt);
}

/* ---------------- Partículas ---------------- */
function spawnBurst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 14;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5 + Math.random() * 0.3, color });
  }
}
function spawnFlame() {
  const back = plane.angle + Math.PI;
  particles.push({
    x: plane.x + Math.cos(back) * 1.4,
    y: plane.y + -Math.sin(back) * 1.4,
    vx: plane.vx * 0.2 + (Math.random() - 0.5) * 4,
    vy: plane.vy * 0.2 + (Math.random() - 0.5) * 4,
    t: 0.25 + Math.random() * 0.15,
    color: Math.random() < 0.5 ? '#ff8800' : '#ffcc00',
  });
}
function spawnDust() {
  if (Math.random() < 0.5) {
    particles.push({
      x: plane.x - 1, y: 0.4,
      vx: -plane.vx * 0.15 - Math.random() * 3, vy: 2 + Math.random() * 4,
      t: 0.4, color: '#c2b280',
    });
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 9 * dt; p.t -= dt;
  }
  particles = particles.filter(p => p.t > 0 && p.y > -2);
  for (const t of trail) t.t -= dt * 0.6;
}

/* ---------------- Coordenadas mundo→pantalla ---------------- */
function sx(wx) { return (wx - camX) * PX_PER_M; }
function sy(wy) { return H * GROUND_Y_FRAC - (wy - camY) * PX_PER_M; }

/* ---------------- Render ---------------- */
function draw() {
  // Cielo con degradado según altura
  const altFrac = Math.min(1, camY / 260);
  const skyTop = lerpColor([135, 206, 235], [8, 12, 60], altFrac);
  const skyBot = lerpColor([224, 244, 255], [60, 80, 160], altFrac);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${skyTop.join(',')})`);
  grad.addColorStop(1, `rgb(${skyBot.join(',')})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Sol
  ctx.fillStyle = 'rgba(255, 240, 180, .9)';
  ctx.beginPath(); ctx.arc(W * 0.8, H * 0.16, 34, 0, Math.PI * 2); ctx.fill();

  drawClouds();
  drawHills();
  drawGround();
  drawMarkers();
  drawPickups();
  drawTrail();
  drawParticles();
  drawPlane();
  if (state === 'aim') drawAim();
}

function lerpColor(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const c of clouds) {
    // parallax + repetición del patrón de nubes
    let px = (c.x - camX * c.layer) % 4000;
    if (px < -300) px += 4000;
    const x = px * PX_PER_M / 7, y = sy(c.y) * 0.9;
    if (x < -200 || x > W + 200) continue;
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * c.s, y - 8 * c.s, 22 * c.s, 11 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 24 * c.s, y - 5 * c.s, 20 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHills() {
  ctx.fillStyle = '#5a8f5a';
  const gy = sy(0);
  for (const h of hills) {
    let px = (h.x - camX * 0.75) % 5400;
    if (px < -300) px += 5400;
    const x = px * PX_PER_M / 7;
    if (x < -300 || x > W + 300) continue;
    ctx.beginPath();
    ctx.ellipse(x, gy + camY * PX_PER_M * 0.75, h.w, h.h * 2.4, 0, Math.PI, 0);
    ctx.fill();
  }
}

function drawGround() {
  const gy = sy(0);
  if (gy > H + 50) return;
  ctx.fillStyle = '#6ab04c';
  ctx.fillRect(0, gy, W, Math.max(0, H - gy));
  ctx.fillStyle = '#218c5b';
  ctx.fillRect(0, gy, W, 6);
}

function drawMarkers() {
  // marcadores de distancia cada 100 m
  const gy = sy(0);
  if (gy > H + 50) return;
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const start = Math.floor(camX / 100) * 100;
  for (let m = start; m < camX + W / PX_PER_M + 100; m += 100) {
    if (m <= 0) continue;
    const x = sx(m);
    ctx.fillRect(x - 1.5, gy - 26, 3, 26);
    ctx.fillText(m + ' m', x, gy - 32);
  }
}

function drawPickups() {
  for (const p of pickups) {
    if (p.taken) continue;
    const x = sx(p.x), y = sy(p.y);
    if (x < -60 || x > W + 60) continue;
    if (p.type === 'coin') {
      ctx.fillStyle = '#ffd166';
      ctx.strokeStyle = '#e09f3e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e09f3e';
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', x, y + 1);
      ctx.textBaseline = 'alphabetic';
    } else if (p.type === 'fuel') {
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(x - 8, y - 10, 16, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⛽', x, y + 4);
    } else {
      ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, 6 * PX_PER_M * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(127,216,255,.4)'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(x, y, 6 * PX_PER_M * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function drawTrail() {
  const evo = EVOLUTIONS[evolutionStage()];
  ctx.strokeStyle = evo.trail;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let started = false;
  for (const t of trail) {
    if (t.t <= 0) continue;
    const x = sx(t.x), y = sy(t.y);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.t * 2));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlane() {
  const evo = EVOLUTIONS[evolutionStage()];
  const x = sx(plane.x), y = sy(plane.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(plane.angle);
  const S = 2.6; // escala del sprite
  // fuselaje
  ctx.fillStyle = evo.body;
  ctx.beginPath();
  ctx.moveTo(9 * S, 0);
  ctx.lineTo(-6 * S, -2.6 * S);
  ctx.lineTo(-4 * S, 0);
  ctx.lineTo(-6 * S, 2.6 * S);
  ctx.closePath();
  ctx.fill();
  // ala
  ctx.fillStyle = evo.wing;
  ctx.beginPath();
  ctx.moveTo(2 * S, -0.5 * S);
  ctx.lineTo(-3 * S, -5 * S);
  ctx.lineTo(-1 * S, 0);
  ctx.closePath();
  ctx.fill();
  // cola
  ctx.beginPath();
  ctx.moveTo(-4.5 * S, 0);
  ctx.lineTo(-7.5 * S, -3.5 * S);
  ctx.lineTo(-5.5 * S, 0);
  ctx.closePath();
  ctx.fill();
  // cabina
  ctx.fillStyle = 'rgba(30,60,90,.85)';
  ctx.beginPath();
  ctx.ellipse(3.5 * S, -1 * S, 2 * S, 1.1 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // catapulta visible en la fase de apuntar
  if (state === 'aim' || (state === 'flying' && plane.x < 25)) {
    const bx = sx(0), by = sy(0);
    ctx.strokeStyle = '#8d5524'; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bx - 14, by); ctx.lineTo(bx, by - 3.2 * PX_PER_M);
    ctx.moveTo(bx + 14, by); ctx.lineTo(bx, by - 3.2 * PX_PER_M);
    ctx.stroke();
  }
}

function drawAim() {
  const x = sx(plane.x), y = sy(plane.y);
  const power = aim.power;
  // banda elástica
  if (aim.dragging) {
    ctx.strokeStyle = '#e09f3e'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx(0) - 14, sy(0));
    ctx.lineTo(x, y);
    ctx.lineTo(sx(0) + 14, sy(0));
    ctx.stroke();
  }
  // flecha de dirección
  const len = 40 + power * 90;
  ctx.strokeStyle = `rgba(255, ${Math.round(220 - power * 160)}, 60, .95)`;
  ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  const ex = x + Math.cos(aim.angle) * len;
  const ey = y - Math.sin(aim.angle) * len;
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(aim.angle - 0.4) * 16, ey + Math.sin(aim.angle - 0.4) * 16);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(aim.angle + 0.4) * 16, ey + Math.sin(aim.angle + 0.4) * 16);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // texto de ayuda
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  const msg = aim.dragging
    ? `Potencia: ${Math.round(power * 100)} %  —  ¡suelta para lanzar!`
    : 'Arrastra hacia atrás para cargar la catapulta';
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  const tw = ctx.measureText(msg).width;
  ctx.fillRect(W / 2 - tw / 2 - 12, H * 0.12 - 20, tw + 24, 30);
  ctx.fillStyle = '#fff';
  ctx.fillText(msg, W / 2, H * 0.12);
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  txt('hud-dist', Math.max(0, Math.round(plane.x)));
  txt('hud-speed', Math.round(Math.hypot(plane.vx, plane.vy) * 3.6));
  txt('hud-alt', Math.max(0, Math.round(plane.y)));
  txt('hud-coins', plane.coinsRun);
  const frac = infiniteFuel ? 1 : plane.fuel / stats().fuelMax;
  document.getElementById('fuel-bar').style.width = `${Math.max(0, frac * 100)}%`;
}

/* ---------------- Bucle principal ---------------- */
let lastT = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  dt *= TUNING.gameSpeed;

  if (state === 'flying') {
    updateFlight(dt);
    updateParticles(dt);
    updateHUD();
  } else if (state === 'aim') {
    updateParticles(dt);
    updateHUD();
  } else {
    updateParticles(dt);
  }

  draw();
  requestAnimationFrame(frame);
}

/* ---------------- Entrada ---------------- */
function pointerPos(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function onDown(e) {
  if (e.target.closest('#tuning') || e.target.closest('#btn-tuning') || e.target.closest('.panel')) return;
  const p = pointerPos(e);
  if (state === 'aim') {
    aim.dragging = true;
    updateAim(p);
  } else if (state === 'flying') {
    plane.boosting = true;
  }
  e.preventDefault();
}
function onMove(e) {
  if (state === 'aim' && aim.dragging) {
    updateAim(pointerPos(e));
    e.preventDefault();
  }
}
function onUp() {
  if (state === 'aim' && aim.dragging) {
    aim.dragging = false;
    if (aim.power > 0.05) launch();
  }
  plane.boosting = false;
}
function updateAim(p) {
  // arrastrar hacia abajo-izquierda desde la catapulta = cargar
  const ox = sx(0), oy = sy(3.2);
  const dx = ox - p.x, dy = p.y - oy;
  const d = Math.hypot(dx, dy);
  aim.power = Math.min(1, d / (Math.min(W, H) * 0.35));
  aim.angle = Math.atan2(dy, dx);
  aim.angle = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, aim.angle));
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('touchstart', onDown, { passive: false });
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', onMove, { passive: false });
window.addEventListener('mouseup', onUp);
window.addEventListener('touchend', onUp);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (state === 'aim' && !aim.dragging) {
      // lanzamiento rápido con barra: potencia máxima a 45°
      aim.power = 1; aim.angle = Math.PI / 4;
      launch();
    } else if (state === 'flying') {
      plane.boosting = true;
    }
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') plane.boosting = false;
});

/* ---------------- UI: hangar, mejoras, resultados ---------------- */
function txt(id, v) { document.getElementById(id).textContent = v; }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function renderHangar() {
  txt('bank-coins', save.coins);
  const evo = EVOLUTIONS[evolutionStage()];
  txt('plane-name', `Nave actual: ${evo.name} (evolución ${evolutionStage() + 1}/${EVOLUTIONS.length})` +
      (save.best ? ` — récord: ${save.best} m` : ''));
  const wrap = document.getElementById('upgrades');
  wrap.innerHTML = '';
  for (const def of UPGRADE_DEFS) {
    const lvl = save.upgrades[def.key];
    const maxed = lvl >= MAX_LEVEL;
    const cost = maxed ? 0 : upgradeCost(def, lvl);
    const row = document.createElement('div');
    row.className = 'upgrade';
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) =>
      `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('');
    row.innerHTML = `
      <div class="u-icon">${def.icon}</div>
      <div class="u-info">
        <div class="u-name">${def.name}</div>
        <div class="u-level">${def.desc} — nivel ${lvl}/${MAX_LEVEL}</div>
        <div class="u-pips">${pips}</div>
      </div>
      <button ${maxed || save.coins < cost ? 'disabled' : ''}>
        ${maxed ? 'MÁX' : `🪙 ${cost}`}
      </button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (maxed || save.coins < cost) return;
      save.coins -= cost;
      save.upgrades[def.key]++;
      persistSave();
      renderHangar();
    });
    wrap.appendChild(row);
  }
}

document.getElementById('btn-launch').addEventListener('click', startAim);
document.getElementById('btn-again').addEventListener('click', startAim);
document.getElementById('btn-hangar').addEventListener('click', () => {
  state = 'hangar';
  hide('results'); renderHangar(); show('hangar');
});

/* ---------------- UI: panel de ajustes ---------------- */
function buildTuningPanel() {
  const wrap = document.getElementById('tuning-sliders');
  wrap.innerHTML = '';
  for (const d of TUNING_DEFS) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <label>${d.name} <span class="val">${TUNING[d.key]}</span></label>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${TUNING[d.key]}">`;
    const input = row.querySelector('input');
    const val = row.querySelector('.val');
    input.addEventListener('input', () => {
      TUNING[d.key] = parseFloat(input.value);
      val.textContent = input.value;
      saveTuning();
    });
    wrap.appendChild(row);
  }
}

document.getElementById('btn-tuning').addEventListener('click', () => {
  document.getElementById('tuning').classList.toggle('hidden');
});
document.getElementById('tuning-reset').addEventListener('click', resetTuning);
document.getElementById('cheat-coins').addEventListener('click', () => {
  save.coins += 1000;
  persistSave();
  if (state === 'hangar') renderHangar();
});
document.getElementById('cheat-fuel').addEventListener('change', (e) => {
  infiniteFuel = e.target.checked;
});
document.getElementById('save-reset').addEventListener('click', () => {
  if (confirm('¿Borrar todo el progreso (monedas, mejoras y récord)?')) {
    localStorage.removeItem(SAVE_LS_KEY);
    save.coins = 0; save.best = 0;
    save.upgrades = { launch: 0, engine: 0, fuel: 0, wings: 0 };
    if (state === 'hangar') renderHangar();
  }
});

/* ---------------- Inicio ---------------- */
loadTuning();
loadSave();
buildTuningPanel();
renderHangar();
requestAnimationFrame(frame);
