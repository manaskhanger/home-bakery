/**
 * =====================================================================
 *  Home Bakery — Google Apps Script backend (bound to the order Sheet)
 * =====================================================================
 *  API (same contract as the local mock server.js):
 *    POST body (Content-Type: text/plain) = JSON { action, ... }
 *      ping                                    -> { ok, mode }
 *      createOrder  { order:{name, phone, email, address, deliveryDate,
 *                    slot, distance, notes, items:[{id, qty, choices}]} }
 *                   distance = '3' (within 3 km) | '4'…'15' | 'unknown'
 *                                              -> { ok, orderId, subtotal, deliveryFee, deliveryFeeTbc,
 *                                                   total, status, deliveryDate, slot }
 *      status       { orderId, phone }         -> { ok, order:{...public fields} }
 *      login        { password }               -> { ok }
 *      listOrders   { password, status? }      -> { ok, orders:[...] }
 *      updateStatus { password, orderId, status, note?, deliveryFee?, sendEmail? }
 *                   deliveryFee (₹, whole number) replaces the estimate and
 *                   recalculates the total; required to confirm a 'not sure' order
 *                                              -> { ok, order, emailSent, feeChanged }
 *    GET ?action=ping | ?action=status&orderId=..&phone=..  (read-only)
 *  Errors are always returned as HTTP 200 + { ok:false, error } because
 *  Apps Script web apps cannot set status codes.
 *
 *  Script Properties (Project Settings -> Script properties):
 *    ADMIN_PASSWORD   (required)  password for admin.html
 *    BAKERY_NAME      (optional)  default 'Your Bakery Name'
 *    WHATSAPP_DISPLAY (optional)  shown in emails, e.g. '+91 98765 43210'
 *    OWNER_EMAIL      (optional)  gets a copy of every new order + is the reply-to
 * =====================================================================
 */

// ----------------------------------------------------------- settings
var SHEET_NAME = 'Orders';
var TZ = 'Asia/Kolkata';
var STATUSES = ['Pending', 'Confirmed', 'Declined'];

// Keep in sync with config.js in the website.
var RULES = {
  minOrder: 250,            // items only, before delivery
  weekendsToShow: 2,
  cutoffHour: 15,           // orders close Thursday 3 pm IST for that Fri/Sat/Sun
  weekendSlots: ['Morning · 10am – 1pm', 'Afternoon · 1pm – 4pm', 'Evening · 4pm – 7pm'],
  fridaySlots: ['Evening · 6pm – 9pm'],   // Friday evening: cake-toast-only orders
  delivery: { freeWithinKm: 3, freeFromOrder: 800, perKm: 10, maxKm: 15 }
};

// Prices are ALWAYS taken from here (never trusted from the browser).
// Keep ids/prices in sync with config.js.
var MENU = {
  'ck-choco':    { name: 'Classic Choco-Chip', price: 70 },
  'ck-nutella':  { name: 'Nutella-Stuffed',    price: 100 },
  'ck-seasalt':  { name: 'Dark Choc Sea Salt', price: 90 },
  'cc-redvelvet':{ name: 'Red Velvet',         price: 120 },
  'cc-belgian':  { name: 'Belgian Chocolate',  price: 130 },
  'cc-caramel':  { name: 'Salted Caramel',     price: 130 },
  'ct-vanilla':  { name: 'Classic Vanilla Cake Toast', price: 130, fridayOk: true },
  'ct-elaichi':  { name: 'Elaichi Cake Toast',           price: 140, fridayOk: true },
  'ct-choco':    { name: 'Chocolate Cake Toast',       price: 150, fridayOk: true },
  'ct-tutti':    { name: 'Tutti Frutti Cake Toast',    price: 140, fridayOk: true },
  'bx-tasting':  { name: 'Tasting Box', price: 449, box: true },
  'bx-cookie':   { name: 'Cookie Box',  price: 449, box: true },
  'bx-cupcake':  { name: 'Cupcake Box', price: 469, box: true },
  'bx-party':    { name: 'Party Box',   price: 599, box: true }
};

