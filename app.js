/* ============================================================
   ECOMIRROR — Main Application Logic
   ============================================================ */

'use strict';

// =============================================
// CONSTANTS & CO2 FACTORS
// =============================================

const CO2_FACTORS = {
  // Transport
  carKmPerWeek: 0.00021,        // tonnes CO2 per km per week × 52
  flightShortHaul: 0.255,       // tonnes CO2 per short-haul flight (economy)
  transitDaysPerWeek: -0.03,    // credit: tonnes CO2 saved vs car
  cycleDaysPerWeek: -0.02,      // credit

  // Home
  electricityKwh: 0.000233,     // tonnes CO2 per kWh per month × 12 (global avg grid)
  gasM3: 0.00202,               // tonnes CO2 per m³ per month × 12

  // Goods
  clothingItem: 0.025,          // tonnes CO2 per item per year
  electronicsItem: 0.3,         // tonnes CO2 per device per year
  onlineOrderPerMonth: 0.003,   // tonnes CO2 per order × 12
};

const GLOBAL_AVG = 4.7;
const PARIS_TARGET = 2.0;
const MAX_GAUGE = 20;
const TREE_ABSORB_PER_YEAR = 0.022; // tonnes CO2 per tree per year
const OFFSET_COST_PER_TONNE = 15;  // USD

// =============================================
// STATE
// =============================================

const state = {
  transport: { car: 0, flights: 0, transit: 0, cycle: 0 },
  home: { electricity: 0, gas: 0, solar: 0 },
  food: { diet: 2.5, local: 0, waste: 0.3 },
  goods: { clothing: 0, electronics: 0, orders: 0 },
  scores: { transport: 0, home: 0, food: 0, goods: 0, total: 0 },
  streak: 0,
  unlockedBadges: new Set(),
  earthFrame: 0,
  particleSystem: [],
};

// =============================================
// BADGE DEFINITIONS
// =============================================

const BADGES = [
  { id: 'first-step', icon: '🌱', name: 'First Step', desc: 'Completed first tracking', condition: s => s.total > 0 },
  { id: 'below-global', icon: '🌍', name: 'Below Average', desc: 'Under global average (4.7t)', condition: s => s.total > 0 && s.total < GLOBAL_AVG },
  { id: 'paris-hero', icon: '🏆', name: 'Paris Hero', desc: 'Reached Paris 2030 target (<2t)', condition: s => s.total > 0 && s.total < PARIS_TARGET },
  { id: 'no-fly', icon: '✈️', name: 'Ground Hero', desc: 'Zero flights this year', condition: s => state.transport.flights === 0 && s.total > 0 },
  { id: 'cyclist', icon: '🚲', name: 'Urban Cyclist', desc: 'Walk/cycle 5+ days per week', condition: () => state.transport.cycle >= 5 },
  { id: 'plant-based', icon: '🥗', name: 'Plant Warrior', desc: 'Vegetarian or vegan diet', condition: () => state.food.diet <= 1.0 },
  { id: 'solar-star', icon: '☀️', name: 'Solar Star', desc: '60%+ renewable energy', condition: () => state.home.solar >= 0.6 },
  { id: 'eco-champion', icon: '🌟', name: 'Eco Champion', desc: 'Below 1 tonne CO₂/year', condition: s => s.total > 0 && s.total < 1.0 },
];

// =============================================
// INSIGHT DEFINITIONS
// =============================================

