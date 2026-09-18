const ftp = require('basic-ftp')
const path = require('path')
const fs = require('fs')

async function deploy() {
  const host = (process.env.FTP_SERVER || '').trim()
  const user = (process.env.FTP_USERNAME || '').trim()
  const password = (process.env.FTP_PASSWORD || '').trim()

  if (!host || !user || !password) {
    console.error('ERROR: Missing FTP_SERVER, FTP_USERNAME, or FTP_PASSWORD environment variables.')
    process.exit(1)
  }

  const client = new ftp.Client(60000)
  client.ftp.verbose = true

  let connected = false

  // 1. Try connecting with FTPS (Explicit TLS over port 21 - Required by Plesk secure settings)
  try {
    console.log(`[Attempt 1] Connecting to ${host} as ${user} via FTPS (Explicit TLS)...`)
    await client.access({
      host,
      user,
      password,
      port: 21,
      secure: true,
      secureOptions: { rejectUnauthorized: false }
    })
    connected = true
    console.log('Connected via FTPS (Explicit TLS)!')
  } catch (err) {
    console.log(`FTPS connection attempt failed (${err.message}). Trying plain FTP fallback...`)
    client.close()
  }

  // 2. Fallback to plain FTP if server does not enforce TLS
  if (!connected) {
    const plainClient = new ftp.Client(60000)
    plainClient.ftp.verbose = true
    try {
      console.log(`[Attempt 2] Connecting to ${host} as ${user} via Plain FTP...`)
      await plainClient.access({
        host,
        user,
        password,
        port: 21,
        secure: false
      })
      connected = true
      Object.assign(client, plainClient)
      console.log('Connected via Plain FTP!')
    } catch (plainErr) {
      console.error('All connection attempts failed. Check credentials or Plesk FTP settings:', plainErr)
      process.exit(1)
    }
  }

  try {
    // Detect if remote root contains httpdocs or is already inside httpdocs
    const list = await client.list()
    const hasHttpdocs = list.some(item => item.name === 'httpdocs')
    const remoteRoot = hasHttpdocs ? '/httpdocs' : ''

    console.log(`Target directory: ${remoteRoot || '/'}`)

    if (fs.existsSync('sara-build.zip')) {
      console.log('Uploading sara-build.zip (~15 MB)...')
      await client.uploadFrom('sara-build.zip', `${remoteRoot}/sara-build.zip`)
      console.log('sara-build.zip uploaded successfully!')
    } else {
      console.error('ERROR: sara-build.zip not found in workspace.')
      process.exit(1)
    }

    if (fs.existsSync('public/deploy-unpack.php')) {
      console.log('Uploading deploy-unpack.php to public/...')
      await client.ensureDir(`${remoteRoot}/public`)
      await client.uploadFrom('public/deploy-unpack.php', `${remoteRoot}/public/deploy-unpack.php`)
      console.log('deploy-unpack.php uploaded successfully!')
    }

    console.log('Deploy package transfer completed in full!')
  } catch (err) {
    console.error('FTP Deployment Operation Failed:', err)
    process.exit(1)
  } finally {
    client.close()
  }
}

deploy()
