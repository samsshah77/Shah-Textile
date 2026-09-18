const ftp = require('basic-ftp')
const path = require('path')
const fs = require('fs')

async function deploy() {
  const host = process.env.FTP_SERVER
  const user = process.env.FTP_USERNAME
  const password = process.env.FTP_PASSWORD

  if (!host || !user || !password) {
    console.error('ERROR: Missing FTP_SERVER, FTP_USERNAME, or FTP_PASSWORD environment variables.')
    process.exit(1)
  }

  const client = new ftp.Client(60000)
  client.ftp.verbose = true

  try {
    console.log(`Connecting to ${host} as ${user}...`)
    
    // Connect with loose SSL/TLS or plain FTP as needed
    await client.access({
      host: host,
      user: user,
      password: password,
      port: 21,
      secure: false, // Prevents passive data socket TLS drops on Plesk vsftpd/proftpd
    })

    console.log('FTP Connection established!')

    // Detect if remote root contains httpdocs or is already in httpdocs
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
    console.error('FTP Deployment Failed:', err)
    process.exit(1)
  } finally {
    client.close()
  }
}

deploy()
