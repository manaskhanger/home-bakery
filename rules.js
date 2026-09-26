/* Shared ordering rules — used by the browser (app.js) AND the local mock
   server (server.js). apps-script/Code.gs contains the same logic.
   All dates are 'YYYY-MM-DD' strings in India time (IST, UTC+5:30). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BakeryRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var IST_OFFSET_MIN = 330;
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function todayIST(nowMs) {
    var ms = (typeof nowMs === 'number' ? nowMs : Date.now()) + IST_OFFSET_MIN * 60000;
    return new Date(ms).toISOString().slice(0, 10);
  }
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

  /* Weekend delivery (Sat & Sun) needs the order by Thursday (end of day)
     of the same week. Weekday evening delivery only for cake-toast-only carts. */
  function availableDates(opts) {
    var today = opts.today || todayIST();
    var weekends = opts.weekendsToShow || 2;
    var weekdayDays = opts.weekdayDaysAhead || 14;
    var out = [];
    var sat = addDays(today, (6 - dayOfWeek(today) + 7) % 7);
    var found = 0, guard = 0;
    while (found < weekends && guard++ < 10) {
      var cutoff = addDays(sat, -2); // Thursday
      if (today <= cutoff) {
        out.push({ date: sat, kind: 'weekend', cutoff: cutoff });
        out.push({ date: addDays(sat, 1), kind: 'weekend', cutoff: cutoff });
        found++;
      }
      sat = addDays(sat, 7);
    }
    if (opts.cakeToastOnly) {
      for (var i = 1; i <= weekdayDays; i++) {
        var dd = addDays(today, i), w = dayOfWeek(dd);
        if (w >= 1 && w <= 5) out.push({ date: dd, kind: 'weekday' });
      }
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  function normalizePhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  }
  function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }

  function indexMenu(menu) {
    var idx = {};
    menu.forEach(function (cat) {
      cat.items.forEach(function (it) {
        idx[it.id] = { id: it.id, name: it.cartName || it.name, price: it.price, box: !!it.box, category: cat.id, weekdayOk: !!cat.weekdayOk };
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
      var choices = m.box ? String(raw.choices || '').trim().slice(0, 200) : '';
      if (m.box && !choices) errors.push('Please add flavour choices for your ' + m.name + '.');
      var lineTotal = m.price * qty;
      total += lineTotal;
      lines.push({ id: m.id, name: m.name, qty: qty, price: m.price, lineTotal: lineTotal, choices: choices, category: m.category, weekdayOk: m.weekdayOk });
    });
    var cakeToastOnly = lines.length > 0 && lines.every(function (l) { return l.weekdayOk; });
    return { lines: lines, total: total, errors: errors, cakeToastOnly: cakeToastOnly };
  }

  function summarize(lines, currency) {
    currency = currency || '₹';
    return lines.map(function (l) {
      return l.qty + ' × ' + l.name + (l.choices ? ' [' + l.choices + ']' : '') + ' — ' + currency + l.lineTotal;
    }).join('\n');
  }

  return {
    todayIST: todayIST, addDays: addDays, dayOfWeek: dayOfWeek, formatDate: formatDate,
    availableDates: availableDates, normalizePhone: normalizePhone, isValidEmail: isValidEmail,
    indexMenu: indexMenu, priceItems: priceItems, summarize: summarize
  };
});