const INSIGHTS_DB = [
  { id: 'ev', icon: '⚡', title: 'Switch to Electric Vehicle', desc: 'EVs emit up to 70% less CO₂ than petrol cars over their lifetime.', saving: '−1.5t/yr', trigger: s => s.transport.car > 200 },
  { id: 'public-transit', icon: '🚌', title: 'Use Public Transit', desc: 'Taking the bus instead of driving saves ~2.4kg CO₂ per 10km trip.', saving: '−0.8t/yr', trigger: s => s.transport.car > 100 && s.transport.transit < 3 },
  { id: 'bike', icon: '🚲', title: 'Bike for Short Trips', desc: 'Replacing car trips under 5km with cycling saves significant emissions.', saving: '−0.4t/yr', trigger: s => s.transport.car > 0 && s.transport.cycle < 3 },
  { id: 'solar', icon: '☀️', title: 'Install Solar Panels', desc: 'Solar panels can offset 1–3 tonnes of CO₂ annually per household.', saving: '−2.0t/yr', trigger: s => s.home.solar < 0.3 && s.home.electricity > 300 },
  { id: 'led', icon: '💡', title: 'Switch to LED Lighting', desc: 'LEDs use 75% less energy than incandescent bulbs.', saving: '−0.1t/yr', trigger: s => s.home.electricity > 200 },
  { id: 'vegan', icon: '🌱', title: 'Try Plant-Based Diet', desc: 'Going vegan reduces food-related emissions by up to 73%.', saving: '−0.9t/yr', trigger: s => s.food.diet > 1.5 },
  { id: 'local-food', icon: '🛒', title: 'Buy Local & Seasonal', desc: 'Local food travels 50× less distance, slashing transport emissions.', saving: '−0.2t/yr', trigger: s => s.food.local < 50 },
  { id: 'food-waste', icon: '♻️', title: 'Reduce Food Waste', desc: 'Food waste accounts for ~8% of global greenhouse gas emissions.', saving: '−0.3t/yr', trigger: s => parseFloat(s.food.waste) > 0.1 },
  { id: 'fast-fashion', icon: '👗', title: 'Avoid Fast Fashion', desc: 'The fashion industry emits more CO₂ than aviation and shipping combined.', saving: '−0.5t/yr', trigger: s => s.goods.clothing > 20 },
  { id: 'second-hand', icon: '🔄', title: 'Buy Second-Hand', desc: 'Choosing refurbished electronics can reduce e-waste by up to 70%.', saving: '−0.6t/yr', trigger: s => s.goods.electronics > 2 },
  { id: 'reduce-orders', icon: '📦', title: 'Bundle Online Orders', desc: 'Consolidating deliveries reduces transport emissions significantly.', saving: '−0.15t/yr', trigger: s => s.goods.orders > 10 },
  { id: 'great', icon: '🌟', title: 'Keep Up the Great Work!', desc: 'Your footprint is already below the global average. Keep inspiring others!', saving: 'You rock! 🎉', trigger: s => s.scores.total < GLOBAL_AVG && s.scores.total > 0 },
];

// =============================================
// UTILITY FUNCTIONS
// =============================================

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function formatTonnes(val) {
  return val.toFixed(1) + 't';
}

function showToast(icon, message) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// =============================================
// CALCULATION ENGINE
// =============================================

function calculateScores() {
  const t = state.transport;
  const h = state.home;
  const f = state.food;
  const g = state.goods;

  // Transport (tonnes CO2/year)
  let transport = 0;
  transport += t.car * CO2_FACTORS.carKmPerWeek * 52;
  transport += t.flights * CO2_FACTORS.flightShortHaul;
  transport = Math.max(0, transport - t.transit * 0.05 - t.cycle * 0.03);

  // Home Energy (tonnes CO2/year)
  const solarFactor = 1 - parseFloat(h.solar || 0);
  let home = 0;
  home += h.electricity * CO2_FACTORS.electricityKwh * 12 * solarFactor;
  home += h.gas * CO2_FACTORS.gasM3 * 12;

  // Food (tonnes CO2/year)
  let food = 0;
  food += parseFloat(f.diet || 2.5);
  food *= (1 - (f.local / 100) * 0.1);  // local food reduces 10%
  food += parseFloat(f.waste || 0.1);

  // Goods (tonnes CO2/year)
  let goods = 0;
  goods += g.clothing * CO2_FACTORS.clothingItem;
  goods += g.electronics * CO2_FACTORS.electronicsItem;
  goods += g.orders * CO2_FACTORS.onlineOrderPerMonth * 12;

  const total = transport + home + food + goods;

  state.scores = {
    transport: Math.max(0, transport),
    home: Math.max(0, home),
    food: Math.max(0, food),
    goods: Math.max(0, goods),
    total: Math.max(0, total),
  };

  return state.scores;
}

// =============================================
// EARTH CANVAS — Planet Health Mirror
// =============================================

const earthCanvas = document.getElementById('earthCanvas');
const earthCtx = earthCanvas.getContext('2d');
let earthAnimFrame = null;
let earthRotation = 0;

function getEarthHealthState(totalCO2) {
  if (totalCO2 < 2) return 'excellent';
  if (totalCO2 < 4) return 'good';
  if (totalCO2 < 7) return 'warning';
  if (totalCO2 < 10) return 'bad';
  return 'critical';
}

