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
  var ORDERS_KEY = 'bakery_demo_orders_v1';
  var OUTBOX_KEY = 'bakery_demo_outbox_v1';
  var STATUSES = ['Pending', 'Confirmed', 'Declined'];

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
    var dates = R.availableDates({ today: R.todayIST(), weekendsToShow: c.weekendsToShow, weekdayDaysAhead: c.weekdayDaysAhead, cakeToastOnly: true });
    var weekend = dates.filter(function (d) { return d.kind !== 'weekday'; });
    var weekday = dates.filter(function (d) { return d.kind === 'weekday'; });
    var sat = (weekend[0] || dates[0]).date, sun = (weekend[1] || weekend[0] || dates[0]).date;
    var wk = (weekday[0] || dates[0]).date;
    function mk(id, minsAgo, name, phone, email, address, date, slot, items, status, note, notes) {
      var p = R.priceItems(items, c.menu);
      var created = new Date(now - minsAgo * 60000).toISOString();
      var updated = status === 'Pending' ? created : new Date(now - Math.max(minsAgo - 25, 1) * 60000).toISOString();
      return { orderId: id, createdAt: created, name: name, phone: phone, email: email, address: address,
        deliveryDate: date, slot: slot, items: p.lines, summary: R.summarize(p.lines), total: p.total, notes: notes || '',
        status: status, adminNote: note || '', updatedAt: updated, lastEmailedStatus: status === 'Pending' ? '' : status, sample: true };
    }
    return [
      mk('WB-DEM1', 42, 'Asha Sample', '9000000001', 'asha.sample@example.com', '12 Example Lane, Sample Nagar, Pune 411001',
        sat, c.weekendSlots[0], [{ id: 'bx-cookie', qty: 1, choices: '3 Choco-Chip, 3 Sea Salt' }, { id: 'cc-redvelvet', qty: 2 }], 'Pending', '', 'Birthday — please add a small candle 🎂'),
      mk('WB-DEM2', 180, 'Kabir Example', '9000000002', 'kabir.example@example.com', 'Flat 4B, Demo Heights, Test Road, Pune 411045',
        sun, c.weekendSlots[1], [{ id: 'ck-nutella', qty: 2 }, { id: 'cc-caramel', qty: 2 }], 'Confirmed', 'See you Sunday! Delivery around 2pm.'),
      mk('WB-DEM3', 300, 'Zoya Demo', '9000000003', 'zoya.demo@example.com', '7 Placeholder Street, Mock Colony, Pune 411014',
        wk, c.weekdaySlots[0], [{ id: 'ct-elaichi', qty: 2 }], 'Pending')
    ];
  }

  function orders() {
    var o = read(ORDERS_KEY);
    if (!o) { o = seed(); write(ORDERS_KEY, o); }
    return o;
  }

  function record(kind, o) {
    var subject = kind === 'received' ? "We've got your order " + o.orderId + ' 🧁'
      : o.status === 'Confirmed' ? 'Your order ' + o.orderId + ' is confirmed! 🎉' : 'About your order ' + o.orderId;
    var mail = { at: new Date().toISOString(), kind: kind, orderId: o.orderId, to: o.email, subject: subject, simulated: true };
    var box = read(OUTBOX_KEY) || []; box.push(mail); write(OUTBOX_KEY, box.slice(-50));
    if (root.console) console.info('[demo] email NOT sent (demo mode) → ' + mail.to + ': ' + subject);
    return mail;
  }

  function publicStatus(o) {
    return { orderId: o.orderId, firstName: String(o.name).split(' ')[0], status: o.status, deliveryDate: o.deliveryDate, slot: o.slot,
      summary: o.summary, items: o.items, total: o.total, adminNote: o.adminNote, createdAt: o.createdAt, updatedAt: o.updatedAt };
  }

  function createOrder(p) {
    var c = cfg(), o = p.order || {}, errors = [];
    if (o.website) return { ok: false, error: 'Spam check failed.' };
    var name = String(o.name || '').trim().slice(0, 80), phone = R.normalizePhone(o.phone);
    var email = String(o.email || '').trim().slice(0, 120), address = String(o.address || '').trim().slice(0, 400);
    var notes = String(o.notes || '').trim().slice(0, 500);
    if (name.length < 2) errors.push('Please enter your name.');
    if (!phone) errors.push('Please enter a valid 10-digit Indian mobile number.');
    if (!R.isValidEmail(email)) errors.push('Please enter a valid email address.');
    if (address.length < 10) errors.push('Please enter your full delivery address.');
    var priced = R.priceItems(o.items, c.menu);
    errors = errors.concat(priced.errors);
    if (!priced.errors.length && priced.total < c.minOrder) errors.push('Minimum order is ₹' + c.minOrder + '. Your cart is ₹' + priced.total + '.');
    var dates = R.availableDates({ today: R.todayIST(), weekendsToShow: c.weekendsToShow, weekdayDaysAhead: c.weekdayDaysAhead, cakeToastOnly: priced.cakeToastOnly });
    var d = dates.filter(function (x) { return x.date === o.deliveryDate; })[0];
    if (!d) errors.push(priced.cakeToastOnly ? 'Please pick an available delivery date.' : 'Please pick an available Saturday or Sunday (pre-order by Thursday; weekday delivery is for cake toast only).');
    var slots = d && d.kind === 'weekday' ? c.weekdaySlots : c.weekendSlots;
    if (d && slots.indexOf(o.slot) === -1) errors.push('Please pick a delivery slot.');
    if (errors.length) return { ok: false, error: errors[0], errors: errors };
    var list = orders(), now = new Date().toISOString();
    var order = { orderId: newOrderId(list), createdAt: now, name: name, phone: phone, email: email, address: address,
      deliveryDate: o.deliveryDate, slot: o.slot, items: priced.lines, summary: R.summarize(priced.lines), total: priced.total,
      notes: notes, status: 'Pending', adminNote: '', updatedAt: now, lastEmailedStatus: '' };
    list.push(order); write(ORDERS_KEY, list);
    record('received', order);
    return { ok: true, orderId: order.orderId, total: order.total, status: order.status, deliveryDate: order.deliveryDate, slot: order.slot };
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
      return { ok: true, order: publicStatus(o) };
    }
    if (String(p.password || '') !== String(c.demoAdminPassword || 'bakery123')) return { ok: false, error: 'Wrong password.', auth: false };
    if (action === 'login') return { ok: true };
    if (action === 'listOrders') {
      var list = orders().slice().reverse();
      if (p.status && STATUSES.indexOf(p.status) !== -1) list = list.filter(function (x) { return x.status === p.status; });
      return { ok: true, orders: list };
    }
    if (action === 'updateStatus') {
      if (STATUSES.indexOf(p.status) === -1) return { ok: false, error: 'Invalid status.' };
      var all = orders(), ord = all.filter(function (x) { return x.orderId === String(p.orderId || '').toUpperCase(); })[0];
      if (!ord) return { ok: false, error: 'Order not found.' };
      ord.status = p.status;
      if (typeof p.note === 'string') ord.adminNote = p.note.trim().slice(0, 500);
      ord.updatedAt = new Date().toISOString();
      var mail = null;
      if (ord.status !== 'Pending' && ord.lastEmailedStatus !== ord.status && p.sendEmail !== false) {
        mail = record('status', ord); ord.lastEmailedStatus = ord.status;
      }
      write(ORDERS_KEY, all);
      return { ok: true, order: ord, emailSent: false, simulatedEmail: mail ? { to: mail.to, subject: mail.subject } : null };
    }
    if (action === 'resetDemo') { localStorage.removeItem(ORDERS_KEY); localStorage.removeItem(OUTBOX_KEY); orders(); return { ok: true }; }
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
