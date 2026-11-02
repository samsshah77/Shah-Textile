const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Safety: check localhost
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  console.error('CRITICAL: DATABASE_URL must be localhost! Aborting.');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

const DOUBLE_BEAM_LOOMS = new Set([21, 23, 24, 25, 26]);
const INCH_TO_METER = 39.38;

function calcMetrics(rpm, pick, runningHours, shiftA, shiftB, loomNumber) {
  const beam = DOUBLE_BEAM_LOOMS.has(loomNumber) ? 2 : 1;
  const runningTheo = pick > 0 && runningHours > 0 ? (rpm / pick) * (60 / INCH_TO_METER) * runningHours * beam : 0;
  const theo24h = pick > 0 ? (rpm / pick) * (60 / INCH_TO_METER) * 24 * beam : 0;
  const totalMeters = (shiftA || 0) + (shiftB || 0);
  const efficiencyRunning = runningTheo > 0 ? (totalMeters / runningTheo) * 100 : 0;
  const efficiency24h = theo24h > 0 ? (totalMeters / theo24h) * 100 : 0;
  const lossRunning = Math.max(0, runningTheo - totalMeters);
  const loss24h = Math.max(0, theo24h - totalMeters);

  return {
    theoreticalMeters: Math.round(runningTheo),
    theoretical24h: Math.round(theo24h),
    totalMeters: Math.round(totalMeters),
    efficiencyPercentage: Math.round(efficiencyRunning),
    efficiency24h: Math.round(efficiency24h),
    stopLossMeters: Math.round(lossRunning),
    loss24h: Math.round(loss24h),
    runningTheoretical: Math.round(runningTheo)
  };
}