function drawEarth(totalCO2) {
  const canvas = earthCanvas;
  const ctx = earthCtx;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  ctx.clearRect(0, 0, size, size);

  const health = getEarthHealthState(totalCO2);
  const healthColors = {
    excellent: { ocean: ['#0077b6', '#00b4d8'], land: ['#2d6a4f', '#52b788'], smog: 0, crack: 0 },
    good: { ocean: ['#0096c7', '#48cae4'], land: ['#40916c', '#74c69d'], smog: 0.05, crack: 0 },
    warning: { ocean: ['#6b705c', '#a7c957'], land: ['#bc6c25', '#dda15e'], smog: 0.25, crack: 0.1 },
    bad: { ocean: ['#6b4c3b', '#8d6e63'], land: ['#8b5e3c', '#c17f4b'], smog: 0.55, crack: 0.4 },
    critical: { ocean: ['#3d2b1f', '#5c3d2e'], land: ['#5a2d0c', '#7a3b0e'], smog: 0.85, crack: 0.7 },
  };
  const hc = healthColors[health];

  // --- Outer glow ---
  const glowColors = {
    excellent: 'rgba(0, 229, 160, 0.4)',
    good: 'rgba(0, 229, 160, 0.2)',
    warning: 'rgba(245, 158, 11, 0.3)',
    bad: 'rgba(239, 68, 68, 0.3)',
    critical: 'rgba(127, 29, 29, 0.5)',
  };
  const grad = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r + 20);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, glowColors[health]);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 20, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // --- Clip to circle ---
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // --- Ocean background ---
  const oceanGrad = ctx.createLinearGradient(0, 0, size, size);
  oceanGrad.addColorStop(0, hc.ocean[0]);
  oceanGrad.addColorStop(1, hc.ocean[1]);
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, size, size);

  // --- Animated landmasses ---
  const t = earthRotation;

  function drawContinent(offsets, color, scale) {
    ctx.beginPath();
    offsets.forEach(([ox, oy, w, h, rot]) => {
      ctx.save();
      ctx.translate(cx + ox + Math.sin(t * 0.5 + ox) * 2, cy + oy);
      ctx.rotate(rot + t * 0.002);
      ctx.scale(scale, scale);
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.restore();
    });
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Americas
  drawContinent([[-40, -20, 22, 38, -0.3], [-30, 30, 16, 28, 0.2]], hc.land[0], 1);
  // Europe / Africa
  drawContinent([[15, -25, 16, 22, 0.15], [20, 15, 14, 32, -0.1]], hc.land[1], 1);
  // Asia
  drawContinent([[55, -30, 30, 24, 0.05], [70, 10, 18, 14, 0.2]], hc.land[0], 1);
  // Australia
  drawContinent([[55, 45, 16, 10, 0.1]], hc.land[1], 1);

  // --- Ice caps ---
  if (health === 'excellent' || health === 'good') {
    ctx.beginPath();
    ctx.ellipse(cx, 8, r * 0.6, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230, 240, 255, 0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, size - 8, r * 0.5, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210, 230, 255, 0.7)';
    ctx.fill();
  } else if (health === 'warning') {
    ctx.beginPath();
    ctx.ellipse(cx, 8, r * 0.3, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 215, 240, 0.5)';
    ctx.fill();
  }

  // --- Smog layer ---
  if (hc.smog > 0) {
    const smogGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    smogGrad.addColorStop(0, `rgba(120, 80, 40, ${hc.smog * 0.5})`);
    smogGrad.addColorStop(1, `rgba(60, 30, 10, ${hc.smog * 0.8})`);
    ctx.fillStyle = smogGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // --- Crack effect ---
  if (hc.crack > 0) {
    ctx.strokeStyle = `rgba(255, 100, 50, ${hc.crack * 0.6})`;
    ctx.lineWidth = 1.5;
    const cracks = [[cx - 20, cy - 10, cx, cy + 15], [cx + 10, cy - 20, cx + 30, cy + 5], [cx - 30, cy + 20, cx - 15, cy + 40]];
    cracks.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  // --- Atmosphere shimmer ---
  const atmGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  atmGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  atmGrad.addColorStop(0.6, 'transparent');
  ctx.fillStyle = atmGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.restore(); // remove clip

  // --- Circular border/ring ---
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const borderColor = { excellent: '#00e5a0', good: '#7fcc80', warning: '#f59e0b', bad: '#ef4444', critical: '#7f1d1d' };
  ctx.strokeStyle = borderColor[health];
  ctx.lineWidth = 3;
  ctx.stroke();

  earthRotation += 0.3;
}

function animateEarth() {
  drawEarth(state.scores.total);
  earthAnimFrame = requestAnimationFrame(animateEarth);
}

// =============================================
// PARTICLE SYSTEM (CO2 particles)
// =============================================

const particleCanvas = document.getElementById('particleCanvas');
const particleCtx = particleCanvas.getContext('2d');
let particleAnimFrame = null;

function initParticleCanvas() {
  const rect = particleCanvas.parentElement.getBoundingClientRect();
  particleCanvas.width = rect.width;
  particleCanvas.height = rect.height;
}

function createParticle(co2Level) {
  const spread = co2Level / 20;
  return {
    x: particleCanvas.width * 0.35 + (Math.random() - 0.5) * 80 * spread,
    y: particleCanvas.height * 0.7,
    vx: (Math.random() - 0.5) * 0.5 * spread,
    vy: -(Math.random() * 1.5 + 0.3) * (0.3 + spread),
    alpha: 0.6 + Math.random() * 0.3,
    size: Math.random() * 4 + 1.5,
    life: 0,
    maxLife: 120 + Math.random() * 80,
    color: co2Level > 8 ? 'rgba(239, 68, 68,' : co2Level > 4 ? 'rgba(245, 158, 11,' : 'rgba(0, 229, 160,',
  };
}

function updateParticles() {
  const totalCO2 = state.scores.total;
  if (totalCO2 <= 0) {
    state.particleSystem = [];
    return;
  }

  // Spawn new particles based on CO2 level
  const spawnRate = Math.ceil(totalCO2 / 3);
  for (let i = 0; i < spawnRate; i++) {
    if (state.particleSystem.length < 100 && Math.random() < 0.3) {
      state.particleSystem.push(createParticle(totalCO2));
    }
  }

  // Update and remove dead particles
  state.particleSystem = state.particleSystem.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.01;
    p.life++;
    const progress = p.life / p.maxLife;
    p.alpha = (1 - progress) * 0.7;
    return p.life < p.maxLife && p.alpha > 0.01;
  });
}