var HEADERS = ['Order ID', 'Created At', 'Name', 'Phone', 'Email', 'Address', 'Delivery Date', 'Slot',
  'Items JSON', 'Items Summary', 'Subtotal (₹)', 'Distance', 'Delivery Fee (₹)', 'Total (₹)', 'Notes', 'Status', 'Admin Note', 'Updated At', 'Last Emailed Status'];
var COL = {}; HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

function props_() { return PropertiesService.getScriptProperties(); }
function cfg_() {
  var p = props_();
  return {
    bakeryName: p.getProperty('BAKERY_NAME') || 'Your Bakery Name',
    whatsappDisplay: p.getProperty('WHATSAPP_DISPLAY') || '+91 [YOUR NUMBER]',
    ownerEmail: p.getProperty('OWNER_EMAIL') || ''
  };
}

// ------------------------------------------------------------ web app
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping' || p.action === 'status') return handle_(p);
  return json_({ ok: false, error: 'Use POST for this action.' });
}

function doPost(e) {
  var p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Invalid JSON.' }); }
  return handle_(p);
}

function handle_(p) {
  try {
    switch (p.action) {
      case 'ping': return json_({ ok: true, mode: 'google-apps-script', time: new Date().toISOString() });
      case 'createOrder': return json_(createOrder_(p));
      case 'status': return json_(status_(p));
    }
    var auth = checkPassword_(p.password);
    if (!auth.ok) return json_(auth);
    switch (p.action) {
      case 'login': return json_({ ok: true });
      case 'listOrders': return json_(listOrders_(p));
      case 'updateStatus': return json_(updateStatus_(p));
    }
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'Server error. Please try again in a moment.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// -------------------------------------------------------------- rules
function todayIST_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function addDays_(ymd, n) { var d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow_(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }
function formatDate_(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return String(ymd || '');
  var d = new Date(ymd + 'T00:00:00Z');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' +
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
}
/** Fri (cake-toast-only carts), Sat & Sun of each week; orders close Thursday RULES.cutoffHour:00 IST. */
function availableDates_(cakeToastOnly) {
  var now = new Date(), today = todayIST_();
  var minutes = Number(Utilities.formatDate(now, TZ, 'H')) * 60 + Number(Utilities.formatDate(now, TZ, 'm'));
  var out = [], fri = addDays_(today, (5 - dow_(today) + 7) % 7), found = 0, guard = 0;
  while (found < RULES.weekendsToShow && guard++ < 10) {
    var cutoff = addDays_(fri, -1);
    if (today < cutoff || (today === cutoff && minutes < RULES.cutoffHour * 60)) {
      if (cakeToastOnly) out.push({ date: fri, kind: 'friday' });
      out.push({ date: addDays_(fri, 1), kind: 'weekend' }, { date: addDays_(fri, 2), kind: 'weekend' });
      found++;
    }
    fri = addDays_(fri, 7);
  }
  return out;
}
/** Delivery: free within freeWithinKm; beyond that free from freeFromOrder, else perKm per km past freeWithinKm. */
function distanceLabel_(v) {
  var d = RULES.delivery; v = String(v);
  if (v === 'unknown') return 'More than ' + d.maxKm + ' km / not sure';
  var k = parseInt(v, 10);
  if (String(k) !== v || k < d.freeWithinKm || k > d.maxKm) return '';
  return k === d.freeWithinKm ? 'Within ' + k + ' km' : k + ' km';
}
function distanceFromLabel_(label) {
  label = String(label || '');
  var m = label.match(/^(?:Within )?(\d+) km$/);
  return m ? m[1] : (label ? 'unknown' : '');
}
function deliveryFee_(subtotal, distance) {
  var d = RULES.delivery;
  if (!distanceLabel_(distance)) return { valid: false };
  if (subtotal >= d.freeFromOrder) return { valid: true, fee: 0, tbc: false };
  if (String(distance) === 'unknown') return { valid: true, fee: null, tbc: true };
  var km = parseInt(distance, 10);
  return { valid: true, fee: km <= d.freeWithinKm ? 0 : (km - d.freeWithinKm) * d.perKm, tbc: false };
}
function feeText_(o) { return o.deliveryFeeTbc ? 'To be confirmed' : (Number(o.deliveryFee) === 0 ? 'Free' : '₹' + o.deliveryFee); }
function parseFee_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  var n = Number(String(v).replace(/[₹,\s]/g, ''));
  return (isFinite(n) && n >= 0 && n <= 5000 && Math.round(n) === n) ? n : NaN;
}
function normalizePhone_(p) {
  var d = String(p || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
function isEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
function clean_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
/** Stop Sheets from treating user text as a formula. */
function safeCell_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }

function priceItems_(items) {
  var lines = [], errors = [], total = 0;
  if (!Array.isArray(items) || !items.length) errors.push('Your cart is empty.');
  (items || []).forEach(function (raw) {
    var m = MENU[raw && raw.id], qty = parseInt(raw && raw.qty, 10);
    if (!m) { errors.push('Unknown item: ' + (raw && raw.id)); return; }
    if (!(qty >= 1 && qty <= 50)) { errors.push('Invalid quantity for ' + m.name); return; }
    var choices = m.box ? clean_(raw.choices, 200) : '';
    if (m.box && !choices) errors.push('Please add flavour choices for your ' + m.name + '.');
    var lineTotal = m.price * qty; total += lineTotal;
    lines.push({ id: raw.id, name: m.name, qty: qty, price: m.price, lineTotal: lineTotal, choices: choices, fridayOk: !!m.fridayOk });
  });
  var cakeToastOnly = lines.length > 0 && lines.every(function (l) { return l.fridayOk; });
  return { lines: lines, total: total, errors: errors, cakeToastOnly: cakeToastOnly };
}
function summarize_(lines) {
  return lines.map(function (l) { return l.qty + ' × ' + l.name + (l.choices ? ' [' + l.choices + ']' : '') + ' — ₹' + l.lineTotal; }).join('\n');
}

// -------------------------------------------------------------- sheet
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); }
  if (sh.getLastRow() === 0) formatSheet_(sh);
  return sh;
}
function formatSheet_(sh) {
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#3b2019').setFontColor('#fbf3ea');
  sh.setFrozenRows(1);
  // Keep phone numbers, IDs and dates as plain text
  ['Order ID', 'Phone', 'Delivery Date'].forEach(function (h) { sh.getRange(2, COL[h], sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  sh.getRange(2, COL['Created At'], sh.getMaxRows() - 1, 1).setNumberFormat('dd MMM yyyy, h:mm am/pm');
  sh.getRange(2, COL['Updated At'], sh.getMaxRows() - 1, 1).setNumberFormat('dd MMM yyyy, h:mm am/pm');
  // Delivery Fee holds a number, or the text TBC when the customer wasn't sure of the distance
  sh.getRange(1, COL['Delivery Fee (₹)']).setNote('Number in ₹, or TBC. Editing it here recalculates Total (installable trigger).');
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sh.getRange(2, COL['Status'], sh.getMaxRows() - 1, 1).setDataValidation(rule);
  sh.setColumnWidth(COL['Items JSON'], 120);
  sh.setColumnWidth(COL['Items Summary'], 320);
  sh.setColumnWidth(COL['Address'], 260);
}
function toYmd_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || ''); }
function toIso_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v || ''); }
function rowToOrder_(r) {
  var items = [];
  try { items = JSON.parse(r[COL['Items JSON'] - 1] || '[]'); } catch (e) {}
  return {
    orderId: String(r[COL['Order ID'] - 1]), createdAt: toIso_(r[COL['Created At'] - 1]),
    name: String(r[COL['Name'] - 1]), phone: String(r[COL['Phone'] - 1]).replace(/\D/g, '').slice(-10),
    email: String(r[COL['Email'] - 1]), address: String(r[COL['Address'] - 1]),
    deliveryDate: toYmd_(r[COL['Delivery Date'] - 1]), slot: String(r[COL['Slot'] - 1]),
    items: items, summary: String(r[COL['Items Summary'] - 1]),
    subtotal: Number(r[COL['Subtotal (₹)'] - 1]) || 0,
    distanceLabel: String(r[COL['Distance'] - 1] || ''), distance: distanceFromLabel_(r[COL['Distance'] - 1]),
    deliveryFee: feeCell_(r[COL['Delivery Fee (₹)'] - 1]), deliveryFeeTbc: feeCell_(r[COL['Delivery Fee (₹)'] - 1]) === null,
    total: Number(r[COL['Total (₹)'] - 1]) || 0,
    notes: String(r[COL['Notes'] - 1]), status: String(r[COL['Status'] - 1] || 'Pending'),
    adminNote: String(r[COL['Admin Note'] - 1] || ''), updatedAt: toIso_(r[COL['Updated At'] - 1]),
    lastEmailedStatus: String(r[COL['Last Emailed Status'] - 1] || '')
  };
}
function feeCell_(v) { return (v === '' || v === null || /tbc/i.test(String(v)) || isNaN(Number(v))) ? null : Number(v); }
function findRow_(sh, orderId) {
  var last = sh.getLastRow(); if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).toUpperCase() === orderId) return i + 2;
  return -1;
}
function readOrder_(sh, row) { return rowToOrder_(sh.getRange(row, 1, 1, HEADERS.length).getValues()[0]); }