async function main() {
  console.log('⚡ Populating Full Demo Data up to Today (Nov 3, 2026)...');

  // ============================================================
  // 1. FLOOR PRODUCTION SHEETS: Oct 25 to Nov 3, 2026
  // ============================================================
  console.log('\n--- 1. Floor Production Sheets (Oct 25 to Nov 3) ---');
  
  // Get baseline template from Oct 24
  const oct24Res = await pool.query("SELECT * FROM floor_daily_sheets WHERE date = '2026-10-24' ORDER BY \"loomNumber\" ASC");
  const baseline = oct24Res.rows;
  console.log(`Loaded ${baseline.length} loom rows from Oct 24 baseline.`);

  if (baseline.length === 0) {
    throw new Error('Baseline date 2026-10-24 not found in floor_daily_sheets.');
  }

  const targetDates = [
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
    '2026-11-03'
  ];

  for (let dIdx = 0; dIdx < targetDates.length; dIdx++) {
    const dateStr = targetDates[dIdx];
    // Check if sheet exists and has real production
    const chk = await pool.query(
      "SELECT count(*) as count, sum((payload->>'totalMeters')::numeric) as total FROM floor_daily_sheets WHERE date = $1",
      [dateStr]
    );
    const totalMeters = Number(chk.rows[0]?.total || 0);

    // If it exists but has 0 meters or doesn't exist, generate complete realistic day
    if (totalMeters === 0) {
      await pool.query("DELETE FROM floor_daily_sheets WHERE date = $1", [dateStr]);

      let dayTotalMeters = 0;
      for (const baseRow of baseline) {
        const bp = baseRow.payload;
        const loom = baseRow.loomNumber;

        // Realistic seed per loom and day
        const seedVal = (loom * 17 + (dIdx + 1) * 31) % 100;

        let status = 'RUNNING';
        let runningHours = 24;
        let shiftA = 0;
        let shiftB = 0;

        // Looms with occasional stop
        if ((loom === 13 && dIdx % 5 === 0) || (loom === 7 && dIdx === 3) || (loom === 22 && dIdx === 7)) {
          status = 'BEAM_END';
          runningHours = 0;
          shiftA = 0;
          shiftB = 0;
        } else if (loom === 19 && dIdx % 4 === 1) {
          status = 'KNOTTING';
          runningHours = 14;
          shiftA = 35;
          shiftB = 40;
        } else if (loom === 28 && dIdx % 6 === 2) {
          status = 'MECHANICAL_FAULT';
          runningHours = 16;
          shiftA = 48;
          shiftB = 52;
        } else {
          status = 'RUNNING';
          runningHours = 24;
          // Variance between 70 to 110m per shift depending on loom model
          const basePerShift = loom >= 27 ? 100 : loom >= 21 ? 85 : 80;
          const varianceA = (seedVal % 15) - 7;
          const varianceB = ((seedVal * 3) % 15) - 7;
          shiftA = Math.max(40, basePerShift + varianceA);
          shiftB = Math.max(40, basePerShift + varianceB);
        }

        const metrics = calcMetrics(bp.rpm || 350, bp.pick || 60, runningHours, shiftA, shiftB, loom);
        dayTotalMeters += metrics.totalMeters;

        const newPayload = {
          ...bp,
          id: `PROD-${dateStr}-${loom}`,
          date: dateStr,
          status,
          runningHours,
          rollerHours: runningHours,
          shiftAMeters: shiftA,
          shiftBMeters: shiftB,
          totalMeters: metrics.totalMeters,
          theoreticalMeters: metrics.theoreticalMeters,
          theoretical24h: metrics.theoretical24h,
          runningTheoretical: metrics.runningTheoretical,
          efficiencyPercentage: metrics.efficiencyPercentage,
          efficiency24h: metrics.efficiency24h,
          stopLossMeters: metrics.stopLossMeters,
          loss24h: metrics.loss24h,
          remarks: status === 'RUNNING' ? '' : status === 'BEAM_END' ? 'Beam End' : status
        };

        await pool.query(
          `INSERT INTO floor_daily_sheets ("id", "date", "loomNumber", "segmentIndex", "payload", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 1, $4::jsonb, NOW(), NOW())`,
          [randomUUID(), dateStr, loom, JSON.stringify(newPayload)]
        );
      }

      console.log(`✓ Populated ${dateStr}: 34 looms, total production = ${dayTotalMeters} meters.`);
    } else {
      console.log(`Date ${dateStr} already has active data (${totalMeters} m).`);
    }
  }

  // ============================================================
  // 2. ACCOUNTS: November 2026 Bills & Lines
  // ============================================================
  console.log('\n--- 2. Accounts Bills (November 2026) ---');
  const partiesRes = await pool.query('SELECT id, name, category FROM acc_parties ORDER BY name');
  const parties = partiesRes.rows;

  const novBillsRes = await pool.query("SELECT count(*) FROM acc_bills WHERE month = '2026-11'");
  if (parseInt(novBillsRes.rows[0].count, 10) === 0) {
    const novItems = [
      { desc: 'Loom Lubricating Oil ISO VG 220 (Drum 208L)', rate: 118000, qty: 1 },
      { desc: 'Rapier Gripper Tape Left & Right Pair', rate: 29000, qty: 2 },
      { desc: 'Heald Wire 330mm Nickel Plated (Pack 5000)', rate: 12500, qty: 3 },
      { desc: 'Timing Belt 1440-8M-30 High Torque', rate: 4200, qty: 6 },
      { desc: 'LED High Bay Mill Floor Light 150W', rate: 5500, qty: 4 },
      { desc: 'Guide Teeth Carbon Steel G6200', rate: 3200, qty: 8 },
      { desc: 'Cloth Roller Rubber Emery Fillet (Roll 50M)', rate: 16000, qty: 1 },
      { desc: 'Electric Contactor 32A Schneider', rate: 6500, qty: 4 }
    ];

    let bSort = 1;
    for (let day = 1; day <= 3; day++) {
      const dateStr = `2026-11-0${day}`;
      for (let b = 0; b < 2; b++) {
        const party = parties[(day * 4 + b) % parties.length];
        const billId = randomUUID();
        const billNo = String(9200 + day * 10 + b);
        const inwardNo = String(11500 + day * 8 + b);

        await pool.query(
          `INSERT INTO acc_bills ("id", "partyId", "month", "date", "billNo", "inwardNo", "remarks", "sortOrder", "createdBy", "createdAt", "updatedAt")
           VALUES ($1, $2, '2026-11', $3::date, $4, $5, 'Received gate verified', $6, 'Admin', NOW(), NOW())`,
          [billId, party.id, dateStr, billNo, inwardNo, bSort++]
        );

        const item = novItems[(day + b) % novItems.length];
        await pool.query(
          `INSERT INTO acc_bill_lines ("id", "billId", "lineNo", "description", "machine", "quantity", "rate", "amount")
           VALUES ($1, $2, 1, $3, $4, $5, $6, $7)`,
          [randomUUID(), billId, item.desc, `Loom #${(day * 5 + b) % 34 + 1}`, item.qty, item.rate, item.qty * item.rate]
        );
      }
    }
    console.log(`✓ Created 6 realistic bills for November 2026.`);
  } else {
    console.log(`November 2026 bills already present (${novBillsRes.rows[0].count} bills).`);
  }

  // ============================================================
  // 3. ACCOUNTS: Petty Cash for November 2026
  // ============================================================
  console.log('\n--- 3. Accounts Petty Cash (November 2026) ---');
  const novPettyRes = await pool.query("SELECT count(*) FROM acc_petty_cash WHERE month = '2026-11'");
  if (parseInt(novPettyRes.rows[0].count, 10) === 0) {
    const novPettyEntries = [
      { date: '2026-11-01', desc: 'Balance b/f from Oct-2026', kind: 'OPENING', debit: 8450, credit: 0 },
      { date: '2026-11-01', desc: 'Cash Received from Main Bank Account', kind: 'CASH_IN', debit: 60000, credit: 0 },
      { date: '2026-11-02', desc: 'Emergency electrical PVC tape & wire lugs', kind: 'EXPENSE', debit: 0, credit: 1650 },
      { date: '2026-11-02', desc: 'Drinking water dispenser 10 cans refill', kind: 'EXPENSE', debit: 0, credit: 1800 },
      { date: '2026-11-03', desc: 'Stationery register books and carbon paper', kind: 'EXPENSE', debit: 0, credit: 2200 },
      { date: '2026-11-03', desc: 'Courier sample dispatch to buying house', kind: 'EXPENSE', debit: 0, credit: 950 }
    ];

    let pSort = 1;
    for (const pe of novPettyEntries) {
      await pool.query(
        `INSERT INTO acc_petty_cash ("id", "month", "date", "description", "kind", "debit", "credit", "sortOrder", "version", "createdAt", "updatedAt")
         VALUES ($1, '2026-11', $2::date, $3, $4, $5, $6, $7, 1, NOW(), NOW())`,
        [randomUUID(), pe.date, pe.desc, pe.kind, pe.debit, pe.credit, pSort++]
      );
    }
    console.log(`✓ Inserted ${novPettyEntries.length} petty cash records for November 2026.`);
  } else {
    console.log(`November 2026 petty cash already present (${novPettyRes.rows[0].count} records).`);
  }

  // ============================================================
  // 4. ACCOUNTS: Cost Inputs for November 2026
  // ============================================================
  console.log('\n--- 4. Cost Statement Inputs (November 2026) ---');
  const novCost = await pool.query("SELECT month FROM acc_cost_inputs WHERE month = '2026-11'");
  if (novCost.rows.length === 0) {
    const inputs = {
      monthlyProductionMeters: 492000,
      adminSellingExpTotal: 350000,
      powerFuel: 1450000,
      depreciation: 280000,
      repairMaint: 185000,
      factoryRent: 250000,
      insurance: 45000,
      miscFactoryExp: 70000
    };
    await pool.query(
      `INSERT INTO acc_cost_inputs ("month", "inputs", "version", "updatedBy", "updatedAt")
       VALUES ('2026-11', $1::jsonb, 1, 'Admin', NOW())`,
      [JSON.stringify(inputs)]
    );
    console.log('✓ Created November 2026 cost statement inputs.');
  }

  // ============================================================
  // 5. PAYROLL: Staff Attendance for November 2026
  // ============================================================
  console.log('\n--- 5. Payroll Rows for November 2026 ---');
  const staffOct = await pool.query("SELECT id, payload FROM payroll_rows WHERE sheet = 'sara_payroll_staff_v6' AND month = '2026-10'");
  const novStaffExist = await pool.query("SELECT count(*) FROM payroll_rows WHERE sheet = 'sara_payroll_staff_v6' AND month = '2026-11'");

  if (parseInt(novStaffExist.rows[0].count, 10) === 0 && staffOct.rows.length > 0) {
    let pos = 1;
    for (const sr of staffOct.rows) {
      const p = { ...sr.payload };
      p.month = '2026-11';
      p.attendanceDays = 3; // 3 days in Nov
      p.ratePerDay = Number((p.basicSalary / 30).toFixed(2));
      p.grossAmount = Number((p.ratePerDay * 3 + (p.otAmount || 0)).toFixed(0));
      p.synopsisAmount = Number((p.grossAmount - (p.lessAdvance || 0)).toFixed(0));

      await pool.query(
        `INSERT INTO payroll_rows ("sheet", "id", "month", "position", "payload", "version", "updatedAt", "updatedBy")
         VALUES ('sara_payroll_staff_v6', $1, '2026-11', $2, $3::jsonb, 1, NOW(), 'Admin')`,
        [`staff-nov-${pos}`, pos, JSON.stringify(p)]
      );
      pos++;
    }
    console.log(`✓ Created November 2026 staff records with 3 days attendance.`);
  }

  console.log('\n🎉 ALL DEMO DATA UP TO TODAY (NOV 3, 2026) FULLY POPULATED!');
  console.log('✓ Floor Production: 34 Looms continuous from Oct 25 to Nov 3 (Today).');
  console.log('✓ Accounts: Bills & Lines, Petty Cash, Cost Statement for November.');
  console.log('✓ Payroll: Staff attendance for November.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
