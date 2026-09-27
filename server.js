/* =====================================================================
   Local mock backend — same API contract as apps-script/Code.gs.
   No dependencies. Run:  node server.js   (then open http://localhost:8080)
   - Orders are stored in data/orders.json
   - "Emails" are printed to the console and appended to data/outbox.json
   - Admin password: env ADMIN_PASSWORD (default: bakery123)
   ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const R = require('./rules.js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const OUTBOX_FILE = path.join(DATA_DIR, 'outbox.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bakery123';
const STATUSES = R.STATUSES;
// For automated tests only: BAKERY_TEST_NOW=2026-10-01T14:59:00+05:30 pretends it's that time.
const TEST_NOW = () => (process.env.BAKERY_TEST_NOW ? Date.parse(process.env.BAKERY_TEST_NOW) : undefined);

// Load the same config.js the browser uses (menu, rules, bakery name).
function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), sandbox);
  return sandbox.window.BAKERY_CONFIG;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; } };
const writeJSON = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); };

// ---------------------------------------------------------------- emails
// Emails are never sent by the mock: they go to data/outbox.json + the console.
function sendMail(kind, order, cfg) {
  const mail = R.buildEmail(kind, order, cfg);
  const entry = { at: new Date().toISOString(), kind, orderId: order.orderId, ...mail };
  const outbox = readJSON(OUTBOX_FILE);
  outbox.push(entry);
  writeJSON(OUTBOX_FILE, outbox);
  console.log(`\n📧 [MOCK EMAIL] to=${mail.to}\n   subject: ${mail.subject}\n   ${mail.body.split('\n').join('\n   ')}\n`);
  return true;
}

// ------------------------------------------------------------------- API
function newOrderId(existing) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let id = 'WB-';
    for (let i = 0; i < 4; i++) id += A[crypto.randomInt(A.length)];
    if (!existing.some((o) => o.orderId === id)) return id;
  }
}
function checkPassword(p) {
  const a = Buffer.from(String(p || '')), b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createOrder(p, cfg) {
  const orders = readJSON(ORDERS_FILE);
  const v = R.validateOrder(p.order, cfg, TEST_NOW(), { hasPriorOrder: (phone) => R.hasPriorOrder(orders, phone) });
  if (!v.ok) return { ok: false, error: v.error, errors: v.errors };
  const now = new Date().toISOString();
  const order = { orderId: newOrderId(orders), createdAt: now, ...v.fields, status: 'Pending', adminNote: '', updatedAt: now, lastEmailedStatus: '' };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  sendMail('received', order, cfg);
  return { ok: true, orderId: order.orderId, subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, deliveryFeeTbc: order.deliveryFeeTbc,
    total: order.total, status: order.status, deliveryDate: order.deliveryDate, slot: order.slot };
}

function handle(p) {
  const cfg = loadConfig();
  const action = p.action;
  if (action === 'ping') return { ok: true, mode: 'local-mock', time: new Date().toISOString() };
  if (action === 'createOrder') return createOrder(p, cfg);
  if (action === 'status') {
    const id = String(p.orderId || '').trim().toUpperCase();
    const phone = R.normalizePhone(p.phone);
    const o = readJSON(ORDERS_FILE).find((x) => x.orderId === id);
    if (!o || !phone || o.phone !== phone) return { ok: false, error: "We couldn't find an order with that ID and phone number." };
    return { ok: true, order: R.publicStatus(o) };
  }
  // ---- admin actions
  if (!checkPassword(p.password)) return { ok: false, error: 'Wrong password.', auth: false };
  if (action === 'login') return { ok: true };
  if (action === 'listOrders') {
    let orders = readJSON(ORDERS_FILE).slice().reverse();
    if (p.status && STATUSES.includes(p.status)) orders = orders.filter((o) => o.status === p.status);
    return { ok: true, orders };
  }
  if (action === 'updateStatus') {
    const orders = readJSON(ORDERS_FILE);
    const o = orders.find((x) => x.orderId === String(p.orderId || '').toUpperCase());
    if (!o) return { ok: false, error: 'Order not found.' };
    const res = R.applyAdminUpdate(o, p);
    if (!res.ok) return res;
    o.updatedAt = new Date().toISOString();
    let emailSent = false;
    if (o.status !== 'Pending' && o.lastEmailedStatus !== o.status && p.sendEmail !== false) {
      emailSent = sendMail('status', o, cfg);
      o.lastEmailedStatus = o.status;
    }
    writeJSON(ORDERS_FILE, orders);
    return { ok: true, order: o, emailSent, feeChanged: res.feeChanged };
  }
  return { ok: false, error: 'Unknown action.' };
}

// Warn if apps-script/Code.gs has drifted from config.js (menu prices/rules).
function checkCodeGsSync() {
  try {
    const ctx = { Utilities: {}, console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8'), ctx);
    const gsMenu = vm.runInContext('MENU', ctx), gsRules = vm.runInContext('RULES', ctx);
    const cfg = loadConfig(), idx = R.indexMenu(cfg.menu), issues = [];
    Object.values(idx).forEach((m) => {
      const g = gsMenu[m.id];
      if (!g) issues.push(`${m.id} missing in Code.gs`);
      else if (g.price !== m.price || g.name !== m.name || !!g.box !== m.box || (g.pick || 'none') !== m.pick || !!g.fridayOk !== m.fridayOk) issues.push(`${m.id} differs`);
    });
    Object.keys(gsMenu).forEach((id) => { if (!idx[id]) issues.push(`${id} only in Code.gs`); });
    ['minOrder', 'weekendsToShow', 'cutoffHour', 'weekendSlots', 'fridaySlots', 'delivery', 'launchOffer'].forEach((k) => {
      if (JSON.stringify(gsRules[k]) !== JSON.stringify(cfg[k])) issues.push(`rule ${k} differs`);
    });
    console.log(issues.length ? `⚠️  config.js and apps-script/Code.gs are out of sync: ${issues.join('; ')}` : '✓ config.js menu & rules match apps-script/Code.gs');
  } catch (e) { console.log('(could not compare with Code.gs: ' + e.message + ')'); }
}

// ---------------------------------------------------------------- server
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function sendJSON(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    if (req.method === 'GET') { // like Code.gs doGet: read-only actions only
      const q = Object.fromEntries(url.searchParams);
      if (q.action !== 'ping' && q.action !== 'status') return sendJSON(res, { ok: false, error: 'Use POST for this action.' });
      try { return sendJSON(res, handle(q)); } catch (e) { return sendJSON(res, { ok: false, error: 'Server error: ' + e.message }); }
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let p;
      try { p = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, { ok: false, error: 'Invalid JSON.' }); }
      try { sendJSON(res, handle(p)); } catch (e) { console.error(e); sendJSON(res, { ok: false, error: 'Server error: ' + e.message }); }
    });
    return;
  }
  // static files (never serve data/ or dotfiles)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](data|apps-script|node_modules)[\\/]|[\\/]\./.test(file.slice(ROOT.length)) || /server\.js$/.test(file)) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  checkCodeGsSync();
  const mode = loadConfig().MODE;
  if (mode !== 'local') console.log(`ℹ️  config.js has MODE: '${mode}' — the pages will ${mode === 'demo' ? 'store orders in the browser (demo)' : 'talk to Google Apps Script'}. Set MODE: 'local' to use this mock server.`);
  console.log(`🧁 Bakery mock server running at http://localhost:${PORT}  (admin password: ${ADMIN_PASSWORD === 'bakery123' ? 'bakery123' : '[from env]'})`);
});
