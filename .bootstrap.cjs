// .bootstrap.cjs - Loads environment variables from ../.env.production for cross-tenant isolation
const fs = require('fs')
const path = require('path')

const envProductionPath = path.resolve(__dirname, '../.env.production')
if (fs.existsSync(envProductionPath)) {
  const lines = fs.readFileSync(envProductionPath, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx !== -1) {
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (key && !process.env[key]) {
        process.env[key] = val
      }
    }
  }
}
