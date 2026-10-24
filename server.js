// Production Server for Plesk Phusion Passenger & Next.js Standalone
const path = require('path')

// Cross-tenant isolation: load environment variables from ../.env.production
try {
  require('./.bootstrap.cjs')
} catch (e) {
  // .bootstrap.cjs is optional in development
}

process.env.NODE_ENV = 'production'
process.chdir(__dirname)

// In Phusion Passenger, process.env.PORT can be a socket path (string) or port number
const rawPort = process.env.PORT
const currentPort = rawPort && isNaN(rawPort) ? rawPort : (parseInt(rawPort, 10) || 3000)
const hostname = process.env.HOSTNAME || '0.0.0.0'

let nextConfig = {}
try {
  const reqFiles = require('./.next/required-server-files.json')
  nextConfig = reqFiles.config || {}
} catch (e) {
  console.warn('Could not load required-server-files.json, using default config:', e.message)
}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)

require('next')
const { startServer } = require('next/dist/server/lib/start-server')

startServer({
  dir: __dirname,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
}).then(() => {
  console.log(`> Sara Textile ERP listening on ${currentPort}`)
}).catch((err) => {
  console.error('Server failed to start:', err)
  process.exit(1)
})
