/* ============================================================
   ECOMIRROR — Main Application Logic
   ============================================================ */

'use strict';

// =============================================
// CONSTANTS & CO2 FACTORS
// =============================================

/**
 * CO2 Emission Factors based on IPCC & Our World in Data.
 * @type {Object<string, number>}
 */
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

/**
 * Global application state.
 */
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
  earthVisible: true,
  particlesVisible: true
};

// =============================================
// BADGE DEFINITIONS
// =============================================

/**
 * List of Eco Achievement Badges with their unlock conditions.
 */
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

/**
 * Actionable insights database.
 */
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
// DOM ELEMENT CACHE
// =============================================

/**
 * Cache of DOM elements.
 * @type {Object<string, HTMLElement|CanvasRenderingContext2D|null>}
 */
const DOM = {};

/**
 * Initializes the DOM cache.
 */
function cacheDOMElements() {
  try {
    DOM.toast = document.getElementById('toast');
    DOM.toastIcon = document.getElementById('toast-icon');
    DOM.toastMsg = document.getElementById('toast-msg');
    DOM.earthCanvas = document.getElementById('earthCanvas');
    if (DOM.earthCanvas) DOM.earthCtx = DOM.earthCanvas.getContext('2d');
    DOM.particleCanvas = document.getElementById('particleCanvas');
    if (DOM.particleCanvas) DOM.particleCtx = DOM.particleCanvas.getContext('2d');
    DOM.gaugeCanvas = document.getElementById('gaugeCanvas');
    if (DOM.gaugeCanvas) DOM.gaugeCtx = DOM.gaugeCanvas.getContext('2d');
    DOM.gaugeValue = document.getElementById('gauge-value');
    DOM.gaugeLabel = document.getElementById('gauge-label');
    DOM.barUser = document.getElementById('bar-user');
    DOM.cmpUser = document.getElementById('cmp-user');
    DOM.barTransport = document.getElementById('bar-transport');
    DOM.valTransportCo2 = document.getElementById('val-transport-co2');
    DOM.barHome = document.getElementById('bar-home');
    DOM.valHomeCo2 = document.getElementById('val-home-co2');
    DOM.barFood = document.getElementById('bar-food');
    DOM.valFoodCo2 = document.getElementById('val-food-co2');
    DOM.barGoods = document.getElementById('bar-goods');
    DOM.valGoodsCo2 = document.getElementById('val-goods-co2');
    DOM.planetCo2Val = document.getElementById('planet-co2-val');
    DOM.planetTreesVal = document.getElementById('planet-trees-val');
    DOM.healthStatusBadge = document.getElementById('health-status-badge');
    DOM.healthBadgeIcon = document.getElementById('health-badge-icon');
    DOM.healthBadgeText = document.getElementById('health-badge-text');
    DOM.insightList = document.getElementById('insight-list');
    DOM.treesCount = document.getElementById('trees-count');
    DOM.offsetMonths = document.getElementById('offset-months');
    DOM.offsetCost = document.getElementById('offset-cost');
    DOM.offsetFlightsAvoided = document.getElementById('offset-flights-avoided');
    DOM.offsetMeatDays = document.getElementById('offset-meat-days');
    DOM.treeRow = document.getElementById('tree-row');
    DOM.badgesGrid = document.getElementById('badges-grid');
    DOM.streakCount = document.getElementById('streak-count');
    DOM.streakDaysNext = document.getElementById('streak-days-next');
    DOM.modalOverlay = document.getElementById('modal-overlay');
    DOM.modalEarthEmoji = document.getElementById('modal-earth-emoji');
    DOM.modal2025Temp = document.getElementById('modal-2025-temp');
    DOM.modal2050Temp = document.getElementById('modal-2050-temp');
    DOM.modal2075Temp = document.getElementById('modal-2075-temp');
    DOM.modal2050Desc = document.getElementById('modal-2050-desc');
    DOM.modal2075Desc = document.getElementById('modal-2075-desc');
    DOM.modalMessage = document.getElementById('modal-message');
    DOM.modalClose = document.getElementById('modal-close');
    DOM.modalCloseBtn = document.getElementById('modal-close-btn');
    DOM.modalActionBtn = document.getElementById('modal-action-btn');
    DOM.navInsights = document.getElementById('nav-insights');
    DOM.navOffset = document.getElementById('nav-offset');
    DOM.navDashboard = document.getElementById('nav-dashboard');
    DOM.heroCalculateBtn = document.getElementById('hero-calculate-btn');
    DOM.heroLearnBtn = document.getElementById('hero-learn-btn');
  } catch (err) {
    console.error('Failed to initialize DOM cache:', err);
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} val - The input value.
 * @param {number} min - The lower bound.
 * @param {number} max - The upper bound.
 * @returns {number} The clamped value.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Performs linear interpolation between two values.
 * @param {number} a - Starting value.
 * @param {number} b - Ending value.
 * @param {number} t - Interpolation factor (0 to 1).
 * @returns {number} The interpolated value.
 */
function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Formats carbon value to one decimal place with 't' suffix.
 * @param {number} val - Carbon in tonnes.
 * @returns {string} Formatted string.
 */
function formatTonnes(val) {
  return val.toFixed(1) + 't';
}

/**
 * Displays a toast notification message.
 * @param {string} icon - Emoji representing the badge or action.
 * @param {string} message - Text message.
 */
function showToast(icon, message) {
  if (!DOM.toast || !DOM.toastIcon || !DOM.toastMsg) return;
  DOM.toastIcon.textContent = icon;
  DOM.toastMsg.textContent = message;
  DOM.toast.classList.add('show');
  setTimeout(() => DOM.toast.classList.remove('show'), 3500);
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Safely sets message markup inside a DOM element.
 * Only processes safe bold styling <strong> tags.
 * @param {HTMLElement} element - Target DOM element.
 * @param {string} text - Message containing markup.
 */
function setSafeMessage(element, text) {
  if (!element) return;
  element.replaceChildren();
  const parts = text.split(/(<strong>.*?<\/strong>)/g);
  parts.forEach(part => {
    if (part.startsWith('<strong>') && part.endsWith('</strong>')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(8, -9);
      element.appendChild(strong);
    } else {
      element.appendChild(document.createTextNode(part));
    }
  });
}

// =============================================
// CALCULATION ENGINE
// =============================================

/**
 * Recalculates user carbon scores across all categories.
 * @returns {Object} Recalculated state scores.
 */
function calculateScores() {
  const t = state.transport;
  const h = state.home;
  const f = state.food;
  const g = state.goods;

  // Transport (tonnes CO2/year)
  let transport = 0;
  transport += t.car * CO2_FACTORS.carKmPerWeek * 52;
  transport += t.flights * CO2_FACTORS.flightShortHaul;
  // Apply cycling and transit credit using defined constants
  transport = Math.max(0, transport + t.transit * CO2_FACTORS.transitDaysPerWeek + t.cycle * CO2_FACTORS.cycleDaysPerWeek);

  // Home Energy (tonnes CO2/year)
  const solarFactor = 1 - clamp(parseFloat(h.solar ?? 0), 0, 1);
  let home = 0;
  home += h.electricity * CO2_FACTORS.electricityKwh * 12 * solarFactor;
  home += h.gas * CO2_FACTORS.gasM3 * 12;

  // Food (tonnes CO2/year)
  let food = 0;
  food += clamp(parseFloat(f.diet ?? 2.5), 0, 10);
  food *= (1 - (clamp(f.local, 0, 100) / 100) * 0.1);  // local food reduces 10%
  food += clamp(parseFloat(f.waste ?? 0.1), 0, 5);

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

let earthAnimFrame = null;
let earthRotation = 0;
let isEarthAnimating = false;

/**
 * Determines planet health status state.
 * @param {number} totalCO2 - User's total annual carbon footprint in tonnes.
 * @returns {string} Status string.
 */
function getEarthHealthState(totalCO2) {
  if (totalCO2 < 2) return 'excellent';
  if (totalCO2 < 4) return 'good';
  if (totalCO2 < 7) return 'warning';
  if (totalCO2 < 10) return 'bad';
  return 'critical';
}

/**
 * Draws the animated Earth icon dynamically reflecting health.
 * @param {number} totalCO2 - User's total carbon emissions.
 */
function drawEarth(totalCO2) {
  const canvas = DOM.earthCanvas;
  const ctx = DOM.earthCtx;
  if (!canvas || !ctx) return;

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

/**
 * Earth drawing loop handler.
 */
function animateEarth() {
  if (!state.earthVisible) {
    isEarthAnimating = false;
    return;
  }
  isEarthAnimating = true;
  drawEarth(state.scores.total);
  earthAnimFrame = requestAnimationFrame(animateEarth);
}

// =============================================
// PARTICLE SYSTEM (CO2 particles)
// =============================================

let particleAnimFrame = null;
let isParticlesAnimating = false;

/**
 * Initializes the particle overlay dimensions.
 */
function initParticleCanvas() {
  const canvas = DOM.particleCanvas;
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

/**
 * Spawns a floating particle element.
 * @param {number} co2Level - The current score.
 * @returns {Object} Particle configuration.
 */
function createParticle(co2Level) {
  const canvas = DOM.particleCanvas;
  const width = canvas ? canvas.width : 300;
  const height = canvas ? canvas.height : 250;
  const spread = co2Level / 20;
  return {
    x: width * 0.35 + (Math.random() - 0.5) * 80 * spread,
    y: height * 0.7,
    vx: (Math.random() - 0.5) * 0.5 * spread,
    vy: -(Math.random() * 1.5 + 0.3) * (0.3 + spread),
    alpha: 0.6 + Math.random() * 0.3,
    size: Math.random() * 4 + 1.5,
    life: 0,
    maxLife: 120 + Math.random() * 80,
    color: co2Level > 8 ? 'rgba(239, 68, 68,' : co2Level > 4 ? 'rgba(245, 158, 11,' : 'rgba(0, 229, 160,',
  };
}

/**
 * Updates particle physics.
 */
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

/**
 * Renders particles onto the canvas.
 */
function drawParticles() {
  const canvas = DOM.particleCanvas;
  const ctx = DOM.particleCtx;
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.particleSystem.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `${p.color}${p.alpha.toFixed(2)})`;
    ctx.fill();

    // "CO₂" text on some particles
    if (p.size > 3 && p.life % 40 === 0) {
      ctx.font = '8px Outfit';
      ctx.fillStyle = `${p.color}${(p.alpha * 0.8).toFixed(2)})`;
      ctx.fillText('CO₂', p.x + 4, p.y - 4);
    }
  });
}

/**
 * Particle system loop runner.
 */
function animateParticles() {
  if (!state.particlesVisible) {
    isParticlesAnimating = false;
    return;
  }
  isParticlesAnimating = true;
  updateParticles();
  drawParticles();
  particleAnimFrame = requestAnimationFrame(animateParticles);
}

// =============================================
// GAUGE CANVAS
// =============================================

/**
 * Draws the dashboard semi-circular gauge chart.
 * @param {number} value - The carbon value to plot.
 */
function drawGauge(value) {
  const canvas = DOM.gaugeCanvas;
  const ctx = DOM.gaugeCtx;
  if (!canvas || !ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h - 10;
  const r = Math.min(w, h * 1.6) / 2 - 12;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const valueAngle = startAngle + (clamp(value, 0, MAX_GAUGE) / MAX_GAUGE) * Math.PI;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Gradient arc
  const pct = clamp(value / MAX_GAUGE, 0, 1);
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

/**
 * Updates the gauge widget display.
 * @param {Object} scores - Current scores model.
 */
function updateGaugeDisplay(scores) {
  const val = scores.total;
  drawGauge(val);

  if (DOM.gaugeValue) {
    DOM.gaugeValue.textContent = val.toFixed(1);
  }

  // Label color/text
  if (DOM.gaugeLabel) {
    let labelClass, labelText;
    if (val < 2) { labelClass = 'health-great'; labelText = '🌿 Excellent'; }
    else if (val < 4) { labelClass = 'health-great'; labelText = '👍 Good'; }
    else if (val < 7) { labelClass = 'health-ok'; labelText = '⚠️ Average'; }
    else { labelClass = 'health-bad'; labelText = '🔴 High Impact'; }

    DOM.gaugeLabel.className = `gauge-label ${labelClass}`;
    DOM.gaugeLabel.textContent = labelText;
  }

  // User comparison bar
  if (DOM.barUser && DOM.cmpUser) {
    const barPct = clamp((val / (GLOBAL_AVG * 2.1)) * 100, 0, 100);
    DOM.barUser.style.width = `${barPct}%`;
    DOM.cmpUser.textContent = formatTonnes(val);
  }
}

/**
 * Updates the category carbon breakdown bar chart.
 * @param {Object} scores - The categories score model.
 */
function updateBreakdownChart(scores) {
  const max = Math.max(scores.total, GLOBAL_AVG, 0.1);
  const ids = ['transport', 'home', 'food', 'goods'];

  ids.forEach(cat => {
    const val = scores[cat];
    const pct = clamp((val / max) * 85, 0, 100);
    const barEl = DOM[`bar${cat.charAt(0).toUpperCase() + cat.slice(1)}`];
    const valEl = DOM[`val${cat.charAt(0).toUpperCase() + cat.slice(1)}Co2`];
    if (barEl) barEl.style.width = `${pct}%`;
    if (valEl) valEl.textContent = formatTonnes(val);
  });
}

/**
 * Re-evaluates planet health scores and shifts Earth glow effects.
 * @param {Object} scores - The carbon scores.
 */
function updatePlanetMirror(scores) {
  const total = scores.total;

  if (DOM.planetCo2Val) {
    DOM.planetCo2Val.textContent = total.toFixed(1) + 't';
  }

  const trees = total > 0 ? Math.ceil(total / TREE_ABSORB_PER_YEAR) : 0;
  if (DOM.planetTreesVal) {
    DOM.planetTreesVal.textContent = trees.toLocaleString();
  }

  // Health badge
  const badge = DOM.healthStatusBadge;
  const icon = DOM.healthBadgeIcon;
  const text = DOM.healthBadgeText;

  if (badge && icon && text) {
    badge.className = 'health-status-badge';
    if (total === 0) { badge.classList.add('health-great'); icon.textContent = '🌿'; text.textContent = 'Start Tracking'; }
    else if (total < 2) { badge.classList.add('health-great'); icon.textContent = '🌟'; text.textContent = 'Carbon Hero'; }
    else if (total < 4) { badge.classList.add('health-great'); icon.textContent = '✅'; text.textContent = 'Doing Well'; }
    else if (total < 7) { badge.classList.add('health-ok'); icon.textContent = '⚠️'; text.textContent = 'Average'; }
    else if (total < 10) { badge.classList.add('health-bad'); icon.textContent = '🔴'; text.textContent = 'High Impact'; }
    else { badge.classList.add('health-bad'); icon.textContent = '🚨'; text.textContent = 'Critical'; }
  }

  // Earth glow shadow
  if (DOM.earthCanvas) {
    const health = getEarthHealthState(total);
    const glowMap = { excellent: 'rgba(0,229,160,0.6)', good: 'rgba(0,229,160,0.3)', warning: 'rgba(245,158,11,0.5)', bad: 'rgba(239,68,68,0.5)', critical: 'rgba(127,29,29,0.7)' };
    DOM.earthCanvas.style.filter = `drop-shadow(0 0 ${total > 0 ? 40 : 20}px ${glowMap[health]})`;
  }
}

/**
 * Evaluates insights logic and lists top eco insights.
 * Uses programmatic DOM element creation to maintain strict security profiles.
 * @param {Object} scores - The carbon scores.
 */
function updateInsights(scores) {
  const list = DOM.insightList;
  if (!list) return;

  const applicable = INSIGHTS_DB.filter(ins => ins.trigger(state));
  const shown = applicable.slice(0, 4);

  list.replaceChildren(); // Safe DOM clear API
  if (shown.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'text-align:center; color: var(--text-muted); padding: 24px; font-size: 0.85rem;';
    emptyMsg.textContent = '🌱 Start tracking your emissions to get personalized insights!';
    list.appendChild(emptyMsg);
    return;
  }

  shown.forEach((ins, i) => {
    const el = document.createElement('div');
    el.className = 'insight-item';
    el.style.animationDelay = `${i * 0.08}s`;
    el.setAttribute('role', 'listitem');

    const iconEl = document.createElement('div');
    iconEl.className = 'insight-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = ins.icon;

    const contentEl = document.createElement('div');
    contentEl.className = 'insight-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'insight-title';
    titleEl.textContent = ins.title;

    const descEl = document.createElement('div');
    descEl.className = 'insight-desc';
    descEl.textContent = ins.desc;

    contentEl.appendChild(titleEl);
    contentEl.appendChild(descEl);

    const savingEl = document.createElement('div');
    savingEl.className = 'insight-saving';
    savingEl.setAttribute('title', 'Estimated annual CO₂ saving');
    savingEl.textContent = ins.saving;

    el.appendChild(iconEl);
    el.appendChild(contentEl);
    el.appendChild(savingEl);

    list.appendChild(el);
  });
}

/**
 * Calculates tree equivalents, offset costs, and populates the offset visual.
 * @param {Object} scores - User scores.
 */
function updateOffsetCalculator(scores) {
  const total = scores.total;
  const trees = total > 0 ? Math.ceil(total / TREE_ABSORB_PER_YEAR) : 0;
  const months = total > 0 ? Math.ceil((total / GLOBAL_AVG) * 12) : 0;
  const cost = Math.ceil(total * OFFSET_COST_PER_TONNE);
  const flightsToSkip = total > 0 ? Math.ceil(total / CO2_FACTORS.flightShortHaul) : 0;
  const meatDays = total > 0 ? Math.ceil((total * 0.4) / 0.005) : 0;

  if (DOM.treesCount) DOM.treesCount.textContent = trees.toLocaleString();
  if (DOM.offsetMonths) DOM.offsetMonths.textContent = months;
  if (DOM.offsetCost) DOM.offsetCost.textContent = `$${cost}`;
  if (DOM.offsetFlightsAvoided) DOM.offsetFlightsAvoided.textContent = flightsToSkip;
  if (DOM.offsetMeatDays) DOM.offsetMeatDays.textContent = meatDays.toLocaleString();

  // Tree row visualization (show up to 30 trees)
  const treeRow = DOM.treeRow;
  if (treeRow) {
    treeRow.replaceChildren(); // Safe DOM clear
    const displayTrees = Math.min(trees, 30);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < displayTrees; i++) {
      const span = document.createElement('span');
      span.className = 'tree-emoji';
      span.textContent = '🌳';
      span.style.animationDelay = `${i * 0.04}s`;
      fragment.appendChild(span);
    }
    if (trees > 30) {
      const more = document.createElement('span');
      more.textContent = ` +${(trees - 30).toLocaleString()} more`;
      more.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); align-self: center;';
      fragment.appendChild(more);
    }
    treeRow.appendChild(fragment);
  }
}

// =============================================
// BADGES SYSTEM
// =============================================

/**
 * Checks and updates achievements list safely.
 * @param {Object} scores - The carbon scores.
 */
function updateBadges(scores) {
  const grid = DOM.badgesGrid;
  if (!grid) return;

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

  // Render grid using safe DOM methods
  grid.replaceChildren();
  BADGES.forEach((badge, i) => {
    const isUnlocked = state.unlockedBadges.has(badge.id);
    const el = document.createElement('div');
    el.className = `badge-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-label', `${badge.name}: ${isUnlocked ? 'Unlocked' : 'Locked'}`);
    el.style.animationDelay = `${i * 0.05}s`;

    const iconEl = document.createElement('div');
    iconEl.className = 'badge-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = badge.icon;

    const nameEl = document.createElement('div');
    nameEl.className = 'badge-name';
    nameEl.textContent = badge.name;

    const statusEl = document.createElement('div');
    statusEl.className = 'badge-unlock-tag';
    if (isUnlocked) {
      statusEl.textContent = '✓ Unlocked';
    } else {
      statusEl.textContent = 'Locked';
      statusEl.style.color = 'var(--text-muted)';
    }

    el.appendChild(iconEl);
    el.appendChild(nameEl);
    el.appendChild(statusEl);

    grid.appendChild(el);
  });
}

// =============================================
// STREAK SYSTEM
// =============================================

/**
 * Initializes and computes visit streak counters.
 */
function initStreak() {
  try {
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
  } catch (err) {
    console.warn('LocalStorage API unavailable, local streak metrics disabled.', err);
    state.streak = 1;
  }

  updateStreakDisplay();
}

/**
 * Updates streak interface counters.
 */
function updateStreakDisplay() {
  if (DOM.streakCount) {
    DOM.streakCount.textContent = state.streak;
  }
  if (DOM.streakDaysNext) {
    const daysToNext = 7 - (state.streak % 7);
    DOM.streakDaysNext.textContent = `${daysToNext} day${daysToNext !== 1 ? 's' : ''}`;
  }
}

// =============================================
// MAIN UPDATE FUNCTION
// =============================================

/**
 * Redraws and updates dashboard calculations.
 */
function updateAll() {
  const scores = calculateScores();
  updateGaugeDisplay(scores);
  updateBreakdownChart(scores);
  updatePlanetMirror(scores);
  updateInsights(scores);
  updateOffsetCalculator(scores);
  updateBadges(scores);
}

/**
 * Debounced wrapper for recalculations.
 */
const debouncedUpdateAll = debounce(updateAll, 100);

// =============================================
// TRACKER INPUTS — Wire Up Sliders
// =============================================

/**
 * Configures event binding and updates for range slider elements.
 * @param {string} id - Range input element identifier.
 * @param {string} stateKey - Master category state key.
 * @param {string} stateSubKey - Category parameter.
 * @param {string} displayId - Value label display element.
 * @param {Function} formatFn - Display formatter.
 */
function setupSlider(id, stateKey, stateSubKey, displayId, formatFn) {
  const el = document.getElementById(id);
  const disp = document.getElementById(displayId);
  if (!el || !disp) return;

  el.addEventListener('input', () => {
    const val = parseFloat(el.value);
    // Sanity range check
    if (!isNaN(val)) {
      state[stateKey][stateSubKey] = val;
      disp.textContent = formatFn(val);
      el.setAttribute('aria-valuenow', val);
      debouncedUpdateAll();
    }
  });
}

/**
 * Configures event binding for selector elements.
 * @param {string} id - Select element identifier.
 * @param {string} stateKey - Master category state key.
 * @param {string} stateSubKey - Category parameter.
 * @param {string} displayId - Value label display element.
 * @param {Function} formatFn - Display formatter.
 */
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

/**
 * Boots range sliders and bindings.
 */
function setupInputs() {
  // Transport
  setupSlider('slider-car', 'transport', 'car', 'val-car', v => `${v} km`);
  setupSlider('slider-flights', 'transport', 'flights', 'val-flights', v => v);
  setupSlider('slider-transit', 'transport', 'transit', 'val-transit', v => `${v} days`);
  setupSlider('slider-cycle', 'transport', 'cycle', 'val-cycle', v => `${v} days`);

  // Home
  setupSlider('slider-electricity', 'home', 'electricity', 'val-electricity', v => `${v} kWh`);
  setupSlider('slider-gas', 'home', 'gas', 'val-gas', v => `${v} m³`);
  setupSelect('select-solar', 'home', 'solar', 'val-solar', t => t.split(' ')[0] || 'None');

  // Food
  setupSelect('select-diet', 'food', 'diet', 'val-diet', t => t.split(' ')[0]);
  setupSlider('slider-local', 'food', 'local', 'val-local', v => `${v}%`);
  setupSelect('select-waste', 'food', 'waste', 'val-waste', t => t.split('—')[0].trim());

  // Goods
  setupSlider('slider-clothing', 'goods', 'clothing', 'val-clothing', v => v);
  setupSlider('slider-electronics', 'goods', 'electronics', 'val-electronics', v => v);
  setupSlider('slider-orders', 'goods', 'orders', 'val-orders', v => v);
}

// =============================================
// TABS
// =============================================

/**
 * Boots tabs controls.
 */
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
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });
}

// =============================================
// CLIMATE PROJECTION MODAL
// =============================================

/**
 * Renders the 50-year forecasting summary.
 */
function showClimateModal() {
  const total = state.scores.total;
  const modal = DOM.modalOverlay;
  if (!modal) return;

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
      message: `🎉 <strong>Incredible!</strong> Your footprint of ${total.toFixed(1)}t CO₂/year is well below the Paris 2030 target of 2.0t. If everyone lived like you, global temperatures would remain stable. You're a genuine climate champion. Keep sharing your lifestyle choices — they inspire others to follow!`,
    },
    good: {
      emoji: '🌎',
      temp2050: '+1.4°C',
      temp2075: '+1.8°C',
      desc2050: 'Near target',
      desc2075: 'Mild impacts',
      color2050: 'var(--primary)',
      color2075: 'var(--sky)',
      message: `✅ <strong>Great progress!</strong> At ${total.toFixed(1)}t CO₂/year, you're below the global average of 4.7t. Small reductions — like fewer flights or more plant-based meals — could bring you under the 2030 Paris target. You're on the right track!`,
    },
    warning: {
      emoji: '🌏',
      temp2050: '+1.8°C',
      temp2075: '+2.6°C',
      desc2050: 'Moderate stress',
      desc2075: 'Serious impacts',
      color2050: 'var(--warning)',
      color2075: 'var(--warning)',
      message: `⚠️ <strong>Action needed.</strong> Your footprint of ${total.toFixed(1)}t CO₂/year is near the global average. By 2075, if current trends continue, we'd see increased extreme weather events, coastal flooding, and biodiversity loss. Switching to a more plant-based diet and reducing car travel could cut your footprint by up to 40%.`,
    },
    bad: {
      emoji: '🟠',
      temp2050: '+2.3°C',
      temp2075: '+3.4°C',
      desc2050: 'Severe stress',
      desc2075: 'Crisis level',
      color2050: 'var(--danger)',
      color2075: 'var(--danger)',
      message: `🔴 <strong>High impact detected.</strong> At ${total.toFixed(1)}t CO₂/year, your footprint is ${(total / GLOBAL_AVG * 100 - 100).toFixed(0)}% above the global average. At this rate, global temperatures could rise 3°C+ by 2100 — triggering irreversible tipping points: melting ice sheets, ocean acidification, and mass extinction events. Immediate lifestyle changes could dramatically reduce your impact.`,
    },
    critical: {
      emoji: '🔴',
      temp2050: '+2.8°C',
      temp2075: '+4.1°C',
      desc2050: 'Emergency',
      desc2075: 'Catastrophic',
      color2050: '#7f1d1d',
      color2075: '#7f1d1d',
      message: `🚨 <strong>Critical footprint.</strong> Your current emissions of ${total.toFixed(1)}t CO₂/year are ${Math.round(total / GLOBAL_AVG)}× the global average. Projections at this trajectory show catastrophic temperature rises by 2075 — severe food and water scarcity, displacement of billions, and collapse of major ecosystems. Urgent action is possible: transportation and diet changes alone could cut your footprint by over 60%.`,
    },
  };

  const proj = projections[health] || projections.warning;

  if (DOM.modalEarthEmoji) DOM.modalEarthEmoji.textContent = proj.emoji;
  if (DOM.modal2025Temp) DOM.modal2025Temp.style.color = 'var(--primary)';
  if (DOM.modal2050Temp) {
    DOM.modal2050Temp.textContent = proj.temp2050;
    DOM.modal2050Temp.style.color = proj.color2050;
  }
  if (DOM.modal2075Temp) {
    DOM.modal2075Temp.textContent = proj.temp2075;
    DOM.modal2075Temp.style.color = proj.color2075;
  }
  if (DOM.modal2050Desc) DOM.modal2050Desc.textContent = proj.desc2050;
  if (DOM.modal2075Desc) DOM.modal2075Desc.textContent = proj.desc2075;
  if (DOM.modalMessage) {
    setSafeMessage(DOM.modalMessage, proj.message);
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Closes the modal.
 */
function closeModal() {
  if (DOM.modalOverlay) {
    DOM.modalOverlay.classList.remove('open');
  }
  document.body.style.overflow = '';
}

/**
 * Configures modal bindings.
 */
function setupModal() {
  if (DOM.earthCanvas) {
    DOM.earthCanvas.addEventListener('click', showClimateModal);
    DOM.earthCanvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showClimateModal(); });
  }

  if (DOM.modalClose) DOM.modalClose.addEventListener('click', closeModal);
  if (DOM.modalCloseBtn) DOM.modalCloseBtn.addEventListener('click', closeModal);
  if (DOM.modalOverlay) {
    DOM.modalOverlay.addEventListener('click', e => {
      if (e.target === DOM.modalOverlay) closeModal();
    });
  }

  if (DOM.modalActionBtn) {
    DOM.modalActionBtn.addEventListener('click', () => {
      closeModal();
      const panelTrans = document.getElementById('panel-transport');
      if (panelTrans) panelTrans.classList.add('active');
      document.querySelectorAll('.tracker-panel').forEach(p => {
        if (p.id !== 'panel-transport') p.classList.remove('active');
      });
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'transport');
      });
      const trackerCard = document.querySelector('.tracker-card');
      if (trackerCard) trackerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// =============================================
// NAV BUTTONS
// =============================================

/**
 * Configures headers and buttons scrolling.
 */
function setupNav() {
  if (DOM.navInsights) {
    DOM.navInsights.addEventListener('click', () => {
      const insightsSect = document.getElementById('insights-section');
      if (insightsSect) insightsSect.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (DOM.navOffset) {
    DOM.navOffset.addEventListener('click', () => {
      const offsetSect = document.getElementById('offset-section');
      if (offsetSect) offsetSect.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (DOM.navDashboard) {
    DOM.navDashboard.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (DOM.heroCalculateBtn) {
    DOM.heroCalculateBtn.addEventListener('click', () => {
      const trackerCard = document.querySelector('.tracker-card');
      if (trackerCard) trackerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (DOM.heroLearnBtn) {
    DOM.heroLearnBtn.addEventListener('click', () => {
      const planetSect = document.getElementById('planet-section');
      if (planetSect) planetSect.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// =============================================
// RESIZE HANDLER
// =============================================

/**
 * Handles resize adjustments dynamically.
 */
function handleResize() {
  initParticleCanvas();
}

// =============================================
// SCROLL ANIMATION (Intersection Observer)
// =============================================

/**
 * Triggers fade effects dynamically when scrolled into screen viewports.
 */
function setupScrollAnimations() {
  try {
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
  } catch (err) {
    console.warn('Scroll animations not fully supported in this browser.', err);
  }
}

// =============================================
// DEMO: Pre-fill with sample data
// =============================================

/**
 * Fills inputs with default dummy profiles.
 */
function loadSampleData() {
  const carSlider = document.getElementById('slider-car');
  const flightsSlider = document.getElementById('slider-flights');
  const electricitySlider = document.getElementById('slider-electricity');
  const gasSlider = document.getElementById('slider-gas');

  if (carSlider) { carSlider.value = 250; state.transport.car = 250; const d = document.getElementById('val-car'); if (d) d.textContent = '250 km'; }
  if (flightsSlider) { flightsSlider.value = 3; state.transport.flights = 3; const d = document.getElementById('val-flights'); if (d) d.textContent = '3'; }
  if (electricitySlider) { electricitySlider.value = 450; state.home.electricity = 450; const d = document.getElementById('val-electricity'); if (d) d.textContent = '450 kWh'; }
  if (gasSlider) { gasSlider.value = 80; state.home.gas = 80; const d = document.getElementById('val-gas'); if (d) d.textContent = '80 m³'; }

  const dietSelect = document.getElementById('select-diet');
  if (dietSelect) { dietSelect.value = '2.5'; state.food.diet = 2.5; const d = document.getElementById('val-diet'); if (d) d.textContent = 'Average'; }
  const localSlider = document.getElementById('slider-local');
  if (localSlider) { localSlider.value = 20; state.food.local = 20; const d = document.getElementById('val-local'); if (d) d.textContent = '20%'; }

  const clothingSlider = document.getElementById('slider-clothing');
  if (clothingSlider) { clothingSlider.value = 20; state.goods.clothing = 20; const d = document.getElementById('val-clothing'); if (d) d.textContent = '20'; }
  const ordersSlider = document.getElementById('slider-orders');
  if (ordersSlider) { ordersSlider.value = 8; state.goods.orders = 8; const d = document.getElementById('val-orders'); if (d) d.textContent = '8'; }

  updateAll();
}

// =============================================
// INIT
// =============================================

/**
 * Main application initialization.
 */
function init() {
  cacheDOMElements();
  setupInputs();
  setupTabs();
  setupModal();
  setupNav();

  initParticleCanvas();

  // Setup IntersectionObservers to throttle animations when canvases are offscreen
  try {
    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.target === DOM.earthCanvas) {
          state.earthVisible = entry.isIntersecting;
          if (state.earthVisible && !isEarthAnimating) {
            animateEarth();
          }
        } else if (entry.target === DOM.particleCanvas) {
          state.particlesVisible = entry.isIntersecting;
          if (state.particlesVisible && !isParticlesAnimating) {
            animateParticles();
          }
        }
      });
    }, { threshold: 0.1 });

    if (DOM.earthCanvas) visibilityObserver.observe(DOM.earthCanvas);
    if (DOM.particleCanvas) visibilityObserver.observe(DOM.particleCanvas);
  } catch (err) {
    console.warn('Canvas Visibility Observer failed to initialize, running fallback loop.', err);
    state.earthVisible = true;
    state.particlesVisible = true;
    animateEarth();
    animateParticles();
  }

  // Initial draw loops if supported
  if (isEarthAnimating === false && state.earthVisible) animateEarth();
  if (isParticlesAnimating === false && state.particlesVisible) animateParticles();

  updateAll();
  initStreak();

  setTimeout(setupScrollAnimations, 100);
  setTimeout(loadSampleData, 600);

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
}

// Bind load listener if in browser environment
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

// Node.js module exports for compatibility with automated testing suites
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    calculateScores,
    CO2_FACTORS,
    BADGES,
    INSIGHTS_DB
  };
}
