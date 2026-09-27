/* Shared ordering rules — used by the browser (app.js), the demo backend
   (demo-backend.js) AND the local mock server (server.js).
   apps-script/Code.gs contains the same logic for Google Apps Script.
   All dates are 'YYYY-MM-DD' strings in India time (IST, UTC+5:30),
   computed from the real clock — independent of the visitor's time zone. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BakeryRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var IST_OFFSET_MIN = 330;
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STATUSES = ['Pending', 'Confirmed', 'Declined'];

  // ------------------------------------------------------------ dates
  function istParts(nowMs) {
    var d = new Date((typeof nowMs === 'number' ? nowMs : Date.now()) + IST_OFFSET_MIN * 60000);
    return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
  function todayIST(nowMs) { return istParts(nowMs).date; }
  function addDays(ymd, n) {
    var d = new Date(ymd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dayOfWeek(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); } // 0=Sun … 6=Sat
  function formatDate(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return ymd || '';
    var d = new Date(ymd + 'T00:00:00Z');
    return DAYS[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function formatHour(h) { return (h % 12 || 12) + (h < 12 ? ' am' : ' pm'); }

  /* Delivery days for each week: Friday evening (cake-toast-only carts),
     Saturday and Sunday (whole menu). Orders close Thursday at
     opts.cutoffHour (default 15 = 3 pm) IST of the same week.
     opts: { now (ms), today ('YYYY-MM-DD', = start of that day), weekendsToShow, cakeToastOnly, cutoffHour } */
  function availableDates(opts) {
    opts = opts || {};
    var n = opts.today ? { date: opts.today, minutes: 0 } : istParts(opts.now);
    var weekends = opts.weekendsToShow || 2;
    var cutoffMin = (opts.cutoffHour == null ? 15 : opts.cutoffHour) * 60;
    var out = [];
    var fri = addDays(n.date, (5 - dayOfWeek(n.date) + 7) % 7);
    var found = 0, guard = 0;
    while (found < weekends && guard++ < 10) {
      var cutoff = addDays(fri, -1); // Thursday
      var open = n.date < cutoff || (n.date === cutoff && n.minutes < cutoffMin);
      if (open) {
        if (opts.cakeToastOnly) out.push({ date: fri, kind: 'friday', cutoff: cutoff });
        out.push({ date: addDays(fri, 1), kind: 'weekend', cutoff: cutoff });
        out.push({ date: addDays(fri, 2), kind: 'weekend', cutoff: cutoff });
        found++;
      }
      fri = addDays(fri, 7);
    }
    return out;
  }
  function slotsFor(kind, cfg) { return kind === 'friday' ? cfg.fridaySlots : cfg.weekendSlots; }

  // -------------------------------------------------------- validation
  function normalizePhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  }
  function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }

  // -------------------------------------------------------------- menu
  /* Flavour choices for boxes: 'required' | 'optional' (blank = baker's choice) | 'none' (fixed contents) */
  var BAKERS_CHOICE = "Baker's choice";
  function pickOf(it) { return it.box ? (it.pick === 'optional' || it.pick === 'none' ? it.pick : 'required') : 'none'; }
  function indexMenu(menu) {
    var idx = {};
    menu.forEach(function (cat) {
      cat.items.forEach(function (it) {
        idx[it.id] = { id: it.id, name: it.cartName || it.name, price: it.price, box: !!it.box, pick: pickOf(it), category: cat.id, fridayOk: !!cat.fridayOk };
      });
    });
    return idx;
  }

  /* Validate + price a cart against the menu. items: [{id, qty, choices}] */
  function priceItems(items, menu) {
    var idx = indexMenu(menu), lines = [], errors = [], total = 0;
    if (!Array.isArray(items) || !items.length) errors.push('Your cart is empty.');
    (items || []).forEach(function (raw) {
      var m = idx[raw && raw.id];
      var qty = parseInt(raw && raw.qty, 10);
      if (!m) { errors.push('Unknown item: ' + (raw && raw.id)); return; }
      if (!(qty >= 1 && qty <= 50)) { errors.push('Invalid quantity for ' + m.name); return; }
      var choices = m.pick !== 'none' ? String(raw.choices || '').trim().slice(0, 200) : '';
      if (m.pick === 'required' && !choices) errors.push('Please add flavour choices for your ' + m.name + '.');
      if (m.pick === 'optional' && !choices) choices = BAKERS_CHOICE;
      var lineTotal = m.price * qty;
      total += lineTotal;
      lines.push({ id: m.id, name: m.name, qty: qty, price: m.price, lineTotal: lineTotal, choices: choices, category: m.category, fridayOk: m.fridayOk });
    });
    var cakeToastOnly = lines.length > 0 && lines.every(function (l) { return l.fridayOk; });
    return { lines: lines, total: total, errors: errors, cakeToastOnly: cakeToastOnly };
  }

  function summarize(lines, currency) {
    currency = currency || '₹';
    return lines.map(function (l) {
      return l.qty + ' × ' + l.name + (l.choices ? ' [' + l.choices + ']' : '') + ' — ' + currency + l.lineTotal;
    }).join('\n');
  }

  // ---------------------------------------------------------- delivery
  /* d = { freeWithinKm: 3, freeFromOrder: 800, flatBeyond: 60 }
     The free-delivery threshold uses the items subtotal BEFORE any discount. */
  function distanceOptions(d) {
    return [
      { value: 'within', label: 'Within ' + d.freeWithinKm + ' km' },
      { value: 'beyond', label: 'Beyond ' + d.freeWithinKm + ' km' },
      { value: 'unknown', label: 'Not sure' }
    ];
  }
  function distanceLabel(value, d) {
    var o = distanceOptions(d).filter(function (x) { return x.value === String(value); })[0];
    return o ? o.label : '';
  }
  /* Returns { valid, fee (number|null), tbc, free, reason: 'nearby'|'order'|'distance'|'unknown', addForFree } */
  function deliveryFee(subtotal, distance, d) {
    distance = String(distance == null ? '' : distance);
    var valid = distanceOptions(d).some(function (x) { return x.value === distance; });
    var bigOrder = subtotal >= d.freeFromOrder;
    var gap = Math.max(0, d.freeFromOrder - subtotal);
    if (!valid) return { valid: false, fee: null, tbc: true, free: false, reason: '', addForFree: bigOrder ? 0 : gap };
    if (distance === 'within') return { valid: true, fee: 0, tbc: false, free: true, reason: 'nearby', addForFree: 0 };
    if (bigOrder) return { valid: true, fee: 0, tbc: false, free: true, reason: 'order', addForFree: 0 };
    if (distance === 'unknown') return { valid: true, fee: null, tbc: true, free: false, reason: 'unknown', addForFree: gap };
    return { valid: true, fee: d.flatBeyond, tbc: false, free: false, reason: 'distance', addForFree: gap };
  }

  // ------------------------------------------------------ launch offer
  /* The discount an order WOULD get if it is the customer's first order. */
  function offerAmount(subtotal, offer) {
    return offer && offer.amount > 0 && subtotal >= offer.minSubtotal ? offer.amount : 0;
  }
  /* Is there an earlier (non-declined) order from this phone? orders = [{phone, status}] */
  function hasPriorOrder(orders, phone) {
    return (orders || []).some(function (o) { return normalizePhone(o.phone) === phone && o.status !== 'Declined'; });
  }
  function orderTotal(subtotal, discount, fee) { return Number(subtotal) - (Number(discount) || 0) + (Number(fee) || 0); }
  function feeText(order, currency) {
    currency = currency || '₹';
    if (order.deliveryFeeTbc || order.deliveryFee == null) return 'To be confirmed';
    return Number(order.deliveryFee) === 0 ? 'Free' : currency + order.deliveryFee;
  }

  // ------------------------------------------- shared order operations
  /* Validates a createOrder payload. Returns { ok:false, error, errors } or
     { ok:true, fields } (everything except orderId / timestamps). */
  /* opts.hasPriorOrder(phone) -> true if this phone already has a (non-declined)
     order; used for the first-order launch offer. */
  function validateOrder(o, cfg, nowMs, opts) {
    o = o || {}; opts = opts || {};
    var errors = [];
    if (o.website) return { ok: false, error: 'Spam check failed.', errors: ['Spam check failed.'] }; // honeypot
    var name = String(o.name || '').trim().slice(0, 80);
    var phone = normalizePhone(o.phone);
    var email = String(o.email || '').trim().slice(0, 120);
    var address = String(o.address || '').trim().slice(0, 400);
    var notes = String(o.notes || '').trim().slice(0, 500);
    if (name.length < 2) errors.push('Please enter your name.');
    if (!phone) errors.push('Please enter a valid 10-digit Indian mobile number.');
    if (!isValidEmail(email)) errors.push('Please enter a valid email address.');
    if (address.length < 10) errors.push('Please enter your full delivery address.');
    var priced = priceItems(o.items, cfg.menu);
    errors = errors.concat(priced.errors);
    if (!priced.errors.length && priced.total < cfg.minOrder) errors.push('Minimum order is ₹' + cfg.minOrder + '. Your cart is ₹' + priced.total + '.');
    var dates = availableDates({ now: nowMs, weekendsToShow: cfg.weekendsToShow, cakeToastOnly: priced.cakeToastOnly, cutoffHour: cfg.cutoffHour });
    var d = dates.filter(function (x) { return x.date === o.deliveryDate; })[0];
    if (!d) errors.push(priced.cakeToastOnly
      ? 'Please pick an available delivery day (Friday evening, Saturday or Sunday).'
      : 'Please pick an available Saturday or Sunday (order by Thursday ' + formatHour(cfg.cutoffHour == null ? 15 : cfg.cutoffHour) + '; Friday evening is for cake toast only).');
    if (d && slotsFor(d.kind, cfg).indexOf(o.slot) === -1) errors.push('Please pick a delivery slot.');
    var fee = deliveryFee(priced.total, o.distance, cfg.delivery);
    if (!fee.valid) errors.push('Please choose within or beyond ' + cfg.delivery.freeWithinKm + ' km (or not sure).');
    if (errors.length) return { ok: false, error: errors[0], errors: errors };
    var lines = priced.lines.map(function (l) { return { id: l.id, name: l.name, qty: l.qty, price: l.price, lineTotal: l.lineTotal, choices: l.choices }; });
    var potential = offerAmount(priced.total, cfg.launchOffer);
    var discount = potential && !(opts.hasPriorOrder && opts.hasPriorOrder(phone)) ? potential : 0;
    return { ok: true, fields: {
      name: name, phone: phone, email: email, address: address, notes: notes,
      deliveryDate: o.deliveryDate, deliveryKind: d.kind, slot: o.slot,
      items: lines, summary: summarize(lines),
      distance: String(o.distance), distanceLabel: distanceLabel(o.distance, cfg.delivery),
      subtotal: priced.total, discount: discount, deliveryFee: fee.fee, deliveryFeeTbc: fee.tbc,
      total: orderTotal(priced.total, discount, fee.fee)
    } };
  }

  /* Parses an admin-entered delivery fee. Returns a number, undefined (not given) or NaN (invalid). */
  function parseFee(v) {
    if (v === undefined || v === null || String(v).trim() === '') return undefined;
    var n = Number(String(v).replace(/[₹,\s]/g, ''));
    return (isFinite(n) && n >= 0 && n <= 5000 && Math.round(n) === n) ? n : NaN;
  }

  /* Applies an admin updateStatus payload to an order object (mutates it).
     Returns { ok:false, error } or { ok:true, feeChanged }. */
  function applyAdminUpdate(order, p) {
    if (STATUSES.indexOf(p.status) === -1) return { ok: false, error: 'Invalid status.' };
    var fee = parseFee(p.deliveryFee), feeChanged = false;
    if (fee !== undefined && isNaN(fee)) return { ok: false, error: 'Delivery fee must be a whole number of rupees (0 or more).' };
    var tbcAfter = fee !== undefined ? false : !!order.deliveryFeeTbc;
    if (p.status === 'Confirmed' && tbcAfter) return { ok: false, error: 'Set the delivery fee before confirming this order.' };
    if (fee !== undefined) {
      feeChanged = fee !== order.deliveryFee || !!order.deliveryFeeTbc;
      order.deliveryFee = fee; order.deliveryFeeTbc = false;
      order.total = orderTotal(order.subtotal, order.discount, fee);
    }
    order.status = p.status;
    if (typeof p.note === 'string') order.adminNote = p.note.trim().slice(0, 500);
    return { ok: true, feeChanged: feeChanged };
  }

  function publicStatus(o) {
    return { orderId: o.orderId, firstName: String(o.name).split(' ')[0], status: o.status, deliveryDate: o.deliveryDate, slot: o.slot,
      summary: o.summary, items: o.items, subtotal: o.subtotal, discount: Number(o.discount) || 0, distanceLabel: o.distanceLabel, deliveryFee: o.deliveryFee,
      deliveryFeeTbc: !!o.deliveryFeeTbc, total: o.total, adminNote: o.adminNote, createdAt: o.createdAt, updatedAt: o.updatedAt };
  }

  /* Plain-text email used by the local mock & demo (Code.gs has its own copy). */
  function buildEmail(kind, o, cfg) {
    var when = formatDate(o.deliveryDate) + ', ' + o.slot, subject, intro;
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
    var feeLine = 'Delivery (' + o.distanceLabel + '): ' + feeText(o) + (kind === 'received' && !o.deliveryFeeTbc && o.deliveryFee > 0 ? ' (for the distance you picked — we confirm it with your order)' : '');
    var body = [intro].concat(note ? [note] : [], ['', 'Order ID: ' + o.orderId, 'Delivery: ' + when, 'Address: ' + o.address, '',
      o.summary, '', 'Subtotal: ₹' + o.subtotal].concat(Number(o.discount) > 0 ? ['Launch offer (first order): −₹' + o.discount] : [], [feeLine, 'Total: ₹' + o.total + (o.deliveryFeeTbc ? ' + delivery' : ''), '', '— ' + cfg.bakeryName])).join('\n');
    return { to: o.email, subject: subject, body: body };
  }

  return {
    STATUSES: STATUSES, todayIST: todayIST, istParts: istParts, addDays: addDays, dayOfWeek: dayOfWeek,
    formatDate: formatDate, formatHour: formatHour, availableDates: availableDates, slotsFor: slotsFor,
    normalizePhone: normalizePhone, isValidEmail: isValidEmail, indexMenu: indexMenu, priceItems: priceItems,
    summarize: summarize, distanceOptions: distanceOptions, distanceLabel: distanceLabel, deliveryFee: deliveryFee,
    feeText: feeText, offerAmount: offerAmount, hasPriorOrder: hasPriorOrder, orderTotal: orderTotal, BAKERS_CHOICE: BAKERS_CHOICE, validateOrder: validateOrder, parseFee: parseFee, applyAdminUpdate: applyAdminUpdate,
    publicStatus: publicStatus, buildEmail: buildEmail
  };
});
