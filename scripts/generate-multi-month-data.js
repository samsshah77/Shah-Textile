const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../src/data/productionExcelData.json');
const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

/** Seed through this date only — managers start new days after it. */
const TODAY = process.env.PRODUCTION_TODAY || '2026-09-21';
const todayDay = Number(TODAY.slice(-2));
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const todayDayName = dayNames[new Date(`${TODAY}T12:00:00`).getDay()];

console.log(`Generating multi-month production dataset (2026-08-01 → ${TODAY})...`);

const qualitiesPool = [
  { qualityName: 'PARCOPV', fabricType: 'Suiting', warpYarn: '20/1-Pv-China', weftYarn: '20/1-Pv-China', reed: 120, pick: 60, width: 66, gsm: 1.77 },
  { qualityName: 'DESIGN-2x1', fabricType: 'Ribstop', warpYarn: '20/1-Pv-China', weftYarn: '20/1-Pv-China', reed: 66, pick: 53, width: 66, gsm: 2.04 },
  { qualityName: 'SILVER-SHINE', fabricType: 'Gabardine Suiting', warpYarn: '45/1-Pv-China', weftYarn: '45/1-Pv-China', reed: 120, pick: 95, width: 66, gsm: 1.26 },
  { qualityName: 'SEVEN ELEVEN', fabricType: 'Suiting', warpYarn: '20/1-Pv-China', weftYarn: '20/1-Pv-China', reed: 88, pick: 62, width: 66, gsm: 1.65 },
  { qualityName: 'EIFFEL TOWER', fabricType: 'Gabardine Suiting', warpYarn: '40/1-Pv-China', weftYarn: '40/1-Pv-China', reed: 110, pick: 78, width: 66, gsm: 1.45 },
];

const yarnCols = [
  '20/1 Pv China',
  '45/1 Pv',
  '40/1 Pv Grace',
  '30/1 PP China',
  '30/1 Cvc',
  'Fr 100 Twisted',
  'Fr 150  Twisted',
];

function generateLoomsForDate(dateStr, dayNum, loomMeters) {
  const looms = [];
  for (let i = 1; i <= 34; i++) {
    const q = qualitiesPool[(i + dayNum) % qualitiesPool.length];
    const model = i <= 20 ? 'G6200' : i <= 26 ? 'PU' : 'G6300';
    const rpm = i <= 20 ? 353 : i <= 26 ? 280 : 360;
    const totalM = loomMeters[i] !== undefined ? loomMeters[i] : 130;

    let shiftA = 0;
    let shiftB = 0;
    let status = 'RUNNING';
    let remarks = '';

    if (totalM === 0) {
      status = (i % 2 === 0) ? 'BEAM_END' : 'KNOTTING';
      remarks = status === 'BEAM_END' ? 'Beam End' : 'Knotting';
    } else {
      shiftA = Math.round(totalM * 0.52);
      shiftB = totalM - shiftA;
    }

    const runningHours = totalM === 0 ? 0 : 24;
    const theo24h = Number(((rpm * 60 * 24) / (q.pick * 39.3701)).toFixed(2));
    const runningTheo = Number(((rpm * 60 * runningHours) / (q.pick * 39.3701)).toFixed(2));
    const eff = runningTheo > 0 ? Number(((totalM / runningTheo) * 100).toFixed(2)) : 0;
    const loss = Math.max(0, Number((runningTheo - totalM).toFixed(2)));

    looms.push({
      loomNumber: i,
      model,
      qualityName: q.qualityName,
      fabricType: q.fabricType,
      warpYarn: q.warpYarn,
      weftYarn: q.weftYarn,
      rpm,
      reed: q.reed,
      pick: q.pick,
      width: q.width,
      gsm: q.gsm,
      rollerHours: 24,
      runningTheoretical: runningTheo,
      shiftAMeters: shiftA,
      shiftBMeters: shiftB,
      totalMeters: totalM,
      efficiencyRunning: eff,
      lossRunning: loss,
      theoretical24h: theo24h,
      efficiency24h: eff,
      loss24h: loss,
      remarks,
      lot: `Sw # 33${i % 5}`,
      status,
    });
  }
  return looms;
}

const dailyHistory = {};

// 1. AUGUST 2026 (full month)
console.log('Generating August 2026 (Days 1 to 31)...');
const augustDays = [];
const augustLoomTotals = {};
for (let l = 1; l <= 34; l++) augustLoomTotals[l] = 0;

const augustWeftDays = [];