function newOrderId_(sh) {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  for (var tries = 0; tries < 50; tries++) {
    var id = 'WB-';
    for (var i = 0; i < 4; i++) id += A.charAt(Math.floor(Math.random() * A.length));
    if (existing.indexOf(id) === -1) return id;
  }
  throw new Error('Could not generate a unique order id');
}

// ------------------------------------------------------------ actions
function createOrder_(p) {
  var o = p.order || {};
  if (o.website) return { ok: false, error: 'Spam check failed.' }; // honeypot
  var errors = [];
  var name = clean_(o.name, 80), phone = normalizePhone_(o.phone), email = clean_(o.email, 120);
  var address = clean_(o.address, 400), notes = clean_(o.notes, 500);
  if (name.length < 2) errors.push('Please enter your name.');
  if (!phone) errors.push('Please enter a valid 10-digit Indian mobile number.');
  if (!isEmail_(email)) errors.push('Please enter a valid email address.');
  if (address.length < 10) errors.push('Please enter your full delivery address.');
  var priced = priceItems_(o.items);
  errors = errors.concat(priced.errors);
  if (!priced.errors.length && priced.total < RULES.minOrder) errors.push('Minimum order is ₹' + RULES.minOrder + '. Your cart is ₹' + priced.total + '.');
  var d = availableDates_(priced.cakeToastOnly).filter(function (x) { return x.date === o.deliveryDate; })[0];
  if (!d) errors.push(priced.cakeToastOnly ? 'Please pick an available delivery day (Friday evening, Saturday or Sunday).'
    : 'Please pick an available Saturday or Sunday (order by Thursday 3 pm; Friday evening is for cake toast only).');
  var slots = d && d.kind === 'friday' ? RULES.fridaySlots : RULES.weekendSlots;
  if (d && slots.indexOf(o.slot) === -1) errors.push('Please pick a delivery slot.');
  var fee = deliveryFee_(priced.total, o.distance);
  if (!fee.valid) errors.push('Please choose your approximate distance from us.');
  if (errors.length) return { ok: false, error: errors[0], errors: errors };

  var lines = priced.lines.map(function (l) { return { id: l.id, name: l.name, qty: l.qty, price: l.price, lineTotal: l.lineTotal, choices: l.choices }; });
  var now = new Date(), order;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var id = newOrderId_(sh);
    order = { orderId: id, createdAt: now.toISOString(), name: name, phone: phone, email: email, address: address,
      deliveryDate: o.deliveryDate, deliveryKind: d.kind, slot: o.slot, items: lines, summary: summarize_(lines),
      subtotal: priced.total, distance: String(o.distance), distanceLabel: distanceLabel_(o.distance),
      deliveryFee: fee.fee, deliveryFeeTbc: fee.tbc, total: priced.total + (fee.fee || 0),
      notes: notes, status: 'Pending', adminNote: '', updatedAt: now.toISOString(), lastEmailedStatus: '' };
    var row = new Array(HEADERS.length);
    row[COL['Order ID'] - 1] = id;
    row[COL['Created At'] - 1] = now;
    row[COL['Name'] - 1] = safeCell_(name);
    row[COL['Phone'] - 1] = phone;
    row[COL['Email'] - 1] = safeCell_(email);
    row[COL['Address'] - 1] = safeCell_(address);
    row[COL['Delivery Date'] - 1] = o.deliveryDate;
    row[COL['Slot'] - 1] = o.slot;
    row[COL['Items JSON'] - 1] = JSON.stringify(lines);
    row[COL['Items Summary'] - 1] = safeCell_(order.summary);
    row[COL['Subtotal (₹)'] - 1] = order.subtotal;
    row[COL['Distance'] - 1] = order.distanceLabel;
    row[COL['Delivery Fee (₹)'] - 1] = order.deliveryFeeTbc ? 'TBC' : order.deliveryFee;
    row[COL['Total (₹)'] - 1] = order.total;
    row[COL['Notes'] - 1] = safeCell_(notes);
    row[COL['Status'] - 1] = 'Pending';
    row[COL['Admin Note'] - 1] = '';
    row[COL['Updated At'] - 1] = now;
    row[COL['Last Emailed Status'] - 1] = '';
    sh.appendRow(row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  sendMail_('received', order);
  notifyOwner_(order);
  return { ok: true, orderId: order.orderId, subtotal: order.subtotal, deliveryFee: order.deliveryFee, deliveryFeeTbc: order.deliveryFeeTbc,
    total: order.total, status: order.status, deliveryDate: order.deliveryDate, slot: order.slot };
}

function status_(p) {
  var id = clean_(p.orderId, 12).toUpperCase(), phone = normalizePhone_(p.phone);
  var notFound = { ok: false, error: "We couldn't find an order with that ID and phone number." };
  if (!/^WB-[A-Z0-9]{4}$/.test(id) || !phone) return notFound;
  var sh = sheet_(), row = findRow_(sh, id);
  if (row < 0) return notFound;
  var o = readOrder_(sh, row);
  if (o.phone !== phone) return notFound;
  return { ok: true, order: {
    orderId: o.orderId, firstName: o.name.split(' ')[0], status: o.status, deliveryDate: o.deliveryDate, slot: o.slot,
    summary: o.summary, items: o.items, subtotal: o.subtotal, distanceLabel: o.distanceLabel, deliveryFee: o.deliveryFee,
    deliveryFeeTbc: o.deliveryFeeTbc, total: o.total, adminNote: o.adminNote, createdAt: o.createdAt, updatedAt: o.updatedAt } };
}

function checkPassword_(pw) {
  var expected = props_().getProperty('ADMIN_PASSWORD');
  if (!expected) return { ok: false, error: 'ADMIN_PASSWORD is not set in Script Properties.', auth: false };
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('admin_fails') || 0);
  if (fails >= 10) return { ok: false, error: 'Too many wrong attempts. Try again in 15 minutes.', auth: false };
  if (String(pw || '') !== expected) {
    cache.put('admin_fails', String(fails + 1), 900);
    Utilities.sleep(400);
    return { ok: false, error: 'Wrong password.', auth: false };
  }
  return { ok: true };
}

