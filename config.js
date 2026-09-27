/* =====================================================================
   BAKERY CONFIG — edit this file to make the site yours.
   Everything customer-facing (name, contact, prices) lives here.
   ===================================================================== */
window.BAKERY_CONFIG = {
  // ---- Brand ---------------------------------------------------------
  bakeryName: 'La Pâte Brillante',
  headline: 'A little luxury, every weekend.',
  tagline: 'Small batches, baked fresh in a home kitchen',
  eyebrow: 'Weekend bakes · Made to order',
  logo: 'images/logo.png',   // round logo used in the header, favicon & share image

  // ---- Photos ----------------------------------------------------------
  // To use your own photos, just replace the files in /images with the SAME
  // file names (landscape 4:3, ~800x600 JPG works best), or change the paths
  // here and in each menu item's `image` below.
  heroImage: 'images/hero.jpg',

  // ---- Contact -------------------------------------------------------
  // Digits only, WITH country code (91 for India), e.g. '919876543210'
  whatsappNumber: '919599909742',
  // How the number is shown on the site
  whatsappDisplay: '+91 95999 09742',
  // Instagram handle without the @ — leave '' to hide all Instagram links
  instagramHandle: '',
  // Food licence (FSSAI) number — leave '' to hide it from the footer
  fssaiNumber: '',

  // ---- Backend -------------------------------------------------------
  // 'demo'   -> no backend: orders are saved in the visitor's browser
  //             (localStorage) — for showcasing on GitHub Pages/Netlify
  // 'local'  -> the Node mock server in this folder (node server.js)
  // 'google' -> your deployed Google Apps Script web app  <- use this to go live
  MODE: 'demo',
  demoAdminPassword: 'bakery123',   // demo mode only (real password lives in Apps Script)
  API_URLS: {
    local: 'api',
    google: 'https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID/exec'
  },

  // ---- Ordering rules -------------------------------------------------
  // (Keep these in sync with apps-script/Code.gs if you change them.)
  currency: '₹',
  minOrder: 250,            // minimum order in ₹ (items subtotal, before discount & delivery)
  weekendsToShow: 2,        // how many upcoming weekends customers can pick
  cutoffHour: 15,           // orders close THURSDAY at this hour, India time (15 = 3 pm)
  weekendSlots: ['Morning · 10am – 1pm', 'Afternoon · 1pm – 4pm', 'Evening · 4pm – 7pm'],  // Sat & Sun, whole menu
  fridaySlots: ['Evening · 6pm – 9pm'],                                                    // Friday: cake toast only

  // ---- Delivery charges -------------------------------------------------
  // Customers pick "Within 3 km", "Beyond 3 km" or "Not sure".
  //  - within freeWithinKm: free on every order
  //  - beyond: free if the items subtotal (before any discount) is
  //    freeFromOrder or more, otherwise a flat flatBeyond fee
  //  - not sure: free from freeFromOrder, otherwise you confirm the fee in
  //    the admin page before confirming the order
  delivery: { freeWithinKm: 3, freeFromOrder: 800, flatBeyond: 60 },

  // ---- Launch offer -------------------------------------------------------
  // amount off a customer's FIRST order (first order = no earlier order from
  // that phone number, declined orders don't count) when the items subtotal
  // is minSubtotal or more. Set to null to switch the offer off.
  launchOffer: { amount: 50, minSubtotal: 500 },

  // ---- Menu ------------------------------------------------------------
  // id must be unique and must match MENU in apps-script/Code.gs.
  // cartName (optional) is how the item appears in the cart, emails & admin.
  // Boxes: box:true + pick: 'required' (customer must list flavours),
  // 'optional' (blank = baker's choice) or 'none' (fixed contents).
  menu: [
    {
      id: 'cookies', title: 'Cookies', icon: '🍪', note: '₹70 – ₹100 each', style: 'card',
      items: [
        { id: 'ck-choco',       name: 'Classic Choco-Chip',     price: 70,  desc: 'Chewy brown-butter dough loaded with chocolate chips', image: 'images/cookie-choco-chip.jpg' },
        { id: 'ck-darkstuffed', name: 'Dark Chocolate Stuffed', price: 100, desc: 'A molten dark chocolate centre in every bite', image: 'images/cookie-dark-chocolate-stuffed.jpg' },
        { id: 'ck-seasalt',     name: 'Dark Choc Sea Salt',     price: 90,  desc: 'Rich dark chocolate finished with flaky sea salt', image: 'images/cookie-dark-choc-sea-salt.jpg' }
      ]
    },
    {
      id: 'cupcakes', title: 'Cupcakes', icon: '🧁', note: '₹110 – ₹130 each', style: 'card',
      boxesTitle: 'Cupcake boxes · mix flavours',   // heading for the box items below
      items: [
        { id: 'cc-redvelvet', name: 'Red Velvet',               price: 110, desc: 'Soft cocoa sponge with cream cheese frosting', image: 'images/cupcake-red-velvet.jpg' },
        { id: 'cc-truffle',   name: 'Belgian Chocolate Truffle', price: 130, desc: 'Dark chocolate sponge, silky Belgian chocolate ganache', image: 'images/cupcake-belgian-truffle.jpg' },
        { id: 'cc-strawberry', name: 'Strawberry Cream',        price: 120, desc: 'Fluffy vanilla sponge swirled with real strawberry cream', image: 'images/cupcake-strawberry-cream.jpg' },
        { id: 'cc-box4', name: 'Box of 4', cartName: 'Cupcake Box of 4', price: 399, box: true, pick: 'required', contents: ['Any 4 cupcakes'], desc: 'Any 4 cupcakes, mix flavours', hint: 'e.g. 2 Red Velvet, 2 Strawberry Cream', image: 'images/cupcake-box-4.jpg' },
        { id: 'cc-box6', name: 'Box of 6', cartName: 'Cupcake Box of 6', price: 599, box: true, pick: 'required', contents: ['Any 6 cupcakes'], desc: 'Any 6 cupcakes, mix flavours', hint: 'e.g. 2 of each flavour', image: 'images/cupcake-box-6.jpg' }
      ]
    },
    {
      id: 'caketoast', title: 'Cake Toast', icon: '🍞', note: 'Crisp, twice-baked · 200 g · Friday evening delivery too', style: 'tiles',
      fridayOk: true,   // cake-toast-only orders can also be delivered on Friday evening
      items: [
        { id: 'ct-vanilla',  name: 'Classic Vanilla', cartName: 'Classic Vanilla Cake Toast', price: 130, desc: 'Buttery, golden, perfect with chai', image: 'images/caketoast-vanilla.jpg' },
        { id: 'ct-elaichi',  name: 'Elaichi',         cartName: 'Elaichi Cake Toast',         price: 140, desc: 'Fragrant green cardamom', image: 'images/caketoast-elaichi.jpg' },
        { id: 'ct-choco',    name: 'Chocolate',       cartName: 'Chocolate Cake Toast',       price: 150, desc: 'Cocoa-rich and crunchy', image: 'images/caketoast-chocolate.jpg' },
        { id: 'ct-tutti',    name: 'Tutti Frutti',    cartName: 'Tutti Frutti Cake Toast',    price: 140, desc: 'Studded with candied fruit bits', image: 'images/caketoast-tutti-frutti.jpg' }
      ]
    },
    {
      id: 'boxes', title: 'Boxes & Combos', icon: '🎁', note: 'Save more · Perfect for gifting', style: 'boxes',
      items: [
        { id: 'bx-tasting',  name: 'Tasting Box',           price: 449, box: true, pick: 'optional', featured: true, badge: 'Best value · Try all', contents: ['2 cookies', '2 cupcakes', '1 cake toast pack'], desc: '2 cookies, 2 cupcakes & 1 cake toast pack', hint: 'e.g. Choco-Chip + Sea Salt cookies, Red Velvet + Strawberry, Elaichi toast', image: 'images/box-tasting.jpg' },
        { id: 'bx-choclover', name: "Chocolate Lover's Box", price: 599, box: true, pick: 'none', badge: 'For chocolate lovers', contents: ['2 Belgian Chocolate Truffle cupcakes', '2 Dark Chocolate Stuffed cookies', '2 Dark Choc Sea Salt cookies'], desc: '2 Belgian Chocolate Truffle cupcakes, 2 Dark Chocolate Stuffed & 2 Dark Choc Sea Salt cookies', image: 'images/box-chocolate-lovers.jpg' },
        { id: 'bx-chai',     name: 'Chai Time Box',         price: 399, box: true, pick: 'optional', badge: 'With chai', contents: ['1 cake toast', '4 cookies'], desc: '1 cake toast & 4 cookies', hint: 'e.g. Elaichi toast, 2 Choco-Chip, 2 Sea Salt', image: 'images/box-chai-time.jpg' },
        { id: 'bx-two',      name: 'Treat for Two',         price: 349, box: true, pick: 'optional', badge: 'For two', contents: ['2 cupcakes', '2 cookies'], desc: '2 cupcakes & 2 cookies', hint: 'e.g. 2 Red Velvet, 2 Dark Chocolate Stuffed', image: 'images/box-treat-for-two.jpg' },
        { id: 'bx-family',   name: 'Family Weekend Box',    price: 799, box: true, pick: 'optional', badge: 'For the family', contents: ['6 cookies', '4 cupcakes', '1 cake toast'], desc: '6 cookies, 4 cupcakes & 1 cake toast', hint: 'e.g. 2 of each cookie, 2 Red Velvet, 2 Strawberry, Vanilla toast', image: 'images/box-family-weekend.jpg' },
        { id: 'bx-hamper',   name: 'Gift Hamper',           price: 999, box: true, pick: 'optional', badge: 'For gifting', contents: ['6 cookies', '4 cupcakes', '2 cake toast', 'Ribbon-tied box & thank-you card'], desc: '6 cookies, 4 cupcakes, 2 cake toast, ribbon-tied box & thank-you card', hint: 'Flavours, and who it’s for / a card message', image: 'images/box-gift-hamper.jpg' }
      ]
    }
  ]
};
