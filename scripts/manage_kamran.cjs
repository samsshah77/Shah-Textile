try { require('./.bootstrap.cjs') } catch (e) {}
const pg = require('pg');

// Precomputed bcrypt hash (12 rounds) for 'kamran@saratextile'
const PRECOMPUTED_HASH = '$2b$12$j2VDwMppB0sCDOX4kQhBIu3335gkCwnvJqRV99chB0y/WzzZa8.QC';

// Reads DATABASE_URL from environment or argument
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync('.env', 'utf8');
    const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
    if (match) dbUrl = match[1];
  } catch (e) {}
}

if (!dbUrl) {
  console.error('DATABASE_URL is not set!');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to database...');

    // 1. Ensure role 'fault' exists in roles table
    const roleId = 'role_fault_inspector';
    const roleRes = await client.query(
      `SELECT * FROM "roles" WHERE "key" = 'fault' OR "id" = $1`,
      [roleId]
    );

    let activeRoleId = roleId;
    if (roleRes.rows.length === 0) {
      console.log('Inserting role fault...');
      const ins = await client.query(
        `INSERT INTO "roles" ("id", "key", "label", "department", "description", "canSignup", "createdAt", "updatedAt")
         VALUES ($1, 'fault', 'Floor Fault Inspector', 'Floor & Quality Control', 'Fault reports from phone', false, NOW(), NOW())
         RETURNING "id"`,
        [roleId]
      );
      activeRoleId = ins.rows[0].id;
    } else {
      activeRoleId = roleRes.rows[0].id;
      console.log('Role fault already exists with id:', activeRoleId);
    }

    // 2. Ensure modules 'floor' and 'quality' grants exist for role (if modules table exists)
    try {
      const actions = ['VIEW', 'CREATE'];
      for (const modKey of ['floor', 'quality']) {
        const modRes = await client.query(`SELECT "id" FROM "modules" WHERE "key" = $1`, [modKey]);
        if (modRes.rows.length > 0) {
          const modId = modRes.rows[0].id;
          for (const act of actions) {
            const grantId = `grant_${activeRoleId}_${modKey}_${act.toLowerCase()}`;
            await client.query(
              `INSERT INTO "role_module_grants" ("id", "roleId", "moduleId", "action", "effect", "scope")
               VALUES ($1, $2, $3, $4::"PermissionAction", 'ALLOW', 'ALL')
               ON CONFLICT ("roleId", "moduleId", "action") DO NOTHING`,
              [grantId, activeRoleId, modId, act]
            ).catch(e => console.log(`Grant note (${modKey} ${act}):`, e.message));
          }
        }
      }
    } catch (e) {
      console.log('Skipping module table grants (using catalog fallback):', e.message);
    }

    // 3. User Kamran credentials
    const email = 'kamran@saratextile.com';
    const passwordHash = PRECOMPUTED_HASH;
    const userId = 'usr_kamran_fault';

    const userRes = await client.query(`SELECT "id", "email" FROM "users" WHERE LOWER("email") = LOWER($1)`, [email]);
    if (userRes.rows.length === 0) {
      console.log('Creating user Kamran...');
      await client.query(
        `INSERT INTO "users" ("id", "name", "email", "passwordHash", "roleKey", "roleId", "department", "status", "isActive", "createdAt", "updatedAt")
         VALUES ($1, 'Kamran', $2, $3, 'fault', $4, 'Floor & Quality Control', 'APPROVED', true, NOW(), NOW())`,
        [userId, email, passwordHash, activeRoleId]
      );
      console.log('User created successfully!');
    } else {
      console.log('Updating user Kamran credentials and role...');
      await client.query(
        `UPDATE "users"
         SET "name" = 'Kamran',
             "passwordHash" = $1,
             "roleKey" = 'fault',
             "roleId" = $2,
             "department" = 'Floor & Quality Control',
             "status" = 'APPROVED',
             "isActive" = true,
             "updatedAt" = NOW()
         WHERE LOWER("email") = LOWER($3)`,
        [passwordHash, activeRoleId, email]
      );
      console.log('User updated successfully!');
    }

    // List all users to confirm
    const allUsers = await client.query(`SELECT "id", "name", "email", "roleKey", "status", "isActive" FROM "users"`);
    console.log('Current database users:');
    console.table(allUsers.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