function listOrders_(p) {
  var sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return { ok: true, orders: [] };
  var orders = sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(function (r) { return r[0]; }).map(rowToOrder_).reverse();
  if (p.status && STATUSES.indexOf(p.status) > -1) orders = orders.filter(function (o) { return o.status === p.status; });
  return { ok: true, orders: orders };
}

function updateStatus_(p) {
  if (STATUSES.indexOf(p.status) === -1) return { ok: false, error: 'Invalid status.' };
  var fee = parseFee_(p.deliveryFee);
  if (fee !== undefined && isNaN(fee)) return { ok: false, error: 'Delivery fee must be a whole number of rupees (0 or more).' };
  var id = clean_(p.orderId, 12).toUpperCase();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var o, emailSent = false, feeChanged = false, sh, row;
  try {
    sh = sheet_(); row = findRow_(sh, id);
    if (row < 0) return { ok: false, error: 'Order not found.' };
    var cur = readOrder_(sh, row);
    if (p.status === 'Confirmed' && fee === undefined && cur.deliveryFeeTbc) return { ok: false, error: 'Set the delivery fee before confirming this order.' };
    if (fee !== undefined) {
      feeChanged = cur.deliveryFeeTbc || fee !== cur.deliveryFee;
      sh.getRange(row, COL['Delivery Fee (₹)']).setValue(fee);
      sh.getRange(row, COL['Total (₹)']).setValue(cur.subtotal + fee);
    }
    sh.getRange(row, COL['Status']).setValue(p.status);
    if (typeof p.note === 'string') sh.getRange(row, COL['Admin Note']).setValue(safeCell_(clean_(p.note, 500)));
    sh.getRange(row, COL['Updated At']).setValue(new Date());
    SpreadsheetApp.flush();
    o = readOrder_(sh, row);
  } finally { lock.releaseLock(); }
  if (o.status !== 'Pending' && o.lastEmailedStatus !== o.status && p.sendEmail !== false) {
    emailSent = sendMail_('status', o);
    if (emailSent) { sh.getRange(row, COL['Last Emailed Status']).setValue(o.status); o.lastEmailedStatus = o.status; }
  }
  return { ok: true, order: o, emailSent: emailSent, feeChanged: feeChanged };
}