for (let day = 1; day <= 31; day++) {
  const dateStr = `2026-08-${day.toString().padStart(2, '0')}`;
  const dayLoomMeters = {};
  let dayTotal = 0;

  for (let l = 1; l <= 34; l++) {
    const isDown = ((l * 9 + day * 7) % 31 === 0);
    const isKnotting = ((l * 5 + day * 11) % 27 === 0);

    let m = 0;
    if (isDown) {
      m = 0;
    } else if (isKnotting) {
      m = Math.round(55 + (l % 20));
    } else {
      const base = l <= 20 ? 195 : l <= 26 ? 175 : 215;
      const variation = Math.sin(l * 2.1 + day * 0.9) * 22;
      m = Math.round(base + variation);
      if (m < 50) m = 50;
    }

    dayLoomMeters[l] = m;
    dayTotal += m;
    augustLoomTotals[l] += m;
  }

  augustDays.push({
    day,
    date: dateStr,
    totalMeters: dayTotal,
    loomMeters: dayLoomMeters,
  });

  dailyHistory[dateStr] = generateLoomsForDate(dateStr, day, dayLoomMeters);

  const factor = dayTotal / 4600;
  const consumption = {
    '20/1 Pv China': Number((590 * factor + (day % 7) * 4).toFixed(1)),
    '45/1 Pv': Number((370 * factor + (day % 5) * 3).toFixed(1)),
    '40/1 Pv Grace': Number((280 * factor + (day % 4) * 3).toFixed(1)),
    '30/1 PP China': Number((230 * factor + (day % 6) * 2).toFixed(1)),
    '30/1 Cvc': Number((190 * factor + (day % 3) * 2).toFixed(1)),
    'Fr 100 Twisted': Number((112 * factor + (day % 5)).toFixed(1)),
    'Fr 150  Twisted': Number((88 * factor + (day % 4)).toFixed(1)),
  };
  const totalKg = Number(Object.values(consumption).reduce((a, b) => a + b, 0).toFixed(1));

  augustWeftDays.push({
    day,
    date: dateStr,
    totalKg,
    consumption,
  });
}

const augustGrandTotal = Object.values(augustLoomTotals).reduce((a, b) => a + b, 0);

raw.augustMatrix = {
  days: augustDays,
  loomTotals: augustLoomTotals,
  grandTotalMeters: augustGrandTotal,
  avgPerDay: Number((augustGrandTotal / 31).toFixed(1)),
};

raw.augustWeftStock = {
  yarnColumns: yarnCols,
  days: augustWeftDays,
};

// 2. SEPTEMBER 2026 — only through TODAY (not full month)
console.log(`Generating September 2026 daily histories (Days 1 to ${todayDay})...`);

const sepDaysSource = (raw.monthlyMatrix && raw.monthlyMatrix.days) || [];
const sepDaysFiltered = [];
const sepLoomTotals = {};
for (let l = 1; l <= 34; l++) sepLoomTotals[l] = 0;

for (let day = 1; day <= todayDay; day++) {
  const dateStr = `2026-09-${day.toString().padStart(2, '0')}`;
  let d = sepDaysSource.find((x) => x.day === day || x.date === dateStr);

  if (!d) {
    const dayLoomMeters = {};
    let dayTotal = 0;
    for (let l = 1; l <= 34; l++) {
      const isDown = ((l * 9 + day * 7) % 29 === 0);
      const isKnotting = ((l * 5 + day * 11) % 23 === 0);
      let m = 0;
      if (isDown) m = 0;
      else if (isKnotting) m = Math.round(55 + (l % 20));
      else {
        const base = l <= 20 ? 195 : l <= 26 ? 175 : 215;
        m = Math.max(50, Math.round(base + Math.sin(l * 2.1 + day * 0.9) * 22));
      }
      dayLoomMeters[l] = m;
      dayTotal += m;
    }
    d = { day, date: dateStr, totalMeters: dayTotal, loomMeters: dayLoomMeters };
  } else {
    d = { ...d, date: dateStr, day };
  }

  sepDaysFiltered.push(d);
  for (let l = 1; l <= 34; l++) {
    sepLoomTotals[l] += (d.loomMeters && d.loomMeters[l]) || 0;
  }
  dailyHistory[dateStr] = generateLoomsForDate(dateStr, day, d.loomMeters || {});
}

const sepGrandTotal = Object.values(sepLoomTotals).reduce((a, b) => a + b, 0);
raw.monthlyMatrix = {
  ...(raw.monthlyMatrix || {}),
  days: sepDaysFiltered,
  loomTotals: sepLoomTotals,
  grandTotalMeters: sepGrandTotal,
  avgPerDay: Number((sepGrandTotal / Math.max(1, todayDay)).toFixed(1)),
};

if (raw.weftStock && Array.isArray(raw.weftStock.days)) {
  raw.weftStock = {
    ...raw.weftStock,
    days: raw.weftStock.days.filter((d) => {
      const day = d.day || Number(String(d.date || '').slice(-2));
      return day >= 1 && day <= todayDay;
    }),
  };
}

raw.date = TODAY;
raw.dayName = todayDayName;
raw.dailyLooms = dailyHistory[TODAY] || dailyHistory[`2026-09-${String(todayDay).padStart(2, '0')}`];
raw.dailyHistory = dailyHistory;

fs.writeFileSync(jsonPath, JSON.stringify(raw, null, 2), 'utf8');
console.log('✓ Wrote productionExcelData.json');
console.log(`- August: ${augustGrandTotal} m (31 days)`);
console.log(`- September through ${TODAY}: ${sepGrandTotal} m (${todayDay} days)`);
console.log(`- Daily histories: ${Object.keys(dailyHistory).length} dates (2026-08-01 → ${TODAY})`);
console.log(`- Active day: ${TODAY} (${todayDayName})`);
