const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

// SAFETY: Check localhost only
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  console.error('CRITICAL SAFETY STOP: DATABASE_URL is not pointing to localhost! Aborting to protect live server.');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

// 1. Files to update branding text in src/
const FILES_TO_REBRAND = [
  'src/components/shared/Sidebar.tsx',
  'src/components/shared/Header.tsx',
  'src/components/shared/AppLayout.tsx',
  'src/components/shared/PrintBrandHeader.tsx',
  'src/components/shared/ExportPdfButton.tsx',
  'src/components/shared/WhatsAppShareButton.tsx',
  'src/components/shared/WhatsAppShareModal.tsx',
  'src/components/shared/SheetHeader.tsx',
  'src/components/accounts/PartyDirectory.tsx',
  'src/components/challan/ChallanPrintPreview.tsx',
  'src/components/payroll/EmployeePaySlipModal.tsx',
  'src/components/payroll/weavers/WeaverWagesTab.tsx',
  'src/components/payroll/weavers/WeaverOvertimeTab.tsx',
  'src/components/payroll/weavers/WeaverNetPaymentTab.tsx',
  'src/components/payroll/contract/ContractSalaryTab.tsx',
  'src/components/payroll/contract/ContractOvertimeTab.tsx',
  'src/components/payroll/contract/ContractNetPaymentTab.tsx',
  'src/components/floor/ProductionSheetTable.tsx',
  'src/components/floor/QualityMasterTable.tsx',
  'src/app/layout.tsx',
  'src/app/login/page.tsx',
  'src/app/page.tsx',
  'src/app/(dashboard)/dashboard/page.tsx',
  'src/app/(dashboard)/floor/production/page.tsx',
  'src/app/(dashboard)/floor/reports/total/page.tsx',
  'src/app/(dashboard)/accounts/cost-statement/page.tsx',
  'src/app/(dashboard)/payroll/synopsis/page.tsx',
  'src/app/(dashboard)/payroll/employees/page.tsx',
  'src/app/(dashboard)/payroll/staff/page.tsx',
  'src/app/(dashboard)/payroll/helpers/page.tsx',
  'src/app/(dashboard)/payroll/efficiency/page.tsx',
  'src/app/(dashboard)/payroll/contractors/page.tsx',
  'src/app/(dashboard)/payroll/advances/page.tsx',
  'src/lib/floor/shareText.ts',
  'src/lib/floor/qualityShare.ts',
  'src/lib/floor/generateProductionPdf.ts',
  'src/lib/floor/generateQualityPdf.ts',
  'src/context/AuthContext.tsx'
];