function drawParticles() {
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  state.particleSystem.forEach(p => {
    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    particleCtx.fillStyle = `${p.color}${p.alpha.toFixed(2)})`;
    particleCtx.fill();

    // "CO₂" text on some particles
    if (p.size > 3 && p.life % 40 === 0) {
      particleCtx.font = '8px Outfit';
      particleCtx.fillStyle = `${p.color}${(p.alpha * 0.8).toFixed(2)})`;
      particleCtx.fillText('CO₂', p.x + 4, p.y - 4);
    }
  });
}

function animateParticles() {
  updateParticles();
  drawParticles();
  particleAnimFrame = requestAnimationFrame(animateParticles);
}

// =============================================
// GAUGE CANVAS
// =============================================

const gaugeCanvas = document.getElementById('gaugeCanvas');
const gaugeCtx = gaugeCanvas.getContext('2d');

function drawGauge(value) {
  const ctx = gaugeCtx;
  const w = gaugeCanvas.width;
  const h = gaugeCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h - 10;
  const r = Math.min(w, h * 1.6) / 2 - 12;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const valueAngle = startAngle + (value / MAX_GAUGE) * Math.PI;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Gradient arc (color changes with value)
  const pct = value / MAX_GAUGE;
  const r1 = Math.round(lerp(0, 239, pct));
  const g1 = Math.round(lerp(229, 68, pct));
  const b1 = Math.round(lerp(160, 68, pct));
  const arcColor = `rgb(${r1},${g1},${b1})`;

  const grd = ctx.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, '#00e5a0');
  grd.addColorStop(0.5, '#f59e0b');
  grd.addColorStop(1, '#ef4444');

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, valueAngle);
  ctx.strokeStyle = grd;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Needle
  const needleAngle = valueAngle;
  const nx = cx + (r - 4) * Math.cos(needleAngle);
  const ny = cy + (r - 4) * Math.sin(needleAngle);

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = arcColor;
  ctx.fill();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const tickAngle = startAngle + (i / 10) * Math.PI;
    const inner = r - 20;
    const outer = r - 6;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(tickAngle), cy + inner * Math.sin(tickAngle));
    ctx.lineTo(cx + outer * Math.cos(tickAngle), cy + outer * Math.sin(tickAngle));
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }
}

// =============================================
// UI UPDATES
// =============================================

function updateGaugeDisplay(scores) {
  const val = scores.total;
  const pct = clamp(val / MAX_GAUGE, 0, 1);

  // Animate gauge value
  drawGauge(val);

  const gaugeValEl = document.getElementById('gauge-value');
  gaugeValEl.textContent = val.toFixed(1);

  // Label color/text
  const labelEl = document.getElementById('gauge-label');
  let labelClass, labelText;
  if (val < 2) { labelClass = 'health-great'; labelText = '🌿 Excellent'; }
  else if (val < 4) { labelClass = 'health-great'; labelText = '👍 Good'; }
  else if (val < 7) { labelClass = 'health-ok'; labelText = '⚠️ Average'; }
  else { labelClass = 'health-bad'; labelText = '🔴 High Impact'; }

  labelEl.className = `gauge-label ${labelClass}`;
  labelEl.textContent = labelText;

  // User comparison bar
  const barPct = clamp((val / (GLOBAL_AVG * 2.1)) * 100, 0, 100);
  document.getElementById('bar-user').style.width = `${barPct}%`;
  document.getElementById('cmp-user').textContent = formatTonnes(val);
}

