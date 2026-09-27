/* =====================================================================
   DEMO backend — used when config.js has MODE: 'demo'.
   Same request/response contract as server.js and apps-script/Code.gs,
   but everything is stored in THIS browser's localStorage, so the site
   works on static hosting (GitHub Pages / Netlify) with no server.
   - Orders only exist in the browser they were placed in.
   - Emails are NOT sent: they are recorded in localStorage (outbox) and
     the response carries `simulatedEmail` so the admin UI can say
     "email would be sent to …".
   Switch to the real backend by setting MODE: 'google' in config.js.
   ===================================================================== */
(function (root) {
  'use strict';
  var R = root.BakeryRules;
  // Bump DATA_VERSION whenever the order format / rules change: older demo
  // data in a visitor's browser is then discarded and fresh samples seeded.
  var DATA_VERSION = 3;
  var ORDERS_KEY = 'bakery_demo_orders_v' + DATA_VERSION;
  var OUTBOX_KEY = 'bakery_demo_outbox_v' + DATA_VERSION;
  var STATUSES = R.STATUSES;
  try { for (var v = 1; v < DATA_VERSION; v++) { localStorage.removeItem('bakery_demo_orders_v' + v); localStorage.removeItem('bakery_demo_outbox_v' + v); } } catch (e) {}

  function cfg() { return root.BAKERY_CONFIG; }
  function read(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function newOrderId(existing) {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      var id = 'WB-', buf = new Uint32Array(4);
      (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(buf) : buf.forEach(function (_, i) { buf[i] = Math.random() * 1e9; });
      for (var i = 0; i < 4; i++) id += A[buf[i] % A.length];
      if (!existing.some(function (o) { return o.orderId === id; })) return id;
    }
  }

  // ---- sample orders so the admin dashboard isn't empty on first visit
  function seed() {
    var c = cfg(), now = Date.now();
    var dates = R.availableDates({ weekendsToShow: c.weekendsToShow, cakeToastOnly: true, cutoffHour: c.cutoffHour });
    var fri = dates.filter(function (d) { return d.kind === 'friday'; })[0] || dates[0];
    var wk = dates.filter(function (d) { return d.kind === 'weekend'; });
    var sat = (wk[0] || dates[0]).date, sun = (wk[1] || wk[0] || dates[0]).date;
    function mk(id, minsAgo, name, phone, email, address, date, kind, slot, distance, items, status, note, notes, firstOrder) {
      var p = R.priceItems(items, c.menu), f = R.deliveryFee(p.total, distance, c.delivery);
      var discount = firstOrder ? R.offerAmount(p.total, c.launchOffer) : 0;
      var created = new Date(now - minsAgo * 60000).toISOString();
      var updated = status === 'Pending' ? created : new Date(now - Math.max(minsAgo - 25, 1) * 60000).toISOString();
      var lines = p.lines.map(function (l) { return { id: l.id, name: l.name, qty: l.qty, price: l.price, lineTotal: l.lineTotal, choices: l.choices }; });
      return { orderId: id, createdAt: created, name: name, phone: phone, email: email, address: address,
        deliveryDate: date, deliveryKind: kind, slot: slot, items: lines, summary: R.summarize(lines),
        distance: distance, distanceLabel: R.distanceLabel(distance, c.delivery), subtotal: p.total, discount: discount,
        deliveryFee: f.fee, deliveryFeeTbc: f.tbc, total: R.orderTotal(p.total, discount, f.fee), notes: notes || '',
        status: status, adminNote: note || '', updatedAt: updated, lastEmailedStatus: status === 'Pending' ? '' : status, sample: true };
    }
    return [
      // ₹620 beyond 3 km → ₹60 delivery; first order ≥ ₹500 → launch offer −₹50
      mk('WB-DEM1', 42, 'Asha Sample', '9000000001', 'asha.sample@example.com', '12 Example Lane, Sample Nagar, Pune 411001',
        sat, 'weekend', c.weekendSlots[0], 'beyond', [{ id: 'cc-box4', qty: 1, choices: '2 Red Velvet, 2 Strawberry Cream' }, { id: 'ck-darkstuffed', qty: 2 }, { id: 'ck-choco', qty: 1 }], 'Pending', '', 'Birthday — please add a small candle 🎂', true),
      // within 3 km → free delivery (not a first order, so no offer)
      mk('WB-DEM2', 180, 'Kabir Example', '9000000002', 'kabir.example@example.com', 'Flat 4B, Demo Heights, Test Road, Pune 411045',
        sun, 'weekend', c.weekendSlots[1], 'within', [{ id: 'bx-choclover', qty: 1 }], 'Confirmed', 'See you Sunday! Delivery around 2pm.'),
      // cake toast only → Friday evening; "not sure" distance → fee to be confirmed
      mk('WB-DEM3', 300, 'Zoya Demo', '9000000003', 'zoya.demo@example.com', '7 Placeholder Street, Mock Colony, Pune 411014',
        fri.date, 'friday', c.fridaySlots[0], 'unknown', [{ id: 'ct-elaichi', qty: 2 }], 'Pending')
    ];
  }

  function orders() {
    var o = read(ORDERS_KEY);
    if (!o) { o = seed(); write(ORDERS_KEY, o); }
    return o;
  }

  function record(kind, o) {
    var m = R.buildEmail(kind, o, cfg());
    var mail = { at: new Date().toISOString(), kind: kind, orderId: o.orderId, to: m.to, subject: m.subject, body: m.body, simulated: true };
    var box = read(OUTBOX_KEY) || []; box.push(mail); write(OUTBOX_KEY, box.slice(-50));
    if (root.console) console.info('[demo] email NOT sent (demo mode) → ' + mail.to + ': ' + mail.subject + '\n' + mail.body);
    return mail;
  }

  function createOrder(p) {
    var list = orders();
    var v = R.validateOrder(p.order, cfg(), undefined, { hasPriorOrder: function (phone) { return R.hasPriorOrder(list, phone); } });
    if (!v.ok) return { ok: false, error: v.error, errors: v.errors };
    var now = new Date().toISOString(), order = { orderId: newOrderId(list), createdAt: now };
    Object.keys(v.fields).forEach(function (k) { order[k] = v.fields[k]; });
    order.status = 'Pending'; order.adminNote = ''; order.updatedAt = now; order.lastEmailedStatus = '';
    list.push(order); write(ORDERS_KEY, list);
    record('received', order);
    return { ok: true, orderId: order.orderId, subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, deliveryFeeTbc: order.deliveryFeeTbc,
      total: order.total, status: order.status, deliveryDate: order.deliveryDate, slot: order.slot };
  }

  function handle(p) {
    p = p || {};
    var c = cfg(), action = p.action;
    if (action === 'ping') return { ok: true, mode: 'demo', time: new Date().toISOString() };
    if (action === 'createOrder') return createOrder(p);
    if (action === 'status') {
      var id = String(p.orderId || '').trim().toUpperCase(), phone = R.normalizePhone(p.phone);
      var o = orders().filter(function (x) { return x.orderId === id; })[0];
      if (!o || !phone || o.phone !== phone) return { ok: false, error: "We couldn't find an order with that ID and phone number." };
      return { ok: true, order: R.publicStatus(o) };
    }
    // Resetting only touches this visitor's own browser storage, so no password needed.
    if (action === 'resetDemo') { localStorage.removeItem(ORDERS_KEY); localStorage.removeItem(OUTBOX_KEY); orders(); return { ok: true }; }
    if (String(p.password || '') !== String(c.demoAdminPassword || 'bakery123')) return { ok: false, error: 'Wrong password.', auth: false };
    if (action === 'login') return { ok: true };
    if (action === 'listOrders') {
      var list = orders().slice().reverse();
      if (p.status && STATUSES.indexOf(p.status) !== -1) list = list.filter(function (x) { return x.status === p.status; });
      return { ok: true, orders: list };
    }
    if (action === 'updateStatus') {
      var all = orders(), ord = all.filter(function (x) { return x.orderId === String(p.orderId || '').toUpperCase(); })[0];
      if (!ord) return { ok: false, error: 'Order not found.' };
      var res = R.applyAdminUpdate(ord, p);
      if (!res.ok) return res;
      ord.updatedAt = new Date().toISOString();
      var mail = null;
      if (ord.status !== 'Pending' && ord.lastEmailedStatus !== ord.status && p.sendEmail !== false) {
        mail = record('status', ord); ord.lastEmailedStatus = ord.status;
      }
      write(ORDERS_KEY, all);
      return { ok: true, order: ord, emailSent: false, feeChanged: res.feeChanged, simulatedEmail: mail ? { to: mail.to, subject: mail.subject } : null };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  // Async like a real network call (small delay so loading states show briefly).
  root.BakeryDemoBackend = {
    request: function (payload) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          try { resolve(clone(handle(clone(payload)))); } catch (e) { resolve({ ok: false, error: 'Demo error: ' + e.message }); }
        }, 250);
      });
    }
  };
})(typeof self !== 'undefined' ? self : this);