// -------------------------------------------- installable edit trigger
/**
 * Runs when someone edits the sheet by hand (installable onEdit trigger,
 * created by installTrigger()). If the Status cell changes to Confirmed or
 * Declined, the customer gets the matching email (only once per status).
 */
function onStatusEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET_NAME) return;
  var c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
  var feeCol = COL['Delivery Fee (₹)'];
  var touchesFee = feeCol >= c1 && feeCol <= c2, touchesStatus = COL['Status'] >= c1 && COL['Status'] <= c2;
  if (!touchesFee && !touchesStatus) return;
  for (var row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row++) {
    if (touchesFee) { // keep Total = Subtotal + Delivery Fee when the fee is typed in by hand
      var f = feeCell_(sh.getRange(row, feeCol).getValue());
      sh.getRange(row, COL['Total (₹)']).setValue((Number(sh.getRange(row, COL['Subtotal (₹)']).getValue()) || 0) + (f || 0));
      if (!touchesStatus) continue;
    }
    var o = readOrder_(sh, row);
    if (!o.orderId || !o.email) continue;
    sh.getRange(row, COL['Updated At']).setValue(new Date());
    if ((o.status === 'Confirmed' || o.status === 'Declined') && o.lastEmailedStatus !== o.status) {
      if (sendMail_('status', o)) sh.getRange(row, COL['Last Emailed Status']).setValue(o.status);
    }
  }
}

