# Going live with Google Sheets + Apps Script (≈15 minutes)

The website is static (HTML/CSS/JS). Orders go to a Google Sheet through a tiny
Google Apps Script "web app". No server to rent, no monthly cost.

## 1. Create the order Sheet
1. Go to <https://sheets.new> and name the file, e.g. **Bakery Orders**.
2. Leave it empty – the script creates an **Orders** tab with the right columns.

## 2. Paste the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete the sample code in `Code.gs` and paste the whole of `apps-script/Code.gs`.
3. **Project Settings (⚙️)** → tick *Show "appsscript.json" manifest file* → open it
   and replace its contents with `apps-script/appsscript.json`
   (sets the time zone to **Asia/Kolkata** – important for the Thursday cut-off).
4. Click **Save** (💾).

## 3. Set your admin password (and optional settings)
**Project Settings → Script properties → Add script property**

| Property | Value | Required |
|---|---|---|
| `ADMIN_PASSWORD` | a long password only you know (used on `admin.html`) | ✅ |
| `BAKERY_NAME` | e.g. `Sugar & Spice Home Bakery` (used in emails) | optional |
| `WHATSAPP_DISPLAY` | e.g. `+91 98765 43210` (shown in emails) | optional |
| `OWNER_EMAIL` | your email – gets a copy of every new order; also the reply-to | optional |

## 4. Run setup once
1. In the editor, choose the function **`setup`** in the toolbar dropdown → **Run**.
2. Google asks for permission (Sheets, send email as you) → **Review permissions →
   your account → Advanced → Go to project (unsafe) → Allow**. (It's your own script.)
3. Choose **`installTrigger`** → **Run**. This installs the *on edit* trigger, so if you
   change a Status cell by hand in the Sheet to *Confirmed*/*Declined*, the customer
   still gets the email (only once per status).

## 5. Deploy as a web app
1. **Deploy → New deployment → ⚙️ Select type → Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. **Deploy** → copy the **Web app URL** (ends in `/exec`).

> Every time you change `Code.gs` later: **Deploy → Manage deployments → ✏️ Edit →
> Version: New version → Deploy** (the URL stays the same).

## 6. Point the website at it
In `config.js` (the hosted demo uses `MODE: 'demo'`; switch it to `'google'`):
```js
MODE: 'google',
API_URLS: { local: '/api', google: 'https://script.google.com/macros/s/XXXX/exec' },
```
Also set `bakeryName`, `whatsappNumber` (digits with 91, e.g. `919876543210`),
`whatsappDisplay` and `instagramHandle`.

**CORS note:** the site sends every request as `POST` with
`Content-Type: text/plain`, which the browser treats as a "simple" request – no CORS
pre-flight, so it works with Apps Script out of the box. Don't change it to
`application/json`.

## 7. Host the site (free) – GitHub Pages
1. Create a GitHub repo, upload everything **except** `server.js`, `data/`, `apps-script/`,
   `screenshots/`, `tools/` (they're harmless, just not needed).
2. Repo **Settings → Pages → Deploy from branch → main / root → Save**.
3. Your site is live at `https://<you>.github.io/<repo>/` in a minute.
   (Netlify: drag-and-drop the folder at <https://app.netlify.com/drop> works too.)
4. Update `canonical`, `og:url`, `og:image` and `twitter:image` in `index.html` to your
   full URL (`https://<you>.github.io/<repo>/…`) so WhatsApp/Instagram link previews show
   the picture. Keep the empty `.nojekyll` file (tells GitHub Pages to serve files as-is).

## 8. Test it
1. Place a test order on the live site → a row appears in **Orders** with Status *Pending*
   and you get the "order received" email.
2. Open `/admin.html`, log in, press **Confirm** → customer email is sent, then press
   **Send on WhatsApp** to message the customer.
3. Open `/status.html`, enter the Order ID + phone → shows *Confirmed*.

## Day-to-day
- Use `admin.html` on your phone, or edit the **Status** column directly in the Sheet.
- **Delivery fees:** orders where the customer chose "not sure" show `TBC` in the
  **Delivery Fee (₹)** column. In `admin.html` type the fee (0 for free) and press
  **Confirm** – the total is recalculated and goes into the confirmation email. You can
  also adjust any estimated fee and press **Save**. If you type a fee straight into
  the Sheet, the installed trigger recalculates **Total (₹)** for you.
- Changing prices/menu? Edit `config.js` **and** the `MENU`/`RULES` block in `Code.gs`
  (the server re-checks prices), then redeploy (step 5 note). `node server.js` warns you
  if the two files disagree.
- **Upgrading from an earlier version of this script?** The Orders sheet gained
  `Subtotal (₹)`, `Distance` and `Delivery Fee (₹)` columns. Rename the old tab (e.g.
  *Orders (old)*) and run `setup()` again to create a fresh Orders tab with the new
  columns, then redeploy (Deploy → Manage deployments → New version).
- Gmail limits: consumer accounts can send ~100 emails/day via Apps Script – plenty for a
  home bakery.
