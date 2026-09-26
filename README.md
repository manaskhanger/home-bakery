# 🧁 Home Bakery – order website (prototype)

A small, elegant order site for a home bakery: menu with photos → cart → pick a
delivery day → order saved to a Google Sheet → you confirm/decline from a simple admin
page → customer gets an email and can track the order.

Plain HTML + CSS + vanilla JS. No frameworks, no build step, no monthly cost.

**Live demo:** <https://manaskhanger.github.io/home-bakery/> · admin: [`admin.html`](https://manaskhanger.github.io/home-bakery/admin.html) (demo password `bakery123`)

> The live demo runs in **demo mode**: there is no backend, so orders, status look-ups
> and admin confirm/decline are saved in *your own browser* (localStorage) and emails are
> only simulated. Three clearly fake sample orders are pre-loaded so the dashboard isn't
> empty. "Reset demo data" at the bottom of the admin page restores them.

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
| Bakery name, tagline, WhatsApp number, Instagram | `config.js` (top) |
| Name in browser tab / link previews | `<title>` + `og:` tags in `index.html`, `status.html`, `credits.html`; `site.webmanifest` |
| Menu items, prices, descriptions | `config.js` **and** `MENU` in `apps-script/Code.gs` (keep in sync; `node server.js` warns if they differ) |
| Minimum order (₹250), cut-off (Thursday), delivery slots | `config.js` + `RULES` in `Code.gs` |
| Photos | replace the files in `images/` keeping the same names (≈800×600, landscape 4:3, JPG). Hero: `images/hero.jpg` (portrait 4:5). The file-per-item mapping is the `image:` field of each item in `config.js`. |
| Link-preview image | `images/og-image.jpg` (and the absolute `og:url` / `og:image` URLs in `index.html` if you host elsewhere) (1200×630) – or edit `tools/og-template.html` and re-screenshot it |
| Favicon | `images/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` |

The current photos are free-licence **stock placeholders** (Unsplash, Pexels, and a few
CC BY photos from Flickr) – see `images/CREDITS.md` / `credits.html`. Please replace
them with photos of your own bakes before launch. If you keep any CC BY photo, keep the
credits page linked in the footer.

## How ordering works
- Weekend delivery (Sat & Sun), pre-order by **Thursday** of that week (India time).
- Minimum order **₹250**, free home delivery.
- **Cake toast-only** orders can also pick a weekday evening (next 7 days).
- Boxes ask the customer to choose flavours.
- Prices are re-calculated on the server – the browser total is never trusted.
- Status flow: **Pending → Confirmed / Declined** (+ optional note to the customer).
  Each status change sends one email; the admin page also opens WhatsApp with a
  ready-made message.
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
tools/            og-image template
```
