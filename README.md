# La Pâte Brillante – home bakery order website (prototype)

*A little luxury, every weekend.* · Small batches, baked fresh in a home kitchen · WhatsApp +91 95999 09742

A small, elegant order site for a home bakery: menu with photos → cart → pick a
delivery day → order saved to a Google Sheet → you confirm/decline from a simple admin
page → customer gets an email and can track the order.

Plain HTML + CSS + vanilla JS. No frameworks, no build step, no monthly cost.

**Live demo:** <https://manaskhanger.github.io/home-bakery/> · admin: [`admin.html`](https://manaskhanger.github.io/home-bakery/admin.html) (demo password `bakery123`)

> The live demo runs in **demo mode**: there is no backend, so orders, status look-ups
> and admin confirm/decline are saved in *your own browser* (localStorage) and emails are
> only simulated. Three clearly fake sample orders are pre-loaded so the dashboard isn't
> empty. "Reset demo data" at the bottom of the admin page restores them.
> (Demo data is versioned – `DATA_VERSION` in `demo-backend.js` – so stale orders from an
> older menu are discarded automatically.)

## Backend modes (`MODE` in `config.js`)
| MODE | What happens | Use for |
|---|---|---|
| `'demo'` | orders stored in the visitor's browser (`demo-backend.js`), emails simulated | showcase on GitHub Pages / Netlify |
| `'local'` | talks to `node server.js` (orders in `data/orders.json`, emails in `data/outbox.json`) | testing on your computer |
| `'google'` | talks to your Google Apps Script web app (orders in your Google Sheet, real emails) | **taking real orders** |

All three use the same request/response format, so going live is a one-line change.

## Try it on your computer (1 minute)
Needs Node.js 18+ (no `npm install` – there are no dependencies).
Set `MODE: 'local'` in `config.js` first (with `'demo'` the pages just use browser storage).
```bash
node server.js          # or: npm start
```
- Shop: <http://localhost:8080>
- Track an order: <http://localhost:8080/status.html>
- Admin: <http://localhost:8080/admin.html> – demo password **`bakery123`**
  (change with `ADMIN_PASSWORD=... node server.js`)

The local server (`server.js`) is a stand-in for Google Apps Script with the *same API*.
Orders are saved to `data/orders.json`; emails are **not sent** – they are written to
`data/outbox.json` and printed in the terminal so you can read them.

## Going live
Follow **[apps-script/SETUP.md](apps-script/SETUP.md)**: create a Google Sheet, paste
`Code.gs`, deploy as a web app, put the URL in `config.js`, host the folder on
GitHub Pages or Netlify (free).

## Make it yours – checklist
| What | Where |
|---|---|
| Bakery name, headline & tagline, logo, WhatsApp number, Instagram, FSSAI number | `config.js` (top). `instagramHandle` and `fssaiNumber` are `''` for now → the Instagram link and FSSAI line are hidden until you fill them in. |
| Name in browser tab / link previews | `<title>` + `og:` tags in `index.html`, `status.html`, `credits.html`; `site.webmanifest` |
| Menu items, prices, descriptions | `config.js` **and** `MENU` in `apps-script/Code.gs` (keep in sync; `node server.js` warns if they differ) |
| Minimum order (₹250), cut-off (Thursday 3 pm), delivery slots, delivery charges (3 km / ₹800 / ₹60), launch offer (₹50 off first order of ₹500+) | `config.js` + `RULES` in `Code.gs` (the homepage Delivery section, offer banner, cart and checkout all update from these numbers; `launchOffer: null` switches the offer off) |
| Photos | replace the files in `images/` keeping the same names (≈800×600, landscape 4:3, JPG). Hero: `images/hero.jpg` (portrait 4:5). The file-per-item mapping is the `image:` field of each item in `config.js`. |
| Link-preview image | `images/og-image.jpg` (and the absolute `og:url` / `og:image` URLs in `index.html` if you host elsewhere) (1200×630) – or edit `tools/og-template.html` and re-screenshot it |
| Logo & icons | `images/logo.png` (512 px, transparent), `logo-160.png` (header/footer), `favicon-32/48.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512-maskable.png` – all made from the logo in the menu PDF |

After editing `styles.css` or any `.js` file on a live site, bump the `?v=3` at the end of
the `<script>`/`<link>` tags in the four HTML files (e.g. to `?v=4`) so returning visitors
get the new version instead of a cached one.

The current photos are free-licence **stock placeholders** (Unsplash, Pexels, and a few
CC BY photos from Flickr) – see `images/CREDITS.md` / `credits.html`. Please replace
them with photos of your own bakes before launch. If you keep any CC BY photo, keep the
credits page linked in the footer.

## How ordering works
- Delivery on **Saturday & Sunday** (whole menu); **Friday evening** only for
  cake-toast-only orders. Orders for a weekend close **Thursday 3 pm** India time
  (computed in IST whatever the visitor's own time zone is).
- Minimum order **₹250** (items subtotal, before discount and delivery).
- **Delivery charges:** up to 3 km **free** on every order; beyond 3 km free on orders of
  **₹800+**; beyond 3 km on orders under ₹800 = flat **₹60**. The ₹800 threshold uses the
  items subtotal *before* the launch-offer discount.
  At checkout the customer picks **Within 3 km / Beyond 3 km / Not sure**. The cart shows
  subtotal, discount, delivery fee and total, and nudges "Add ₹X more for free delivery"
  only when they are beyond 3 km (or not sure) and under ₹800.
  "Not sure" = fee **to be confirmed** (unless the order is ₹800+, which is free anyway):
  the baker types the fee in the admin page before confirming (confirming is blocked until
  a fee is entered). The baker can also adjust any fee; the total is recalculated and used
  in the confirmation email and WhatsApp message.
- **Launch offer:** ₹50 off a customer's **first order** when the items subtotal is
  **₹500+**. Applied automatically by the backend: "first order" = no earlier order from the
  same phone number that wasn't declined (demo: this browser's orders; local mock:
  `data/orders.json`; live: the Sheet's Phone + Status columns). Cart/checkout show
  "Launch offer −₹50 · applied if this is your first order"; the confirmation screen,
  status page, admin, emails and WhatsApp messages show what was actually applied.
  Total = subtotal − discount + delivery.
- Cupcake **Box of 4 / Box of 6** ask the customer to list flavours (required). The mixed
  boxes (Tasting, Chai Time, Treat for Two, Family Weekend, Gift Hamper) have an *optional*
  flavour field – left blank it's recorded as "Baker's choice". The Chocolate Lover's Box
  has fixed contents (no field). Friday evening is offered only when the cart is cake toast only.
- Prices and delivery fees are re-calculated on the server – the browser total is never trusted.
- Status flow: **Pending → Confirmed / Declined** (+ optional note to the customer).
  Each status change sends one email; the admin page also opens WhatsApp with a
  ready-made message (items, subtotal, delivery, total).
- No online payment – payment details are shared on WhatsApp after confirming.

## Files
```
index.html        shop: hero, menu, cart drawer, checkout, success
status.html       order tracking (Order ID + phone)
admin.html        owner dashboard (login, filter, confirm/decline, note, WhatsApp)
credits.html      photo credits
config.js         ← all your settings + menu (edit this)
rules.js          shared date / price / phone rules (browser + local server)
app.js, styles.css
images/           photos, favicons, og-image, CREDITS.md
apps-script/      Code.gs, appsscript.json, SETUP.md   (the real backend)
demo-backend.js   browser-only backend for MODE 'demo'
server.js         local mock backend (not needed once live)
tools/            og-image template (tools/og-template.html → images/og-image.jpg)
```
