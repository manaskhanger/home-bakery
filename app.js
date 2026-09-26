/* Bakery site — vanilla JS for index.html, status.html and admin.html */
(function () {
  'use strict';
  var CFG = window.BAKERY_CONFIG;
  var R = window.BakeryRules;
  var CUR = CFG.currency || '₹';
  var page = document.body.dataset.page;

  // ------------------------------------------------------------ helpers
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return CUR + Number(n || 0).toLocaleString('en-IN'); }
  function waLink(number, text) { return 'https://wa.me/' + String(number || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function toast(msg, ms) {
    var t = $('[data-toast]'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function fmtDateTime(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; }
  }

  // All API calls: POST with text/plain so the browser skips the CORS
  // preflight (required for Google Apps Script web apps).
  var DEMO = CFG.MODE === 'demo';
  function api(payload) {
    // 'demo' mode: no server — orders live in this browser (demo-backend.js)
    if (DEMO && window.BakeryDemoBackend) return window.BakeryDemoBackend.request(payload);
    var url = CFG.API_URLS[CFG.MODE];
    return fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'Could not reach the server. Please check your connection and try again.' }; });
  }

  // ------------------------------------------------------ config binding
  document.title = document.title.replace('Your Bakery Name', CFG.bakeryName);
  $$('[data-cfg]').forEach(function (el) { var v = CFG[el.dataset.cfg]; if (v != null) el.textContent = v; });
  $$('[data-cfg-money]').forEach(function (el) { el.textContent = money(CFG[el.dataset.cfgMoney]); });
  $$('[data-wa-link]').forEach(function (el) { el.href = waLink(CFG.whatsappNumber, 'Hi ' + CFG.bakeryName + '! 👋'); });
  $$('[data-ig-link]').forEach(function (el) { el.href = 'https://instagram.com/' + CFG.instagramHandle; });
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Hero sprinkles (deterministic, like the printed menu)
  $$('.sprinkles').forEach(function (box) {
    var colors = ['#f4b6c2', '#e89a4f', '#8fd3c1', '#d94f6d', '#f3dcae', '#f7d0c4'];
    var spots = [[3,18],[5,62],[2,88],[12,7],[27,5],[40,93],[47,4],[56,95],[61,8],[67,90],[73,5],[80,93],[86,12],[92,48],[96,80],[97,24],[20,94],[33,96]];
    box.innerHTML = spots.map(function (s, i) {
      return '<i style="left:' + s[0] + '%;top:' + s[1] + '%;background:' + colors[i % colors.length] + ';transform:rotate(' + ((i * 47) % 180 - 90) + 'deg)"></i>';
    }).join('');
  });

  // Photos: fade in when loaded; fall back to the category emoji if a file is missing
  function wireImages(root) {
    $$('.p-img, .cl-thumb', root).forEach(function (wrap) {
      var img = wrap.querySelector('img');
      if (!img) { wrap.classList.add('noimg'); return; }
      var done = function () { wrap.classList.add('loaded'); };
      var fail = function () { wrap.classList.add('noimg'); img.remove(); };
      if (img.complete && img.naturalWidth) done(); else if (img.complete) fail();
      else { img.addEventListener('load', done); img.addEventListener('error', fail); }
    });
  }
  $$('[data-cfg-src]').forEach(function (el) { var v = CFG[el.dataset.cfgSrc]; if (v) el.src = v; });
  (function nextBake() {
    var d = R.availableDates({ weekendsToShow: 1 }).filter(function (x) { return x.kind === 'weekend'; });
    if (d.length < 2) return;
    var sat = R.formatDate(d[0].date).split(', ')[1], sun = R.formatDate(d[1].date).split(', ')[1];
    $$('[data-next-bake]').forEach(function (el) { el.textContent = 'Sat ' + sat + ' & Sun ' + sun; });
    $$('[data-next-cutoff]').forEach(function (el) { el.textContent = 'Order by Thu, ' + R.formatDate(d[0].cutoff).split(', ')[1]; });
  })();

  var MENU_INDEX = R.indexMenu(CFG.menu);
  var ITEM_META = {}, CAT_ICON = {};
  CFG.menu.forEach(function (c) { c.items.forEach(function (it) { ITEM_META[it.id] = it; CAT_ICON[it.id] = c.icon; }); });
  function catIcon(id) { return CAT_ICON[id] || '🧁'; }

  if (page === 'home') initHome();
  if (page === 'status') initStatus();
  if (page === 'admin') initAdmin();

  // ================================================================ HOME
  function initHome() {
    var CART_KEY = 'bakery_cart_v1';
    var cart = loadCart();
    var drawer = $('#drawer'), overlay = $('.drawer-overlay');
    var selected = { date: null, slot: null };

    function loadCart() {
      try {
        var c = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        return c.filter(function (l) { return MENU_INDEX[l.id] && l.qty > 0; });
      } catch (e) { return []; }
    }
    function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }
    function qtyOf(id) { var l = cart.find(function (x) { return x.id === id; }); return l ? l.qty : 0; }
    function setQty(id, q) {
      var l = cart.find(function (x) { return x.id === id; });
      q = Math.max(0, Math.min(50, q));
      if (!l && q > 0) cart.push({ id: id, qty: q, choices: '' });
      else if (l && q === 0) cart = cart.filter(function (x) { return x.id !== id; });
      else if (l) l.qty = q;
      saveCart(); renderAll();
    }
    function priced() { return R.priceItems(cart, CFG.menu); }
    function itemCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }

    // ---- menu rendering
    function addControl(id) {
      var q = qtyOf(id);
      if (!q) return '<button class="add-btn" type="button" data-add="' + id + '" aria-label="Add ' + esc(MENU_INDEX[id].name) + '">Add <span aria-hidden="true">+</span></button>';
      return '<div class="stepper" role="group" aria-label="Quantity">' +
        '<button type="button" data-dec="' + id + '" aria-label="Remove one">−</button>' +
        '<span>' + q + '</span>' +
        '<button type="button" data-inc="' + id + '" aria-label="Add one">+</button></div>';
    }
    function productCard(it, cat) {
      var img = '<div class="p-img" data-icon="' + cat.icon + '">' +
        (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '" width="800" height="600" loading="lazy" decoding="async">' : '') + '</div>';
      var price = it.box ? '<span class="box-price">' + money(it.price) + '</span>' : '<span class="price">' + money(it.price) + '</span>';
      return '<article class="product' + (it.box ? ' product-box' : '') + '" id="item-' + it.id + '">' + img +
        (it.badge ? '<span class="badge">' + esc(it.badge) + '</span>' : '') +
        '<div class="p-body"><h4>' + esc(it.name) + '</h4><p>' + esc(it.desc) + '</p>' +
        '<div class="p-foot">' + price + '<div class="ctl" data-ctl="' + it.id + '">' + addControl(it.id) + '</div></div></div></article>';
    }
    function renderMenu() {
      $('#menu-root').innerHTML = CFG.menu.map(function (cat) {
        var cols = cat.items.length >= 4 ? 'cols-4' : 'cols-3';
        return '<section class="cat cat-' + cat.style + '" id="cat-' + cat.id + '" aria-labelledby="h-' + cat.id + '">' +
          '<div class="cat-head"><span class="cat-icon" aria-hidden="true">' + cat.icon + '</span><div><h3 id="h-' + cat.id + '">' + esc(cat.title) + '</h3><p class="cat-note">' + esc(cat.note) + '</p></div></div>' +
          '<div class="products ' + cols + '">' + cat.items.map(function (it) { return productCard(it, cat); }).join('') + '</div></section>';
      }).join('');
      wireImages($('#menu-root'));
    }
    function refreshControls() {
      $$('[data-ctl]').forEach(function (el) { el.innerHTML = addControl(el.dataset.ctl); });
    }

    // ---- cart rendering
    function renderCart() {
      var p = priced(), n = itemCount();
      $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
      $$('[data-cart-total]').forEach(function (el) { el.textContent = money(p.total); });
      $$('[data-cart-items]').forEach(function (el) { el.textContent = n + (n === 1 ? ' item' : ' items'); });
      var bar = $('.cart-bar'); if (bar) bar.hidden = n === 0 || drawer.classList.contains('open');

      $('[data-cart-empty]').hidden = cart.length > 0;
      $('[data-more-link]').hidden = cart.length === 0;
      $('[data-cart-foot]').hidden = cart.length === 0;
      var ul = $('[data-cart-lines]');
      // keep focus in the choices field while typing
      var active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.choices : null;
      ul.innerHTML = cart.map(function (l) {
        var m = MENU_INDEX[l.id], meta = ITEM_META[l.id];
        return '<li class="cart-line">' +
          '<div class="cl-main"><span class="cl-thumb" data-icon="' + esc(catIcon(l.id)) + '">' + (meta.image ? '<img src="' + esc(meta.image) + '" alt="" width="800" height="600">' : '') + '</span>' +
          '<div class="cl-name"><b>' + esc(m.name) + '</b><small>' + money(m.price) + ' each</small></div>' +
          '<div class="cl-right"><div class="stepper small"><button type="button" data-dec="' + l.id + '" aria-label="Remove one">−</button><span>' + l.qty + '</span><button type="button" data-inc="' + l.id + '" aria-label="Add one">+</button></div>' +
          '<span class="cl-total">' + money(m.price * l.qty) + '</span></div></div>' +
          (m.box ? '<label class="choices"><span>Flavour choices' + (l.qty > 1 ? ' (for all ' + l.qty + ' boxes)' : '') + '</span><input data-choices="' + l.id + '" maxlength="200" value="' + esc(l.choices) + '" placeholder="' + esc(meta.hint || 'Tell us your flavours') + '"></label>' : '') +
          '</li>';
      }).join('');
      wireImages(ul);
      if (active) { var f = $('[data-choices="' + active + '"]'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }

      var min = CFG.minOrder, pct = Math.min(100, Math.round(p.total / min * 100));
      $('[data-min-bar]').style.width = pct + '%';
      $('[data-min-meter]').classList.toggle('met', p.total >= min);
      $('[data-min-text]').innerHTML = p.total >= min
        ? '✓ Minimum order reached — free home delivery'
        : 'Add <b>' + money(min - p.total) + '</b> more to reach the ' + money(min) + ' minimum order';
      $('[data-to-checkout]').disabled = p.total < min;
    }
    function renderAll() { refreshControls(); renderCart(); if (currentView === 'checkout') renderCheckout(); }

    // ---- drawer views
    var currentView = 'cart';
    function hideToast() { var t = $('[data-toast]'); if (t) t.classList.remove('show'); }
    function showView(v) {
      currentView = v; hideToast();
      $$('.drawer-view').forEach(function (el) { el.hidden = el.dataset.view !== v; });
      $('[data-back]').hidden = v !== 'checkout';
      $('[data-drawer-title]').textContent = v === 'cart' ? 'Your cart' : v === 'checkout' ? 'Delivery details' : 'Thank you!';
      var body = $('.drawer-view[data-view="' + v + '"] .drawer-body'); if (body) body.scrollTop = 0;
      if (v === 'checkout') renderCheckout();
    }
    function openCart(view) {
      showView(view || (currentView === 'success' ? 'cart' : currentView));
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
      overlay.hidden = false; requestAnimationFrame(function () { overlay.classList.add('show'); });
      document.body.classList.add('no-scroll'); renderCart();
    }
    function closeCart() {
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('show'); setTimeout(function () { overlay.hidden = true; }, 250);
      document.body.classList.remove('no-scroll');
      if (currentView === 'success') showView('cart');
      renderCart();
    }

    // ---- checkout
    function renderCheckout() {
      var p = priced();
      $('[data-order-mini]').innerHTML =
        '<div class="om-lines">' + p.lines.map(function (l) { return '<div><span>' + l.qty + ' × ' + esc(l.name) + '</span><span>' + money(l.lineTotal) + '</span></div>'; }).join('') + '</div>' +
        '<div class="om-total"><span>Total <small>· free delivery</small></span><b>' + money(p.total) + '</b></div>';
      var dates = R.availableDates({ weekendsToShow: CFG.weekendsToShow, weekdayDaysAhead: CFG.weekdayDaysAhead, cakeToastOnly: p.cakeToastOnly });
      if (!dates.some(function (d) { return d.date === selected.date; })) { selected.date = null; selected.slot = null; }
      $('[data-date-hint]').textContent = p.cakeToastOnly
        ? 'Your cart is cake toast only, so weekday evening delivery is available too.'
        : 'We deliver fresh on Saturdays & Sundays. Order by Thursday for the coming weekend.';
      $('[data-date-chips]').innerHTML = dates.map(function (d) {
        var parts = R.formatDate(d.date).split(', ');
        return '<button type="button" class="chip date-chip' + (d.date === selected.date ? ' selected' : '') + (d.kind === 'weekday' ? ' weekday' : '') + '" data-date="' + d.date + '" data-kind="' + d.kind + '" aria-pressed="' + (d.date === selected.date) + '">' +
          '<small>' + parts[0] + '</small><b>' + parts[1] + '</b></button>';
      }).join('');
      renderSlots();
      $('[data-submit]').textContent = 'Place order · ' + money(p.total);
    }
    function renderSlots() {
      var wrap = $('[data-slot-wrap]');
      if (!selected.date) { wrap.hidden = true; return; }
      var chip = $('[data-date="' + selected.date + '"]');
      var slots = chip && chip.dataset.kind === 'weekday' ? CFG.weekdaySlots : CFG.weekendSlots;
      if (slots.indexOf(selected.slot) === -1) selected.slot = slots.length === 1 ? slots[0] : null;
      wrap.hidden = false;
      $('[data-slot-chips]').innerHTML = slots.map(function (s) {
        return '<button type="button" class="chip slot-chip' + (s === selected.slot ? ' selected' : '') + '" data-slot="' + esc(s) + '" aria-pressed="' + (s === selected.slot) + '">' + esc(s) + '</button>';
      }).join('');
    }
    function setErr(name, msg) {
      var el = $('[data-err="' + name + '"]'); if (el) el.textContent = msg || '';
      var input = $('#checkout-form [name="' + name + '"]'); if (input) input.classList.toggle('invalid', !!msg);
    }
    function validate(form) {
      var ok = true, f = form.elements;
      ['name', 'phone', 'email', 'address', 'deliveryDate', 'slot'].forEach(function (n) { setErr(n, ''); });
      if (f.name.value.trim().length < 2) { setErr('name', 'Please enter your name.'); ok = false; }
      if (!R.normalizePhone(f.phone.value)) { setErr('phone', 'Enter a valid 10-digit Indian mobile number.'); ok = false; }
      if (!R.isValidEmail(f.email.value)) { setErr('email', 'Enter a valid email address.'); ok = false; }
      if (f.address.value.trim().length < 10) { setErr('address', 'Please enter your full address (with area & pincode).'); ok = false; }
      if (!selected.date) { setErr('deliveryDate', 'Pick a delivery day.'); ok = false; }
      else if (!selected.slot) { setErr('slot', 'Pick a time slot.'); ok = false; }
      return ok;
    }
    function formError(msg) { var el = $('[data-form-error]'); el.textContent = msg || ''; el.hidden = !msg; if (msg) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

    function submitOrder(e) {
      e.preventDefault();
      var form = e.target, p = priced();
      formError('');
      var boxMissing = p.lines.filter(function (l) { return MENU_INDEX[l.id].box && !l.choices; });
      if (p.total < CFG.minOrder) { formError('Minimum order is ' + money(CFG.minOrder) + '. Please add a little more to your cart.'); return; }
      if (boxMissing.length) { showView('cart'); toast('Please add flavour choices for your ' + boxMissing[0].name); var fld = $('[data-choices="' + boxMissing[0].id + '"]'); if (fld) { fld.classList.add('invalid'); fld.focus(); } return; }
      if (!validate(form)) { var first = $('#checkout-form .invalid, #checkout-form .err:not(:empty)'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      var btn = $('[data-submit]'); btn.disabled = true; btn.textContent = 'Placing your order…';
      var f = form.elements;
      var payload = {
        action: 'createOrder',
        order: {
          name: f.name.value.trim(), phone: R.normalizePhone(f.phone.value), email: f.email.value.trim(),
          address: f.address.value.trim(), deliveryDate: selected.date, slot: selected.slot,
          notes: f.notes.value.trim(), website: f.website.value,
          items: cart.map(function (l) { return { id: l.id, qty: l.qty, choices: l.choices || '' }; })
        }
      };
      api(payload).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { formError(res.error || 'Something went wrong. Please try again.'); renderCheckout(); return; }
        try { localStorage.setItem('bakery_last_order', JSON.stringify({ id: res.orderId, phone: payload.order.phone })); } catch (err) {}
        $('[data-success-id]').textContent = res.orderId;
        $('[data-success-name]').textContent = ', ' + payload.order.name.split(' ')[0];
        $('[data-success-meta]').innerHTML =
          '<div><span>Delivery</span><b>' + esc(R.formatDate(res.deliveryDate)) + ' · ' + esc(res.slot) + '</b></div>' +
          '<div><span>Total</span><b>' + money(res.total) + ' <small>(free delivery)</small></b></div>';
        $('[data-track-link]').href = 'status.html?id=' + encodeURIComponent(res.orderId);
        $('[data-wa-order]').href = waLink(CFG.whatsappNumber, 'Hi! I just placed order ' + res.orderId + ' for ' + R.formatDate(res.deliveryDate) + ' (' + money(res.total) + ').');
        cart = []; saveCart(); form.reset(); selected = { date: null, slot: null };
        showView('success'); renderAll();
      });
    }

    // ---- events
    document.addEventListener('click', function (e) {
      var t = e.target.closest('button, a, [data-close-cart]'); if (!t) return;
      if (t.dataset.add) { setQty(t.dataset.add, 1); toast('Added ' + MENU_INDEX[t.dataset.add].name + ' 🧁'); }
      else if (t.dataset.inc) setQty(t.dataset.inc, qtyOf(t.dataset.inc) + 1);
      else if (t.dataset.dec) setQty(t.dataset.dec, qtyOf(t.dataset.dec) - 1);
      else if (t.hasAttribute('data-open-cart')) openCart();
      else if (t.hasAttribute('data-close-cart')) { e.preventDefault(); closeCart(); }
      else if (t.hasAttribute('data-to-checkout')) {
        var missing = cart.filter(function (l) { return MENU_INDEX[l.id].box && !String(l.choices || '').trim(); });
        if (missing.length) {
          toast('Tell us the flavours for your ' + MENU_INDEX[missing[0].id].name);
          var fld = $('[data-choices="' + missing[0].id + '"]'); if (fld) { fld.classList.add('invalid'); fld.focus(); }
          return;
        }
        showView('checkout');
      }
      else if (t.hasAttribute('data-back')) showView('cart');
      else if (t.dataset.date) { selected.date = t.dataset.date; setErr('deliveryDate', ''); $$('.date-chip').forEach(function (c) { var on = c === t; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); }); renderSlots(); }
      else if (t.dataset.slot) { selected.slot = t.dataset.slot; setErr('slot', ''); $$('.slot-chip').forEach(function (c) { var on = c === t; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); }); }
      else if (t.hasAttribute('data-copy-id')) {
        var id = $('[data-success-id]').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(id) : Promise.reject()).then(function () { toast('Order ID copied'); }, function () { toast(id); });
      }
    });
    document.addEventListener('input', function (e) {
      var id = e.target.dataset && e.target.dataset.choices;
      if (id) { var l = cart.find(function (x) { return x.id === id; }); if (l) { l.choices = e.target.value; saveCart(); e.target.classList.remove('invalid'); } }
      if (e.target.closest && e.target.closest('#checkout-form') && e.target.name) setErr(e.target.name, '');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) closeCart(); });
    $('#checkout-form').addEventListener('submit', submitOrder);

    renderMenu(); renderCart();
    // Deep link: index.html#cart opens the drawer
    if (location.hash === '#cart') openCart('cart');
  }

  // ============================================================== STATUS
  function statusCard(o) {
    var map = {
      Pending:   { icon: '⏳', title: 'Awaiting confirmation', text: "We've received your order and will confirm it soon.", cls: 'pending' },
      Confirmed: { icon: '✅', title: 'Confirmed!', text: 'Your treats will be baked fresh for your delivery day.', cls: 'confirmed' },
      Declined:  { icon: '🙁', title: 'Declined', text: "Sorry, we couldn't take this order. Please message us — we'd love to bake for you another time.", cls: 'declined' }
    };
    var s = map[o.status] || map.Pending;
    var step2 = o.status === 'Declined' ? 'Declined' : 'Confirmed';
    return '<article class="card status-card ' + s.cls + '">' +
      '<div class="status-top"><div class="status-icon" aria-hidden="true">' + s.icon + '</div>' +
      '<div><p class="kicker">Order ' + esc(o.orderId) + '</p><h2>' + s.title + '</h2><p class="muted">Hi ' + esc(o.firstName) + '! ' + s.text + '</p></div></div>' +
      '<ol class="timeline"><li class="done"><span></span>Received<small>' + esc(fmtDateTime(o.createdAt)) + '</small></li>' +
      '<li class="' + (o.status === 'Pending' ? '' : 'done ' + s.cls) + '"><span></span>' + step2 + '<small>' + (o.status === 'Pending' ? 'soon' : esc(fmtDateTime(o.updatedAt))) + '</small></li>' +
      '<li class="' + (o.status === 'Confirmed' ? 'next' : '') + '"><span></span>Delivered<small>' + esc(R.formatDate(o.deliveryDate)) + '</small></li></ol>' +
      (o.adminNote ? '<div class="baker-note"><b>Note from the baker</b><p>' + esc(o.adminNote) + '</p></div>' : '') +
      '<dl class="status-meta"><div><dt>Delivery</dt><dd>' + esc(R.formatDate(o.deliveryDate)) + ' · ' + esc(o.slot) + '</dd></div>' +
      '<div><dt>Items</dt><dd>' + (o.items || []).map(function (l) { return esc(l.qty + ' × ' + l.name) + (l.choices ? ' <small>(' + esc(l.choices) + ')</small>' : ''); }).join('<br>') + '</dd></div>' +
      '<div><dt>Total</dt><dd><b>' + money(o.total) + '</b> <small>· free delivery</small></dd></div></dl>' +
      '</article>';
  }

  function initStatus() {
    var form = $('#status-form'), out = $('#status-result'), err = $('[data-form-error]');
    var params = new URLSearchParams(location.search);
    var last = {}; try { last = JSON.parse(localStorage.getItem('bakery_last_order') || '{}'); } catch (e) {}
    var qid = (params.get('id') || '').toUpperCase();
    form.orderId.value = qid || last.id || '';
    if (last.phone && (!qid || qid === last.id)) form.phone.value = last.phone;
    function lookup(e) {
      if (e) e.preventDefault();
      err.hidden = true;
      var id = form.orderId.value.trim().toUpperCase(), phone = R.normalizePhone(form.phone.value);
      if (!/^WB-[A-Z0-9]{4}$/.test(id)) { err.textContent = 'Order IDs look like WB-7K2Q.'; err.hidden = false; return; }
      if (!phone) { err.textContent = 'Enter the 10-digit mobile number you ordered with.'; err.hidden = false; return; }
      var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Checking…';
      api({ action: 'status', orderId: id, phone: phone }).then(function (res) {
        btn.disabled = false; btn.textContent = 'Check status';
        if (!res.ok) { out.innerHTML = ''; err.textContent = res.error; err.hidden = false; return; }
        out.innerHTML = statusCard(res.order);
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    form.addEventListener('submit', lookup);
    if (form.orderId.value && form.phone.value) lookup();
  }

  // =============================================================== ADMIN
  function initAdmin() {
    var PW_KEY = 'bakery_admin_pw';
    var pw = sessionStorage.getItem(PW_KEY) || '';
    var orders = [], filter = '';
    var loginEl = $('[data-login]'), dash = $('[data-dashboard]');
    $('[data-mode-pill]').textContent = DEMO ? 'Demo · saved in this browser' : CFG.MODE === 'local' ? 'Local mock server' : 'Live · Google Sheet';
    $$('[data-demo-only]').forEach(function (el) { el.hidden = !DEMO; });
    var storeNote = $('[data-store-note]');
    if (storeNote) storeNote.textContent = DEMO ? 'Demo mode: orders are saved in this browser only, no emails are sent'
      : CFG.MODE === 'local' ? 'Local mock: orders in data/orders.json, emails in data/outbox.json' : 'Orders are stored in your Google Sheet';

    function showDash(on) {
      loginEl.hidden = on; dash.hidden = !on;
      $$('[data-admin-only]').forEach(function (el) { el.hidden = !on; });
    }
    function load() {
      $('[data-orders]').innerHTML = '<p class="muted center">Loading orders…</p>';
      return api({ action: 'listOrders', password: pw }).then(function (res) {
        if (!res.ok) {
          if (res.auth === false) { logout(); return; }
          $('[data-orders]').innerHTML = '<p class="form-error">' + esc(res.error) + '</p>'; return;
        }
        var rank = { Pending: 0, Confirmed: 1, Declined: 2 };
        orders = (res.orders || []).slice().sort(function (a, b) {
          return (rank[a.status] - rank[b.status]) || (a.createdAt < b.createdAt ? 1 : -1);
        });
        render();
      });
    }
    function logout() { pw = ''; sessionStorage.removeItem(PW_KEY); showDash(false); }

    function waMessage(o) {
      var first = String(o.name).split(' ')[0];
      var when = R.formatDate(o.deliveryDate) + ' (' + o.slot + ')';
      var items = (o.items || []).map(function (l) { return '• ' + l.qty + ' × ' + l.name + (l.choices ? ' — ' + l.choices : ''); }).join('\n');
      if (o.status === 'Confirmed') {
        return 'Hi ' + first + '! 🎉 Your order ' + o.orderId + ' from ' + CFG.bakeryName + ' is confirmed.\n\n' + items +
          '\n\nTotal: ' + money(o.total) + ' (free home delivery)\nDelivery: ' + when + '\nAddress: ' + o.address +
          (o.adminNote ? '\n\nNote: ' + o.adminNote : '') + '\n\nThank you for supporting our little home bakery! 🧁';
      }
      if (o.status === 'Declined') {
        return 'Hi ' + first + ', thank you so much for your order ' + o.orderId + '. Unfortunately we can\'t take it this time 🙏' +
          (o.adminNote ? '\n\n' + o.adminNote : '') + '\n\nWe hope to bake for you soon! — ' + CFG.bakeryName;
      }
      return 'Hi ' + first + '! We\'ve received your order ' + o.orderId + ' for ' + when + ' (' + money(o.total) + '). We\'ll confirm it shortly. — ' + CFG.bakeryName;
    }

    function render() {
      var counts = { Pending: 0, Confirmed: 0, Declined: 0 }, revenue = 0;
      orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; if (o.status === 'Confirmed') revenue += Number(o.total) || 0; });
      $('[data-stats]').innerHTML =
        '<div class="stat pending"><small>Pending</small><b>' + counts.Pending + '</b></div>' +
        '<div class="stat confirmed"><small>Confirmed</small><b>' + counts.Confirmed + '</b></div>' +
        '<div class="stat declined"><small>Declined</small><b>' + counts.Declined + '</b></div>' +
        '<div class="stat revenue"><small>Confirmed value</small><b>' + money(revenue) + '</b></div>';
      $$('[data-filter]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.filter === filter);
        var n = b.dataset.filter ? counts[b.dataset.filter] : orders.length;
        b.innerHTML = (b.dataset.filter || 'All') + ' <span>' + n + '</span>';
      });
      var list = orders.filter(function (o) { return !filter || o.status === filter; });
      if (!list.length) { $('[data-orders]').innerHTML = '<div class="card empty-orders"><div class="empty-emoji">🧺</div><p>No ' + (filter ? filter.toLowerCase() + ' ' : '') + 'orders yet.</p></div>'; return; }
      $('[data-orders]').innerHTML = list.map(function (o) {
        var phone = String(o.phone);
        return '<article class="card order-card status-' + o.status.toLowerCase() + '" data-order="' + esc(o.orderId) + '">' +
          '<header class="oc-head"><div><h3>' + esc(o.orderId) + '</h3><small>Placed ' + esc(fmtDateTime(o.createdAt)) + '</small></div>' +
          '<span class="status-badge ' + o.status.toLowerCase() + '">' + esc(o.status) + '</span></header>' +
          '<div class="oc-delivery">🗓️ <b>' + esc(R.formatDate(o.deliveryDate)) + '</b> · ' + esc(o.slot) + '</div>' +
          '<div class="oc-grid"><div class="oc-cust"><b>' + esc(o.name) + '</b>' +
          '<a href="tel:+91' + esc(phone) + '">+91 ' + esc(phone.slice(0, 5) + ' ' + phone.slice(5)) + '</a>' +
          '<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a><span class="muted">' + esc(o.address) + '</span></div>' +
          '<ul class="oc-items">' + (o.items || []).map(function (l) { return '<li><span>' + l.qty + ' × ' + esc(l.name) + (l.choices ? '<small>' + esc(l.choices) + '</small>' : '') + '</span><span>' + money(l.lineTotal) + '</span></li>'; }).join('') +
          '<li class="oc-total"><span>Total</span><b>' + money(o.total) + '</b></li></ul></div>' +
          (o.notes ? '<p class="oc-notes">📝 ' + esc(o.notes) + '</p>' : '') +
          '<div class="oc-actions"><input class="oc-note" data-note placeholder="Note to customer (optional)" maxlength="500" value="' + esc(o.adminNote || '') + '">' +
          '<div class="oc-buttons">' +
          '<button class="btn btn-small btn-confirm" type="button" data-set-status="Confirmed"' + (o.status === 'Confirmed' ? ' disabled' : '') + '>✓ Confirm</button>' +
          '<button class="btn btn-small btn-decline" type="button" data-set-status="Declined"' + (o.status === 'Declined' ? ' disabled' : '') + '>✕ Decline</button>' +
          '<a class="btn btn-small btn-wa" target="_blank" rel="noopener" href="' + esc(waLink('91' + phone, waMessage(o))) + '">Send on WhatsApp</a>' +
          '</div></div></article>';
      }).join('');
    }

    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#login-form [data-form-error]'); err.hidden = true;
      var p = e.target.password.value;
      var btn = e.target.querySelector('button'); btn.disabled = true;
      api({ action: 'login', password: p }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = res.error || 'Wrong password.'; err.hidden = false; return; }
        pw = p; sessionStorage.setItem(PW_KEY, p); e.target.reset(); showDash(true); load();
      });
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-logout')) logout();
      else if (t.hasAttribute('data-reset-demo')) {
        if (!confirm('Reset the demo? This clears the orders saved in this browser and restores the sample orders.')) return;
        api({ action: 'resetDemo', password: pw }).then(function () { filter = ''; if (pw) load(); toast('Demo data reset'); });
      }
      else if (t.hasAttribute('data-refresh')) load().then(function () { toast('Orders refreshed'); });
      else if (t.dataset.filter !== undefined) { filter = t.dataset.filter; render(); }
      else if (t.dataset.setStatus) {
        var card = t.closest('[data-order]'), id = card.dataset.order, status = t.dataset.setStatus;
        var note = card.querySelector('[data-note]').value;
        if (status === 'Declined' && !confirm('Decline order ' + id + '? The customer will be emailed.')) return;
        $$('button', card).forEach(function (b) { b.disabled = true; });
        api({ action: 'updateStatus', password: pw, orderId: id, status: status, note: note }).then(function (res) {
          if (!res.ok) { toast(res.error || 'Could not update'); render(); return; }
          orders = orders.map(function (o) { return o.orderId === id ? res.order : o; });
          render();
          if (res.simulatedEmail) toast('Demo: ' + (status === 'Confirmed' ? 'confirmation' : 'decline') + ' email would be sent to ' + res.simulatedEmail.to + ' — now send it on WhatsApp', 4200);
          else toast(id + ' ' + status.toLowerCase() + (res.emailSent ? ' · email sent' : '') + ' — now send it on WhatsApp');
          var nc = $('[data-order="' + id + '"] .btn-wa'); if (nc) nc.classList.add('pulse');
        });
      }
    });

    if (pw) { showDash(true); load(); } else showDash(false);
  }
})();