function rebrandFileText(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');

  // Replace visible UI text while protecting system keys
  content = content
    .replace(/SARA TEXTILES/g, 'SHAH TEXTILES')
    .replace(/SARA TEXTILE/g, 'SHAH TEXTILE')
    .replace(/Sara Textiles/g, 'Shah Textiles')
    .replace(/Sara Textile/g, 'Shah Textile')
    .replace(/Sara\s*Textile\s*Mill/g, 'Shah Textile Mill');

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✓ Rebranded UI text in: ${filePath}`);
}

// 2. Party / Vendor Mapping
const PARTY_MAP = {
  'A.A Engineering': 'Apex Engineering Works',
  'A.A.I Engineering': 'Prime Tech Engineering',
  'A.N Traders': 'Horizon Trading Co.',
  'Alpha Engineering': 'Precision Machine Works',
  'Anisa Engineering Works': 'Al-Madina Engineering',
  'Asmeer Traders': 'Standard Yarn Traders',
  'Blue Reed': 'National Reed Corporation',
  'Etihad Lub Oil Company': 'Falcon Lubricants Co.',
  'Etihad Lube Oil Company': 'Falcon Lubricants Co.',
  'F.M Traders': 'Crescent Commercial Traders',
  'F.T Traders': 'Indus General Supplies',
  'Fahad Traders': 'Premier Textile Traders',
  'Farhan Electronics': 'Global Automation & Electronics',
  'G.Q Fire Services': 'Safety First Services',
  'GQ Fire Services': 'Safety First Services',
  'JAB Electronics': 'Circuit Dynamics Systems',
  'Janjoha Brothers': 'United Cotton & Yarn Co.',
  'Lubex': 'Universal Lube Solutions',
  'Marhaba Engineering': 'Allied Mechanical Workshop',
  'Marhaba Engineering Works': 'Allied Mechanical Workshop',
  'Muhammad Ali': 'Zahid Fabric Store',
  'Mustafa Corporation': 'Al-Barkat Enterprises',
  'N.E NINI': 'Metro Fiber Traders',
  'Pak Engineering Works': 'Super Precision Engineering',
  'Paradise Industrial Stores': 'Orient Industrial Supplies',
  'SMD Traders': 'Apex Electronic Traders',
  'Textile Engineering': 'Standard Mill Engineering',
  'Textile Traders': 'National Weaving Suppliers',
  'VIP Petroleum': 'Summit Petroleum Traders',
};

// 3. Employee / Worker / Contractor Mapping
const NAME_MAP = {
  'Muhammed Javed': 'Muhammad Bilal',
  'Abdul Majeed': 'Abdul Rasheed',
  'Tufail Ur Rehman': 'Tariq Mehmood',
  'Abdur Rehman': 'Noor Muhammad',
  'Liaquat Ali': 'Rashid Minhas',
  'Dawood': 'Danish',
  'Ali zar': 'Ali Raza',
  'Christopher': 'Sharoon',
  'Zulfiqar ': 'Zubair Khan',
  'Zulfiqar': 'Zubair Khan',
  'Muhammad Arif': 'Muhammad Asif',
  'Nazakat': 'Nadeem',
  'Maqsood': 'Manzoor',
  'Kamran': 'Khurram',
  'Abdul Waheed': 'Abdul Ghafoor',
  'Adison': 'Sunny Masih',
  'Ameen Ullah Khan': 'Inam Ullah Khan',
  'Ubaid': 'Usama',
  'Mushtaq Ahmed': 'Mukhtar Ahmed',
  'Ahmer': 'Ahsan',
  'Shakeel Ahmed': 'Shabbir Ahmed',
  'Salman': 'Sohail',
  'Israr': 'Irfan',
  'Hasnain': 'Haris',
  'NASEER AHMED': 'NAEEM AKHTAR',
  'NAZIM HUSSAIN': 'NASIR ABBAS',
  'REHBAR ALI': 'REHAN MALIK',
  'Basit': 'Babar Ali',
  'BASIT': 'BABAR ALI',
  'SHAHID': 'SHAFIQ',
  'SHOAIB': 'SHAHBAZ',
  'AMIR': 'ARSHAD',
  'NAWAB': 'NOOR KHAN',
  'ZAFAR GUL': 'ZAMAN KHAN',
  'Amir (PU Technician)': 'Arshad (PU Technician)',
  'Basit (Electronics Contractor)': 'Babar (Electronics Contractor)',
  'Naseer Reed': 'Naeem Reed',
  'Nawab (Gitta Winder)': 'Noor (Gitta Winder)',
  'NAQEEBULLAH': 'NAVEED',
  'FAYAZ': 'FARHAN',
  'ZEESHAN': 'ZAHID',
  'YASIR': 'YOUSUF',
  'SALEEM': 'SAJID',
  'IMTIAZ': 'IRFAN',
  'ARIF': 'ASIF',
  'AJMAL': 'AKRAM',
  'ADNAN BALOCH': 'ADNAN KHAN',
  'SHEHZAD': 'SHAHID',
  'ASIF': 'ANIS',
  'GHULAM ABBAS': 'GHULAM NABI',
  'SHAHZAIB': 'SHOUKAT',
  'SHAH ZAIB': 'SHOUKAT',
  'AKMAL': 'AMJAD',
  'FAISAL': 'FAHEEM',
  'SHERAZ': 'SHAN',
  'SHAH JALAL': 'SHAH MEHMOOD',
  'HAMZA': 'HAIDER',
  'JAWAD': 'JUNAID',
  'RUSTAM': 'REHMAT',
  'NAZEER AHMED': 'NIAMAT ULLAH',
  'HASSAN': 'HAROON',
  'KASHIF': 'KAMRAN',
  'M. ALI': 'M. TAHIR',
  'FAROOQ': 'FAZAL',
  'HASEEB': 'HABIB',
  'KHALID': 'KALEEM',
  'REHAN KHAN': 'RIZWAN KHAN',
  'USMAN': 'UMAIR',
  'INAYAT': 'ILYAS',
  'REHAN': 'RAHEEL',
  'ABDUL SAMAD': 'ABDUL RAZZAQ',
  'AWAIS': 'AQEEL',
  'Saul': 'Samson',
  'MUDASSIR': 'MUNAWAR',
  'WASIF': 'WAQAS',
  'IBRAHEEM': 'ISMAIL'
};

function anonymizeParty(name) {
  if (!name) return name;
  return PARTY_MAP[name.trim()] || name;
}

function anonymizePerson(name) {
  if (!name) return name;
  const t = name.trim();
  return NAME_MAP[t] || NAME_MAP[t.toUpperCase()] || name;
}

async function main() {
  console.log('👑 Rebranding Local Environment to SHAH TEXTILE (Live Protected)...');

  // Step 1: Rebrand UI Files
  for (const f of FILES_TO_REBRAND) {
    rebrandFileText(f);
  }

  // Step 2: Anonymize Database acc_parties
  for (const [realName, fakeName] of Object.entries(PARTY_MAP)) {
    await pool.query('UPDATE acc_parties SET name = $1 WHERE name = $2', [fakeName, realName]);
  }
  console.log('✓ Anonymized database acc_parties');

  // Step 3: Anonymize Database accounts_store
  const accStore = await pool.query('SELECT key, payload FROM accounts_store');
  for (const row of accStore.rows) {
    let payload = row.payload;
    let modified = false;

    if (row.key === 'sara_textile_traders_v2' && Array.isArray(payload)) {
      payload = payload.map(item => {
        if (item.traderName && PARTY_MAP[item.traderName.trim()]) {
          modified = true;
          return { ...item, traderName: PARTY_MAP[item.traderName.trim()] };
        }
        return item;
      });
    } else if (row.key === 'sara_textile_workshops_v2' && Array.isArray(payload)) {
      payload = payload.map(item => {
        if (item.workshopName && PARTY_MAP[item.workshopName.trim()]) {
          modified = true;
          return { ...item, workshopName: PARTY_MAP[item.workshopName.trim()] };
        }
        return item;
      });
    }

    if (modified) {
      await pool.query('UPDATE accounts_store SET payload = $1 WHERE key = $2', [JSON.stringify(payload), row.key]);
    }
  }
  console.log('✓ Anonymized database accounts_store');

  // Step 4: Anonymize Database payroll_rows
  const pRows = await pool.query('SELECT sheet, id, payload FROM payroll_rows');
  for (const r of pRows.rows) {
    let p = r.payload;
    let changed = false;

    if (r.sheet === 'sara_payroll_employees_v9') {
      const idx = parseInt((r.id || '').replace(/\D/g, '') || '1', 10);
      p = {
        ...p,
        name: anonymizePerson(p.name),
        fatherName: anonymizePerson(p.fatherName),
        cnic: `42101-${String(1000000 + idx).slice(0, 7)}-${(idx % 9) + 1}`,
        phone: `0300-${String(2000000 + idx).slice(0, 7)}`,
        address: `Plot #${idx + 10}, Sector 15, Korangi Industrial Area, Karachi`,
      };
      changed = true;
    } else if (r.sheet === 'sara_payroll_staff_v6' || r.sheet === 'sara_payroll_weavers_v6' || r.sheet === 'sara_payroll_helpers_v6' || r.sheet === 'sara_payroll_contract_v7' || r.sheet === 'sara_payroll_advances_v7' || r.sheet === 'sara_payroll_efficiency_v6') {
      if (p.employeeName) {
        const masked = anonymizePerson(p.employeeName);
        if (masked !== p.employeeName) { p.employeeName = masked; changed = true; }
      }
      if (p.name) {
        const masked = anonymizePerson(p.name);
        if (masked !== p.name) { p.name = masked; changed = true; }
      }
    } else if (r.sheet === 'sara_payroll_contractors_v6') {
      if (p.name) {
        const masked = anonymizePerson(p.name);
        if (masked !== p.name) { p.name = masked; changed = true; }
      }
    }

    if (changed) {
      await pool.query('UPDATE payroll_rows SET payload = $1 WHERE sheet = $2 AND id = $3', [JSON.stringify(p), r.sheet, r.id]);
    }
  }
  console.log('✓ Anonymized database payroll_rows');

  // Step 5: Anonymize JSON seeds
  const empPath = path.join(__dirname, '..', 'src', 'data', 'all_employees.json');
  if (fs.existsSync(empPath)) {
    const rawEmps = JSON.parse(fs.readFileSync(empPath, 'utf8'));
    const maskedEmps = rawEmps.map((e, idx) => ({
      ...e,
      name: anonymizePerson(e.name),
      fatherName: anonymizePerson(e.fatherName),
      cnic: `42101-${String(1000000 + idx).slice(0, 7)}-${(idx % 9) + 1}`,
      phone: `0300-${String(2000000 + idx).slice(0, 7)}`,
      address: `Plot #${idx + 10}, Sector 15, Korangi Industrial Area, Karachi`,
    }));
    fs.writeFileSync(empPath, JSON.stringify(maskedEmps, null, 2), 'utf8');
    console.log('✓ Anonymized src/data/all_employees.json');
  }

  const accPath = path.join(__dirname, '..', 'src', 'data', 'accountsExcelData.json');
  if (fs.existsSync(accPath)) {
    const accJson = JSON.parse(fs.readFileSync(accPath, 'utf8'));
    if (accJson.costStatement) {
      accJson.costStatement.companyName = 'SHAH TEXTILE';
    }
    if (Array.isArray(accJson.traderSynopsis)) {
      accJson.traderSynopsis = accJson.traderSynopsis.map(item => ({
        ...item,
        traderName: anonymizeParty(item.traderName),
      }));
    }
    if (Array.isArray(accJson.workshopSynopsis)) {
      accJson.workshopSynopsis = accJson.workshopSynopsis.map(item => ({
        ...item,
        workshopName: anonymizeParty(item.workshopName),
      }));
    }
    if (Array.isArray(accJson.ledgers)) {
      accJson.ledgers = accJson.ledgers.map(l => {
        const maskedName = anonymizeParty(l.partyName);
        const newSlug = maskedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return { ...l, partyName: maskedName, slug: newSlug };
      });
    }
    if (accJson.costStatement?.costOfProduction?.categories) {
      for (const cat of accJson.costStatement.costOfProduction.categories) {
        if (Array.isArray(cat.breakdown)) {
          cat.breakdown = cat.breakdown.map(b => ({
            ...b,
            name: anonymizePerson(b.name),
          }));
        }
      }
    }
    fs.writeFileSync(accPath, JSON.stringify(accJson, null, 2), 'utf8');
    console.log('✓ Anonymized src/data/accountsExcelData.json with SHAH TEXTILE header');
  }

  // Step 6: Ensure User Logins on Local DB
  const adminHash = await bcrypt.hash('admin123', 10);
  const tufailHash = await bcrypt.hash('tufail123', 10);
  const kamranHash = await bcrypt.hash('kamran@saratextile', 12);

  // Update existing users
  await pool.query('UPDATE users SET "passwordHash" = $1, "isActive" = true, status = \'APPROVED\' WHERE email = $2', [adminHash, 'javed@saratextile.com']);
  await pool.query('UPDATE users SET "passwordHash" = $1, "isActive" = true, status = \'APPROVED\' WHERE email = $2', [adminHash, 'adanshah13579@gmail.com']);
  await pool.query('UPDATE users SET "passwordHash" = $1, "isActive" = true, status = \'APPROVED\' WHERE email = $2', [tufailHash, 'tufail@saratextile.com']);
  await pool.query('UPDATE users SET "passwordHash" = $1, "isActive" = true, status = \'APPROVED\' WHERE email = $2', [kamranHash, 'kamran@saratextile.com']);

  // Also add or upsert an explicit 'admin@shahtextile.com' account!
  const shahAdminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@shahtextile.com']);
  if (shahAdminExists.rows.length === 0) {
    const adminRole = await pool.query("SELECT id FROM roles WHERE key = 'admin'");
    const roleId = adminRole.rows[0]?.id || null;
    await pool.query(
      `INSERT INTO users (id, name, email, "passwordHash", "roleKey", "roleId", department, status, "isActive", "createdAt", "updatedAt")
       VALUES ('usr_shah_admin', 'Shah Textile Admin', 'admin@shahtextile.com', $1, 'admin', $2, 'Executive Management', 'APPROVED', true, NOW(), NOW())`,
      [adminHash, roleId]
    );
    console.log('✓ Created new dedicated admin@shahtextile.com account (password: admin123)');
  } else {
    await pool.query('UPDATE users SET "passwordHash" = $1, "isActive" = true, status = \'APPROVED\' WHERE email = $2', [adminHash, 'admin@shahtextile.com']);
    console.log('✓ Updated admin@shahtextile.com (password: admin123)');
  }

  // Clear any login throttles
  await pool.query('DELETE FROM login_throttles');
  console.log('✓ Cleared login throttles');

  console.log('\n🎉 SUCCESS! Local environment is now 100% SHAH TEXTILE branded with private dummy data!');
  console.log('🔒 Live server and GitHub main branch are completely untouched.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
