// Plesk / Phusion Passenger Production Server for Next.js
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, dir: __dirname })
const handle = app.getRequestHandler()

// In Passenger, process.env.PORT can be a string, pipe, or port number
const port = process.env.PORT || 3000

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Sara Textile ERP ready on ${port}`)
  })
}).catch((err) => {
  console.error('Next.js preparation failed:', err)
  process.exit(1)
})