function updateBreakdownChart(scores) {
  const max = Math.max(scores.total, GLOBAL_AVG, 0.1);
  const ids = ['transport', 'home', 'food', 'goods'];

  ids.forEach(cat => {
    const val = scores[cat];
    const pct = clamp((val / max) * 85, 0, 100);
    const barEl = document.getElementById(`bar-${cat}`);
    const valEl = document.getElementById(`val-${cat}-co2`);
    if (barEl) barEl.style.width = `${pct}%`;
    if (valEl) valEl.textContent = formatTonnes(val);
  });
}

function updatePlanetMirror(scores) {
  const total = scores.total;

  // Update CO2 value
  document.getElementById('planet-co2-val').textContent = total.toFixed(1) + 't';

  // Trees
  const trees = total > 0 ? Math.ceil(total / TREE_ABSORB_PER_YEAR) : 0;
  document.getElementById('planet-trees-val').textContent = trees.toLocaleString();

  // Health badge
  const badge = document.getElementById('health-status-badge');
  const icon = document.getElementById('health-badge-icon');
  const text = document.getElementById('health-badge-text');

  badge.className = 'health-status-badge';
  if (total === 0) { badge.classList.add('health-great'); icon.textContent = '🌿'; text.textContent = 'Start Tracking'; }
  else if (total < 2) { badge.classList.add('health-great'); icon.textContent = '🌟'; text.textContent = 'Carbon Hero'; }
  else if (total < 4) { badge.classList.add('health-great'); icon.textContent = '✅'; text.textContent = 'Doing Well'; }
  else if (total < 7) { badge.classList.add('health-ok'); icon.textContent = '⚠️'; text.textContent = 'Average'; }
  else if (total < 10) { badge.classList.add('health-bad'); icon.textContent = '🔴'; text.textContent = 'High Impact'; }
  else { badge.classList.add('health-bad'); icon.textContent = '🚨'; text.textContent = 'Critical'; }

  // Earth glow shadow
  const health = getEarthHealthState(total);
  const glowMap = { excellent: 'rgba(0,229,160,0.6)', good: 'rgba(0,229,160,0.3)', warning: 'rgba(245,158,11,0.5)', bad: 'rgba(239,68,68,0.5)', critical: 'rgba(127,29,29,0.7)' };
  earthCanvas.style.filter = `drop-shadow(0 0 ${total > 0 ? 40 : 20}px ${glowMap[health]})`;
}

function updateInsights(scores) {
  const list = document.getElementById('insight-list');
  const applicable = INSIGHTS_DB.filter(ins => ins.trigger(state));
  const shown = applicable.slice(0, 4);

  list.innerHTML = '';
  if (shown.length === 0) {
    list.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 24px; font-size: 0.85rem;">
      🌱 Start tracking your emissions to get personalized insights!
    </div>`;
    return;
  }

  shown.forEach((ins, i) => {
    const el = document.createElement('div');
    el.className = 'insight-item';
    el.style.animationDelay = `${i * 0.08}s`;
    el.setAttribute('role', 'listitem');
    el.innerHTML = `
      <div class="insight-icon" aria-hidden="true">${ins.icon}</div>
      <div class="insight-content">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-desc">${ins.desc}</div>
      </div>
      <div class="insight-saving" title="Estimated annual CO₂ saving">${ins.saving}</div>
    `;
    list.appendChild(el);
  });
}

function updateOffsetCalculator(scores) {
  const total = scores.total;
  const trees = total > 0 ? Math.ceil(total / TREE_ABSORB_PER_YEAR) : 0;
  const months = total > 0 ? Math.ceil((total / GLOBAL_AVG) * 12) : 0;
  const cost = Math.ceil(total * OFFSET_COST_PER_TONNE);
  const flightsToSkip = total > 0 ? Math.ceil(total / CO2_FACTORS.flightShortHaul) : 0;
  const meatDays = total > 0 ? Math.ceil((total * 0.4) / (0.005)) : 0;

  document.getElementById('trees-count').textContent = trees.toLocaleString();
  document.getElementById('offset-months').textContent = months;
  document.getElementById('offset-cost').textContent = `$${cost}`;
  document.getElementById('offset-flights-avoided').textContent = flightsToSkip;
  document.getElementById('offset-meat-days').textContent = meatDays.toLocaleString();

  // Tree row visualization (show up to 30 trees)
  const treeRow = document.getElementById('tree-row');
  treeRow.innerHTML = '';
  const displayTrees = Math.min(trees, 30);
  for (let i = 0; i < displayTrees; i++) {
    const span = document.createElement('span');
    span.className = 'tree-emoji';
    span.textContent = '🌳';
    span.style.animationDelay = `${i * 0.04}s`;
    treeRow.appendChild(span);
  }
  if (trees > 30) {
    const more = document.createElement('span');
    more.textContent = ` +${(trees - 30).toLocaleString()} more`;
    more.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); align-self: center;';
    treeRow.appendChild(more);
  }
}

// =============================================
// BADGES SYSTEM
// =============================================

function updateBadges(scores) {
  const grid = document.getElementById('badges-grid');
  const prevUnlocked = new Set(state.unlockedBadges);
  state.unlockedBadges.clear();

  BADGES.forEach(badge => {
    if (badge.condition(scores)) {
      state.unlockedBadges.add(badge.id);
    }
  });

  // Show toast for newly unlocked badges
  state.unlockedBadges.forEach(id => {
    if (!prevUnlocked.has(id)) {
      const badge = BADGES.find(b => b.id === id);
      if (badge) showToast(badge.icon, `Badge unlocked: ${badge.name}!`);
    }
  });

  // Render
  grid.innerHTML = '';
  BADGES.forEach((badge, i) => {
    const isUnlocked = state.unlockedBadges.has(badge.id);
    const el = document.createElement('div');
    el.className = `badge-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-label', `${badge.name}: ${isUnlocked ? 'Unlocked' : 'Locked'}`);
    el.style.animationDelay = `${i * 0.05}s`;
    el.innerHTML = `
      <div class="badge-icon" aria-hidden="true">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      ${isUnlocked ? '<div class="badge-unlock-tag">✓ Unlocked</div>' : '<div class="badge-unlock-tag" style="color:var(--text-muted);">Locked</div>'}
    `;
    grid.appendChild(el);
  });
}

