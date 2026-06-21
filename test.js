// Mock DOM environments for Node.js
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.document = {
  addEventListener: () => {},
  getElementById: () => ({
    addEventListener: () => {},
    getContext: () => ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      moveTo: () => {},
      lineTo: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      clip: () => {},
      fillRect: () => {},
      ellipse: () => {},
      scale: () => {},
      rotate: () => {},
      translate: () => {},
      fillText: () => {}
    }),
    parentElement: {
      getBoundingClientRect: () => ({ width: 400, height: 400 })
    },
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    options: [
      { text: 'None' },
      { text: 'Partial' },
      { text: 'Mostly' },
      { text: '100%' }
    ],
    selectedIndex: 0,
    value: '0',
    scrollIntoView: () => {}
  }),
  querySelectorAll: () => [
    {
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {}
    }
  ],
  createElement: () => ({
    style: {},
    classList: { add: () => {} },
    setAttribute: () => {},
    appendChild: () => {}
  }),
  body: { style: {} }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.requestAnimationFrame = () => {};
global.IntersectionObserver = class {
  observe() {}
};

// Import app.js
const app = require('./app.js');

// Simple test framework
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${message}`);
    passed++;
  } else {
    console.error(`\x1b[31m✘ FAIL\x1b[0m: ${message}`);
    failed++;
  }
}

console.log('Running EcoMirror Carbon Footprint Unit Tests...');

try {
  // Test Case 1: Initial state calculation
  app.state.transport = { car: 0, flights: 0, transit: 0, cycle: 0 };
  app.state.home = { electricity: 0, gas: 0, solar: 0 };
  app.state.food = { diet: 0, local: 0, waste: 0 };
  app.state.goods = { clothing: 0, electronics: 0, orders: 0 };
  
  let scores = app.calculateScores();
  assert(scores.total === 0, 'Total score for zero inputs is 0');
  assert(scores.transport === 0, 'Transport score for zero inputs is 0');
  assert(scores.home === 0, 'Home score for zero inputs is 0');
  assert(scores.food === 0, 'Food score for zero inputs is 0');
  assert(scores.goods === 0, 'Goods score for zero inputs is 0');

  // Test Case 2: Standard calculations check
  app.state.transport = { car: 100, flights: 2, transit: 0, cycle: 0 }; // 100 * 0.00021 * 52 = 1.092; 2 * 0.255 = 0.51; total = 1.602
  app.state.home = { electricity: 300, gas: 50, solar: 0 }; // 300 * 0.000233 * 12 = 0.8388; 50 * 0.00202 * 12 = 1.212; total = 2.0508
  app.state.food = { diet: 2.5, local: 0, waste: 0.1 }; // diet 2.5 + waste 0.1 = 2.6
  app.state.goods = { clothing: 10, electronics: 1, orders: 5 }; // 10 * 0.025 = 0.25; 1 * 0.3 = 0.3; 5 * 0.003 * 12 = 0.18; total = 0.73
  
  scores = app.calculateScores();
  const expectedTransport = 100 * app.CO2_FACTORS.carKmPerWeek * 52 + 2 * app.CO2_FACTORS.flightShortHaul; // 1.602
  assert(Math.abs(scores.transport - expectedTransport) < 0.0001, `Transport score calculation matches expected: ${scores.transport}`);
  
  const expectedHome = 300 * app.CO2_FACTORS.electricityKwh * 12 + 50 * app.CO2_FACTORS.gasM3 * 12; // 2.0508
  assert(Math.abs(scores.home - expectedHome) < 0.0001, `Home score calculation matches expected: ${scores.home}`);

  // Test Case 3: Food waste values validation
  app.state.food = { diet: 2.5, local: 50, waste: 0.3 }; // local reduces diet value by 10% * 50% = 5%; diet = 2.5 * 0.95 = 2.375; total = 2.375 + 0.3 = 2.675
  scores = app.calculateScores();
  assert(Math.abs(scores.food - 2.675) < 0.0001, `Food score calculation with local adjustment matches expected: ${scores.food}`);

  // Test Case 4: Transit/Cycle credits
  app.state.transport = { car: 100, flights: 0, transit: 5, cycle: 5 };
  scores = app.calculateScores();
  // Credits should be subtracted (since factor is negative, addition subtracted it)
  // Let's check with the constants factor credits.
  const credit = 5 * Math.abs(app.CO2_FACTORS.transitDaysPerWeek) + 5 * Math.abs(app.CO2_FACTORS.cycleDaysPerWeek);
  const expectedTransWithCredits = Math.max(0, 100 * app.CO2_FACTORS.carKmPerWeek * 52 - credit);
  assert(Math.abs(scores.transport - expectedTransWithCredits) < 0.0001, `Transport calculation includes correct transit/cycling credits: ${scores.transport}`);

} catch (err) {
  console.error('Test execution failed with error:', err);
  failed++;
}

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed successfully!');
  process.exit(0);
}