/** Run once from the editor: creates the installable onEdit trigger. */
function installTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onStatusEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(ss).onEdit().create();
  return 'Trigger installed';
}

/** Run once from the editor: creates/format the Orders sheet. */
function setup() {
  var sh = sheet_();
  if (sh.getLastRow() === 0) formatSheet_(sh);
  return 'Sheet ready: ' + sh.getName();
}

/** Adds a small "Bakery" menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧁 Bakery')
    .addItem('Set up Orders sheet', 'setup')
    .addItem('Install status-email trigger', 'installTrigger')
    .addToUi();
}

// -------------------------------------------------------------- email
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function buildEmail_(kind, o) {
  var c = cfg_(), when = formatDate_(o.deliveryDate) + ', ' + o.slot, subject, intro;
  if (kind === 'received') {
    subject = "We've got your order " + o.orderId + ' 🧁';
    intro = 'Hi ' + o.name + ", thank you for your order! It's now awaiting confirmation — we'll email you (and usually WhatsApp you) once it's confirmed.";
  } else if (o.status === 'Confirmed') {
    subject = 'Your order ' + o.orderId + ' is confirmed! 🎉';
    intro = 'Hi ' + o.name + ', great news — your order is confirmed and will be baked fresh for ' + when + '.';
  } else {
    subject = 'About your order ' + o.orderId;
    intro = 'Hi ' + o.name + ", we're really sorry — we can't take your order this time.";
  }
  var note = o.adminNote && kind !== 'received' ? 'Note from us: ' + o.adminNote : '';
  var estimate = kind === 'received' && !o.deliveryFeeTbc && o.deliveryFee > 0 ? ' (estimate — we confirm it with your order)' : '';
  var feeLine = 'Delivery (' + o.distanceLabel + '): ' + feeText_(o) + estimate;
  var totalTxt = '₹' + o.total + (o.deliveryFeeTbc ? ' + delivery' : '');
  var body = [intro].concat(note ? [note] : [], ['', 'Order ID: ' + o.orderId, 'Delivery: ' + when, 'Address: ' + o.address, '',
    o.summary, '', 'Subtotal: ₹' + o.subtotal, feeLine, 'Total: ' + totalTxt, '', '— ' + c.bakeryName]).join('\n');
  var itemsHtml = (o.items || []).map(function (l) {
    return '<tr><td style="padding:4px 0">' + l.qty + ' × ' + esc_(l.name) + (l.choices ? '<br><small style="color:#8a6f64">' + esc_(l.choices) + '</small>' : '') +
      '</td><td style="text-align:right">₹' + l.lineTotal + '</td></tr>';
  }).join('');
  var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#3b2018;background:#fbf4ec;padding:24px;border-radius:16px">' +
    '<h2 style="font-family:Georgia,serif;margin:0 0 4px">' + esc_(c.bakeryName) + '</h2><p>' + esc_(intro) + '</p>' +
    (note ? '<p style="background:#f6dcd4;padding:10px 14px;border-radius:10px">' + esc_(note) + '</p>' : '') +
    '<p><b>Order ID:</b> ' + esc_(o.orderId) + '<br><b>Delivery:</b> ' + esc_(when) + '<br><b>Address:</b> ' + esc_(o.address) + '</p>' +
    '<table style="width:100%;border-collapse:collapse">' + itemsHtml +
    '<tr><td style="border-top:1px solid #e6d3c7;padding-top:6px">Subtotal</td><td style="border-top:1px solid #e6d3c7;text-align:right">₹' + o.subtotal + '</td></tr>' +
    '<tr><td>Delivery <small style="color:#8a6f64">(' + esc_(o.distanceLabel) + ')</small>' + (estimate ? '<br><small style="color:#8a6f64">estimate — confirmed with your order</small>' : '') + '</td><td style="text-align:right">' + esc_(feeText_(o)) + '</td></tr>' +
    '<tr><td style="padding-top:6px"><b>Total</b></td><td style="text-align:right;padding-top:6px"><b>' + esc_(totalTxt) + '</b></td></tr></table>' +
    '<p style="color:#8a6f64;font-size:13px">Questions? WhatsApp ' + esc_(c.whatsappDisplay) + '</p></div>';
  return { to: o.email, subject: subject, body: body, htmlBody: htmlBody };
}

function sendMail_(kind, o) {
  try {
    var m = buildEmail_(kind, o), c = cfg_();
    var opts = { to: m.to, subject: m.subject, body: m.body, htmlBody: m.htmlBody, name: c.bakeryName };
    if (c.ownerEmail) opts.replyTo = c.ownerEmail;
    MailApp.sendEmail(opts);
    return true;
  } catch (err) {
    console.error('Email failed for ' + o.orderId + ': ' + err); // e.g. daily quota reached
    return false;
  }
}

function notifyOwner_(o) {
  var c = cfg_();
  if (!c.ownerEmail) return;
  try {
    MailApp.sendEmail({ to: c.ownerEmail, name: c.bakeryName, subject: '🧁 New order ' + o.orderId + ' — ₹' + o.total + ' for ' + formatDate_(o.deliveryDate),
      body: [o.name + ' · +91 ' + o.phone + ' · ' + o.email, o.address, 'Delivery: ' + formatDate_(o.deliveryDate) + ', ' + o.slot, '', o.summary,
        'Subtotal: ₹' + o.subtotal, 'Delivery (' + o.distanceLabel + '): ' + feeText_(o), 'Total: ₹' + o.total, o.notes ? '\nNotes: ' + o.notes : '', '\nOpen admin.html to confirm or decline.'].join('\n') });
  } catch (err) { console.error('Owner email failed: ' + err); }
}