// =============================================
// STREAK SYSTEM
// =============================================

function initStreak() {
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem('eco_last_visit');
  const savedStreak = parseInt(localStorage.getItem('eco_streak') || '0', 10);

  if (lastVisit === today) {
    state.streak = savedStreak;
  } else if (lastVisit) {
    const lastDate = new Date(lastVisit);
    const diffDays = Math.round((new Date() - lastDate) / (1000 * 60 * 60 * 24));
    state.streak = diffDays === 1 ? savedStreak + 1 : 1;
    localStorage.setItem('eco_streak', state.streak);
    localStorage.setItem('eco_last_visit', today);
  } else {
    state.streak = 1;
    localStorage.setItem('eco_streak', 1);
    localStorage.setItem('eco_last_visit', today);
  }

  updateStreakDisplay();
}

function updateStreakDisplay() {
  document.getElementById('streak-count').textContent = state.streak;
  const daysToNext = 7 - (state.streak % 7);
  document.getElementById('streak-days-next').textContent = `${daysToNext} day${daysToNext !== 1 ? 's' : ''}`;
}

// =============================================
// MAIN UPDATE FUNCTION
// =============================================

function updateAll() {
  const scores = calculateScores();
  updateGaugeDisplay(scores);
  updateBreakdownChart(scores);
  updatePlanetMirror(scores);
  updateInsights(scores);
  updateOffsetCalculator(scores);
  updateBadges(scores);
}

// =============================================
// TRACKER INPUTS — Wire Up Sliders
// =============================================

function setupSlider(id, stateKey, stateSubKey, displayId, formatFn, onChange) {
  const el = document.getElementById(id);
  const disp = document.getElementById(displayId);
  if (!el || !disp) return;

  el.addEventListener('input', () => {
    const val = parseFloat(el.value);
    state[stateKey][stateSubKey] = val;
    disp.textContent = formatFn(val);
    updateAll();
  });
}

function setupSelect(id, stateKey, stateSubKey, displayId, formatFn) {
  const el = document.getElementById(id);
  const disp = document.getElementById(displayId);
  if (!el) return;

  el.addEventListener('change', () => {
    state[stateKey][stateSubKey] = el.value;
    if (disp) disp.textContent = formatFn(el.options[el.selectedIndex].text);
    updateAll();
  });
}

function setupInputs() {
  // Transport
  setupSlider('slider-car', 'transport', 'car', 'val-car', v => `${v} km`, updateAll);
  setupSlider('slider-flights', 'transport', 'flights', 'val-flights', v => v, updateAll);
  setupSlider('slider-transit', 'transport', 'transit', 'val-transit', v => `${v} days`, updateAll);
  setupSlider('slider-cycle', 'transport', 'cycle', 'val-cycle', v => `${v} days`, updateAll);

  // Home
  setupSlider('slider-electricity', 'home', 'electricity', 'val-electricity', v => `${v} kWh`, updateAll);
  setupSlider('slider-gas', 'home', 'gas', 'val-gas', v => `${v} m³`, updateAll);
  setupSelect('select-solar', 'home', 'solar', 'val-solar', t => t.split(' ')[0] || 'None');

  // Food
  setupSelect('select-diet', 'food', 'diet', 'val-diet', t => t.split(' ')[0]);
  setupSlider('slider-local', 'food', 'local', 'val-local', v => `${v}%`, updateAll);
  setupSelect('select-waste', 'food', 'waste', 'val-waste', t => t.split('—')[0].trim());

  // Goods
  setupSlider('slider-clothing', 'goods', 'clothing', 'val-clothing', v => v, updateAll);
  setupSlider('slider-electronics', 'goods', 'electronics', 'val-electronics', v => v, updateAll);
  setupSlider('slider-orders', 'goods', 'orders', 'val-orders', v => v, updateAll);
}

