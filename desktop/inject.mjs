// Injects the RTL script into Claude Desktop through the local debugging port.
// Runs next to Claude and quits by itself once Claude closes.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT = Number(process.argv[2] || 9333)
const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = await readFile(path.join(here, '..', 'chrome-extension', 'rtl-mod.js'), 'utf8')

if (typeof WebSocket === 'undefined') {
  console.error('Node.js 22 or newer is needed (global WebSocket). Current: ' + process.version)
  process.exit(1)
}

const sessions = new Map()
let seen = false
let misses = 0
const startedAt = Date.now()

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a)

function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
  sessions.set(target.id, ws)
  ws.addEventListener('open', () => {
    send('Page.enable')
    send('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT })
    send('Runtime.evaluate', { expression: SCRIPT })
    log('injected:', target.url)
  })
  ws.addEventListener('close', () => sessions.delete(target.id))
  ws.addEventListener('error', () => {})
}

async function tick() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const targets = await res.json()
    if (!seen) log('connected to Claude on port', PORT)
    seen = true
    misses = 0
    for (const t of targets) {
      if (!['page', 'webview'].includes(t.type)) continue
      if (!t.webSocketDebuggerUrl || sessions.has(t.id)) continue
      if (t.url.startsWith('devtools://')) continue
      attach(t)
    }
  } catch {
    if (seen && ++misses > 3) { log('Claude closed, exiting'); process.exit(0) }
    if (!seen && Date.now() - startedAt > 90_000) {
      console.error('Could not reach Claude on port ' + PORT + '. Was Claude fully closed before the launcher ran?')
      process.exit(1)
    }
  }
}

log('waiting for Claude...')
await tick()
setInterval(tick, 2000)
