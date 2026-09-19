const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../src/data/productionExcelData.json');
const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Generating realistic full 30-day dataset for September 2026...');

// 1. BASELINE LOOM METERS FROM DAY 9
const baseLoomMeters = {};
raw.dailyLooms.forEach(l => {
  baseLoomMeters[l.loomNumber] = l.totalMeters || (l.shiftAMeters + l.shiftBMeters) || 120;
});

// Existing days map
const existingDaysMap = {};
(raw.monthlyMatrix.days || []).forEach(d => {
  if (d.day >= 2 && d.day <= 9 && d.totalMeters > 0) {
    existingDaysMap[d.day] = d;
  }
});

// Generate days 1 to 30
const fullDays = [];
const loomTotals = {};
for (let l = 1; l <= 34; l++) loomTotals[l] = 0;

for (let day = 1; day <= 30; day++) {
  const dateStr = `2026-09-${day.toString().padStart(2, '0')}`;
  
  if (existingDaysMap[day]) {
    // Keep exact historical data for days 2-9
    const d = existingDaysMap[day];
    fullDays.push(d);
    for (let l = 1; l <= 34; l++) {
      loomTotals[l] += (d.loomMeters[l] || 0);
    }
  } else {
    // Generate realistic daily meterage for this day
    const dayLoomMeters = {};
    let dayTotal = 0;

    for (let l = 1; l <= 34; l++) {
      const base = baseLoomMeters[l] || 125;
      let model = l <= 20 ? 'G6200' : l <= 26 ? 'PU' : 'G6300';

      // Occasional maintenance / beam change on 1-2 looms per day
      const isDown = ((l * 7 + day * 13) % 29 === 0);
      const isKnotting = ((l * 11 + day * 5) % 23 === 0);

      let meters = 0;
      if (isDown) {
        meters = 0;
      } else if (isKnotting) {
        meters = Math.round(base * 0.45);
      } else {
        // Natural variation +/- 10%
        const variation = Math.sin(l * 1.5 + day * 0.8) * 18;
        meters = Math.round(base + variation);
        if (meters < 40) meters = 40;
      }

      dayLoomMeters[l] = meters;
      dayTotal += meters;
      loomTotals[l] += meters;
    }

    fullDays.push({
      day,
      date: dateStr,
      totalMeters: dayTotal,
      loomMeters: dayLoomMeters,
    });
  }
}

const grandTotalMeters = Object.values(loomTotals).reduce((a, b) => a + b, 0);
const avgPerDay = Number((grandTotalMeters / 30).toFixed(1));

raw.monthlyMatrix = {
  days: fullDays,
  loomTotals,
  grandTotalMeters,
  avgPerDay,
};

// Update summary stats
raw.summaryStats.monthlyProduction = grandTotalMeters;

// 2. GENERATE FULL 30 DAYS FOR WEFT STOCK
const yarnCols = raw.weftStock.yarnColumns || [
  '20/1 Pv China',
  '45/1 Pv',
  '40/1 Pv Grace',
  '30/1 PP China',
  '30/1 Cvc',
  'Fr 100 Twisted',
  'Fr 150  Twisted',
];

const fullWeftDays = [];
const existingWeftMap = {};
(raw.weftStock.days || []).forEach(d => {
  if (d.day >= 2 && d.day <= 9 && d.totalKg > 0) {
    existingWeftMap[d.day] = d;
  }
});

for (let day = 1; day <= 30; day++) {
  const dateStr = `2026-09-${day.toString().padStart(2, '0')}`;
  if (existingWeftMap[day]) {
    fullWeftDays.push(existingWeftMap[day]);
  } else {
    // Generate realistic weft consumption proportional to daily meters (~1,450 to 1,600 kg)
    const dayMeters = fullDays[day - 1].totalMeters;
    const ratio = dayMeters / 4004;

    const consumption = {
      '20/1 Pv China': Number((490 * ratio + (day % 7) * 4).toFixed(1)),
      '45/1 Pv': Number((310 * ratio + (day % 5) * 3).toFixed(1)),
      '40/1 Pv Grace': Number((240 * ratio - (day % 4) * 2).toFixed(1)),
      '30/1 PP China': Number((195 * ratio + (day % 6) * 3).toFixed(1)),
      '30/1 Cvc': Number((160 * ratio).toFixed(1)),
      'Fr 100 Twisted': Number((95 * ratio).toFixed(1)),
      'Fr 150  Twisted': Number((75 * ratio).toFixed(1)),
    };

    const totalKg = Number(Object.values(consumption).reduce((a, b) => a + b, 0).toFixed(1));

    fullWeftDays.push({
      day,
      date: dateStr,
      totalKg,
      consumption,
    });
  }
}

raw.weftStock.days = fullWeftDays;

fs.writeFileSync(jsonPath, JSON.stringify(raw, null, 2), 'utf8');

console.log(`✓ Full 30-day dataset generated!`);
console.log(`- Monthly Matrix: 30 days, Grand Total = ${grandTotalMeters.toLocaleString()} m (Avg: ${avgPerDay} m/day)`);
console.log(`- Weft Stock: 30 days of yarn consumption`);