// =============================================
// TABS
// =============================================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tracker-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetId = `panel-${tab.dataset.tab}`;
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// =============================================
// CLIMATE PROJECTION MODAL
// =============================================

function showClimateModal() {
  const total = state.scores.total;
  const modal = document.getElementById('modal-overlay');
  const health = getEarthHealthState(total);

  // Dynamic content based on health
  const projections = {
    excellent: {
      emoji: '🌍',
      temp2050: '+1.1°C',
      temp2075: '+1.4°C',
      desc2050: 'Paris Agreement met',
      desc2075: 'Stable climate',
      color2050: 'var(--primary)',
      color2075: 'var(--primary)',
      message: `🎉 <strong>Incredible!</strong> Your footprint of ${total.toFixed(1)}t CO₂/year is well below the Paris 2030 target of 2.0t. 
      If everyone lived like you, global temperatures would remain stable. You're a genuine climate champion. Keep sharing your lifestyle choices — they inspire others to follow!`,
    },
    good: {
      emoji: '🌎',
      temp2050: '+1.4°C',
      temp2075: '+1.8°C',
      desc2050: 'Near target',
      desc2075: 'Mild impacts',
      color2050: 'var(--primary)',
      color2075: 'var(--sky)',
      message: `✅ <strong>Great progress!</strong> At ${total.toFixed(1)}t CO₂/year, you're below the global average of 4.7t. 
      Small reductions — like fewer flights or more plant-based meals — could bring you under the 2030 Paris target. You're on the right track!`,
    },
    warning: {
      emoji: '🌏',
      temp2050: '+1.8°C',
      temp2075: '+2.6°C',
      desc2050: 'Moderate stress',
      desc2075: 'Serious impacts',
      color2050: 'var(--warning)',
      color2075: 'var(--warning)',
      message: `⚠️ <strong>Action needed.</strong> Your footprint of ${total.toFixed(1)}t CO₂/year is near the global average. 
      By 2075, if current trends continue, we'd see increased extreme weather events, coastal flooding, and biodiversity loss. 
      Switching to a more plant-based diet and reducing car travel could cut your footprint by up to 40%.`,
    },
    bad: {
      emoji: '🟠',
      temp2050: '+2.3°C',
      temp2075: '+3.4°C',
      desc2050: 'Severe stress',
      desc2075: 'Crisis level',
      color2050: 'var(--danger)',
      color2075: 'var(--danger)',
      message: `🔴 <strong>High impact detected.</strong> At ${total.toFixed(1)}t CO₂/year, your footprint is ${(total / GLOBAL_AVG * 100 - 100).toFixed(0)}% above the global average. 
      At this rate, global temperatures could rise 3°C+ by 2100 — triggering irreversible tipping points: melting ice sheets, ocean acidification, and mass extinction events. 
      Immediate lifestyle changes could dramatically reduce your impact.`,
    },
    critical: {
      emoji: '🔴',
      temp2050: '+2.8°C',
      temp2075: '+4.1°C',
      desc2050: 'Emergency',
      desc2075: 'Catastrophic',
      color2050: '#7f1d1d',
      color2075: '#7f1d1d',
      message: `🚨 <strong>Critical footprint.</strong> Your current emissions of ${total.toFixed(1)}t CO₂/year are ${Math.round(total / GLOBAL_AVG)}× the global average. 
      Projections at this trajectory show catastrophic temperature rises by 2075 — severe food and water scarcity, displacement of billions, and collapse of major ecosystems. 
      Urgent action is possible: transportation and diet changes alone could cut your footprint by over 60%.`,
    },
  };

  const proj = projections[health] || projections.warning;

  document.getElementById('modal-earth-emoji').textContent = proj.emoji;
  document.getElementById('modal-2025-temp').style.color = 'var(--primary)';
  document.getElementById('modal-2050-temp').textContent = proj.temp2050;
  document.getElementById('modal-2050-temp').style.color = proj.color2050;
  document.getElementById('modal-2075-temp').textContent = proj.temp2075;
  document.getElementById('modal-2075-temp').style.color = proj.color2075;
  document.getElementById('modal-2050-desc').textContent = proj.desc2050;
  document.getElementById('modal-2075-desc').textContent = proj.desc2075;
  document.getElementById('modal-message').innerHTML = proj.message;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function setupModal() {
  // Earth canvas click
  earthCanvas.addEventListener('click', showClimateModal);
  earthCanvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showClimateModal(); });

  // Close buttons
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Action button
  document.getElementById('modal-action-btn').addEventListener('click', () => {
    closeModal();
    document.getElementById('panel-transport').classList.add('active');
    document.querySelectorAll('.tracker-panel').forEach(p => {
      if (p.id !== 'panel-transport') p.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'transport');
    });
    document.querySelector('.tracker-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// =============================================
// NAV BUTTONS
// =============================================

function setupNav() {
  document.getElementById('nav-insights').addEventListener('click', () => {
    document.getElementById('insights-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('nav-offset').addEventListener('click', () => {
    document.getElementById('offset-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('nav-dashboard').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('hero-calculate-btn').addEventListener('click', () => {
    document.querySelector('.tracker-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('hero-learn-btn').addEventListener('click', () => {
    document.getElementById('planet-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// =============================================
// RESIZE HANDLER
// =============================================

function handleResize() {
  initParticleCanvas();
}

// =============================================
// SCROLL ANIMATION (Intersection Observer)
// =============================================

function setupScrollAnimations() {
  const cards = document.querySelectorAll('.card, .streak-banner');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(24px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    observer.observe(card);
  });
}

// =============================================
// DEMO: Pre-fill with sample data
// =============================================

function loadSampleData() {
  // Set some sample values to show the UI in action
  const carSlider = document.getElementById('slider-car');
  const flightsSlider = document.getElementById('slider-flights');
  const electricitySlider = document.getElementById('slider-electricity');
  const gasSlider = document.getElementById('slider-gas');

  if (carSlider) { carSlider.value = 250; state.transport.car = 250; document.getElementById('val-car').textContent = '250 km'; }
  if (flightsSlider) { flightsSlider.value = 3; state.transport.flights = 3; document.getElementById('val-flights').textContent = '3'; }
  if (electricitySlider) { electricitySlider.value = 450; state.home.electricity = 450; document.getElementById('val-electricity').textContent = '450 kWh'; }
  if (gasSlider) { gasSlider.value = 80; state.home.gas = 80; document.getElementById('val-gas').textContent = '80 m³'; }

  const dietSelect = document.getElementById('select-diet');
  if (dietSelect) { dietSelect.value = '2.5'; state.food.diet = 2.5; document.getElementById('val-diet').textContent = 'Average'; }
  const localSlider = document.getElementById('slider-local');
  if (localSlider) { localSlider.value = 20; state.food.local = 20; document.getElementById('val-local').textContent = '20%'; }

  const clothingSlider = document.getElementById('slider-clothing');
  if (clothingSlider) { clothingSlider.value = 20; state.goods.clothing = 20; document.getElementById('val-clothing').textContent = '20'; }
  const ordersSlider = document.getElementById('slider-orders');
  if (ordersSlider) { ordersSlider.value = 8; state.goods.orders = 8; document.getElementById('val-orders').textContent = '8'; }

  updateAll();
}

// =============================================
// INIT
// =============================================

function init() {
  // Setup UI interactions
  setupInputs();
  setupTabs();
  setupModal();
  setupNav();

  // Start animations
  initParticleCanvas();
  animateEarth();
  animateParticles();

  // Initial render
  updateAll();

  // Streak
  initStreak();

  // Scroll animations
  setTimeout(setupScrollAnimations, 100);

  // Load sample data after short delay for visual effect
  setTimeout(loadSampleData, 600);

  // Resize handler
  window.addEventListener('resize', handleResize);

  // Keyboard accessibility for tabs
  document.querySelectorAll('.tab-btn').forEach((tab, i, arr) => {
    tab.addEventListener('keydown', e => {
      let targetIdx = -1;
      if (e.key === 'ArrowRight') targetIdx = (i + 1) % arr.length;
      else if (e.key === 'ArrowLeft') targetIdx = (i - 1 + arr.length) % arr.length;
      if (targetIdx >= 0) { arr[targetIdx].click(); arr[targetIdx].focus(); }
    });
  });

  console.log('%c🌿 EcoMirror Loaded', 'color: #00e5a0; font-size: 1.2rem; font-weight: bold;');
  console.log('%cTrack your carbon footprint and see your Planet Health Mirror!', 'color: #a78bfa;');
}

document.addEventListener('DOMContentLoaded', init);
