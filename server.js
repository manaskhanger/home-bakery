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
const STATUSES = ['Pending', 'Confirmed', 'Declined'];

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
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function buildEmail(kind, o, cfg) {
  const name = cfg.bakeryName;
  const when = R.formatDate(o.deliveryDate) + ', ' + o.slot;
  const itemsTxt = o.summary;
  const itemsHtml = o.items.map((l) => `<tr><td style="padding:4px 0">${l.qty} × ${esc(l.name)}${l.choices ? `<br><small style="color:#8a6f64">${esc(l.choices)}</small>` : ''}</td><td style="text-align:right">₹${l.lineTotal}</td></tr>`).join('');
  let subject, intro, introHtml;
  if (kind === 'received') {
    subject = `We've got your order ${o.orderId} 🧁`;
    intro = `Hi ${o.name}, thank you for your order! It's now awaiting confirmation — we'll email you (and usually WhatsApp you) once it's confirmed.`;
  } else if (o.status === 'Confirmed') {
    subject = `Your order ${o.orderId} is confirmed! 🎉`;
    intro = `Hi ${o.name}, great news — your order is confirmed and will be baked fresh for ${when}.`;
  } else {
    subject = `About your order ${o.orderId}`;
    intro = `Hi ${o.name}, we're really sorry — we can't take your order this time.`;
  }
  const note = o.adminNote && kind !== 'received' ? `Note from us: ${o.adminNote}` : '';
  introHtml = esc(intro);
  const body = [intro].concat(note ? [note] : [], ['', `Order ID: ${o.orderId}`, `Delivery: ${when}`, `Address: ${o.address}`, '', itemsTxt, `Total: ₹${o.total} (free home delivery)`, '', `— ${name}`]).join('\n');
  const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#3b2018;background:#fbf4ec;padding:24px;border-radius:16px">
<h2 style="font-family:Georgia,serif;margin:0 0 4px">${esc(name)}</h2><p>${introHtml}</p>${note ? `<p style="background:#f6dcd4;padding:10px 14px;border-radius:10px">${esc(note)}</p>` : ''}
<p><b>Order ID:</b> ${esc(o.orderId)}<br><b>Delivery:</b> ${esc(when)}<br><b>Address:</b> ${esc(o.address)}</p>
<table style="width:100%;border-collapse:collapse">${itemsHtml}<tr><td style="border-top:1px solid #e6d3c7;padding-top:6px"><b>Total</b></td><td style="border-top:1px solid #e6d3c7;text-align:right"><b>₹${o.total}</b></td></tr></table>
<p style="color:#8a6f64;font-size:13px">Free home delivery · Questions? WhatsApp ${esc(cfg.whatsappDisplay)}</p></div>`;
  return { to: o.email, subject, body, htmlBody };
}

function sendMail(kind, order, cfg) {
  const mail = buildEmail(kind, order, cfg);
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
function publicStatus(o) {
  return { orderId: o.orderId, firstName: String(o.name).split(' ')[0], status: o.status, deliveryDate: o.deliveryDate, slot: o.slot,
    summary: o.summary, items: o.items, total: o.total, adminNote: o.adminNote, createdAt: o.createdAt, updatedAt: o.updatedAt };
}

function createOrder(p, cfg) {
  const o = p.order || {};
  if (o.website) return { ok: false, error: 'Spam check failed.' }; // honeypot
  const errors = [];
  const name = String(o.name || '').trim().slice(0, 80);
  const phone = R.normalizePhone(o.phone);
  const email = String(o.email || '').trim().slice(0, 120);
  const address = String(o.address || '').trim().slice(0, 400);
  const notes = String(o.notes || '').trim().slice(0, 500);
  if (name.length < 2) errors.push('Please enter your name.');
  if (!phone) errors.push('Please enter a valid 10-digit Indian mobile number.');
  if (!R.isValidEmail(email)) errors.push('Please enter a valid email address.');
  if (address.length < 10) errors.push('Please enter your full delivery address.');
  const priced = R.priceItems(o.items, cfg.menu);
  errors.push(...priced.errors);
  if (!priced.errors.length && priced.total < cfg.minOrder) errors.push(`Minimum order is ₹${cfg.minOrder}. Your cart is ₹${priced.total}.`);
  const dates = R.availableDates({ today: R.todayIST(), weekendsToShow: cfg.weekendsToShow, weekdayDaysAhead: cfg.weekdayDaysAhead, cakeToastOnly: priced.cakeToastOnly });
  const d = dates.find((x) => x.date === o.deliveryDate);
  if (!d) errors.push(priced.cakeToastOnly ? 'Please pick an available delivery date.' : 'Please pick an available Saturday or Sunday (pre-order by Thursday; weekday delivery is for cake toast only).');
  const slots = d && d.kind === 'weekday' ? cfg.weekdaySlots : cfg.weekendSlots;
  if (d && slots.indexOf(o.slot) === -1) errors.push('Please pick a delivery slot.');
  if (errors.length) return { ok: false, error: errors[0], errors };

  const orders = readJSON(ORDERS_FILE);
  const now = new Date().toISOString();
  const order = {
    orderId: newOrderId(orders), createdAt: now, name, phone, email, address,
    deliveryDate: o.deliveryDate, slot: o.slot, items: priced.lines, summary: R.summarize(priced.lines),
    total: priced.total, notes, status: 'Pending', adminNote: '', updatedAt: now, lastEmailedStatus: ''
  };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  sendMail('received', order, cfg);
  return { ok: true, orderId: order.orderId, total: order.total, status: order.status, deliveryDate: order.deliveryDate, slot: order.slot };
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
    return { ok: true, order: publicStatus(o) };
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
    if (!STATUSES.includes(p.status)) return { ok: false, error: 'Invalid status.' };
    const orders = readJSON(ORDERS_FILE);
    const o = orders.find((x) => x.orderId === String(p.orderId || '').toUpperCase());
    if (!o) return { ok: false, error: 'Order not found.' };
    o.status = p.status;
    if (typeof p.note === 'string') o.adminNote = p.note.trim().slice(0, 500);
    o.updatedAt = new Date().toISOString();
    let emailSent = false;
    if (o.status !== 'Pending' && o.lastEmailedStatus !== o.status && p.sendEmail !== false) {
      emailSent = sendMail('status', o, cfg);
      o.lastEmailedStatus = o.status;
    }
    writeJSON(ORDERS_FILE, orders);
    return { ok: true, order: o, emailSent };
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
      else if (g.price !== m.price || g.name !== m.name || !!g.box !== m.box || !!g.weekdayOk !== m.weekdayOk) issues.push(`${m.id} differs`);
    });
    Object.keys(gsMenu).forEach((id) => { if (!idx[id]) issues.push(`${id} only in Code.gs`); });
    ['minOrder', 'weekendsToShow', 'weekdayDaysAhead', 'weekendSlots', 'weekdaySlots'].forEach((k) => {
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
