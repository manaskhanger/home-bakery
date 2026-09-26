/* =====================================================================
   BAKERY CONFIG — edit this file to make the site yours.
   Everything customer-facing (name, contact, prices) lives here.
   ===================================================================== */
window.BAKERY_CONFIG = {
  // ---- Brand ---------------------------------------------------------
  bakeryName: 'Your Bakery Name',
  headline: 'A little luxury, every weekend.',
  tagline: 'Small batches, baked fresh in our home kitchen',
  eyebrow: 'Weekend bakes · Made to order',

  // ---- Photos ----------------------------------------------------------
  // To use your own photos, just replace the files in /images with the SAME
  // file names (landscape 4:3, ~800x600 JPG works best), or change the paths
  // here and in each menu item's `image` below.
  heroImage: 'images/hero.jpg',

  // ---- Contact -------------------------------------------------------
  // Digits only, WITH country code (91 for India), e.g. '919876543210'
  whatsappNumber: '91XXXXXXXXXX',
  // How the number is shown on the site
  whatsappDisplay: '+91 [YOUR NUMBER]',
  // Instagram handle without the @
  instagramHandle: 'yourhandle',
  // Where you bake from — shown next to the delivery-distance question
  kitchenArea: '[YOUR AREA]',
  // Food licence number shown in the footer
  fssaiNumber: '[YOUR NUMBER]',

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
  minOrder: 250,            // minimum order value in ₹ (items only, before delivery)
  weekendsToShow: 2,        // how many upcoming weekends customers can pick
  cutoffHour: 15,           // orders close THURSDAY at this hour, India time (15 = 3 pm)
  weekendSlots: ['Morning · 10am – 1pm', 'Afternoon · 1pm – 4pm', 'Evening · 4pm – 7pm'],  // Sat & Sun, whole menu
  fridaySlots: ['Evening · 6pm – 9pm'],                                                    // Friday: cake toast only

  // ---- Delivery charges -------------------------------------------------
  // Up to freeWithinKm: free on every order. Beyond that: free if the order
  // is freeFromOrder or more, otherwise perKm for each km past freeWithinKm.
  // Customers pick an approximate distance (up to maxKm, or "not sure" =
  // you confirm the fee in the admin page before confirming the order).
  delivery: { freeWithinKm: 3, freeFromOrder: 800, perKm: 10, maxKm: 15 },

  // ---- Menu ------------------------------------------------------------
  // id must be unique and must match MENU in apps-script/Code.gs.
  // cartName (optional) is how the item appears in the cart, emails & admin.
  menu: [
    {
      id: 'cookies', title: 'Cookies', icon: '🍪', note: '₹70 – ₹100 each', style: 'card',
      items: [
        { id: 'ck-choco',   name: 'Classic Choco-Chip', price: 70,  desc: 'Chewy brown-butter dough loaded with chocolate chips', image: 'images/cookie-choco-chip.jpg' },
        { id: 'ck-nutella', name: 'Nutella-Stuffed',    price: 100, desc: 'A molten Nutella centre in every bite', image: 'images/cookie-nutella-stuffed.jpg' },
        { id: 'ck-seasalt', name: 'Dark Choc Sea Salt', price: 90,  desc: 'Rich dark chocolate finished with flaky sea salt', image: 'images/cookie-dark-choc-sea-salt.jpg' }
      ]
    },
    {
      id: 'cupcakes', title: 'Cupcakes', icon: '🧁', note: '₹120 – ₹130 each', style: 'card',
      items: [
        { id: 'cc-redvelvet', name: 'Red Velvet',        price: 120, desc: 'Soft cocoa sponge with cream cheese frosting', image: 'images/cupcake-red-velvet.jpg' },
        { id: 'cc-belgian',   name: 'Belgian Chocolate', price: 130, desc: 'Deep chocolate cake, silky ganache swirl', image: 'images/cupcake-belgian-chocolate.jpg' },
        { id: 'cc-caramel',   name: 'Salted Caramel',    price: 130, desc: 'Vanilla sponge, caramel core, salted caramel drizzle', image: 'images/cupcake-salted-caramel.jpg' }
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
        { id: 'bx-tasting', name: 'Tasting Box', price: 449, box: true, featured: true, badge: 'Best value · Try all', contents: ['2 cookies', '2 cupcakes', '1 cake toast pack'], desc: '2 cookies, 2 cupcakes & 1 cake toast pack', hint: 'e.g. Nutella + Sea Salt cookies, Red Velvet + Caramel, Elaichi toast', image: 'images/box-tasting.jpg' },
        { id: 'bx-cookie',  name: 'Cookie Box',  price: 449, box: true, badge: 'Mix flavours',    contents: ['Any 6 cookies'],   desc: 'Any 6 cookies', hint: 'e.g. 2 Choco-Chip, 2 Nutella, 2 Sea Salt', image: 'images/box-cookie.jpg' },
        { id: 'bx-cupcake', name: 'Cupcake Box', price: 469, box: true, badge: 'For sharing',     contents: ['Any 4 cupcakes'],  desc: 'Any 4 cupcakes', hint: 'e.g. 2 Red Velvet, 2 Salted Caramel', image: 'images/box-cupcake.jpg' },
        { id: 'bx-party',   name: 'Party Box',   price: 599, box: true, badge: 'For a gathering', contents: ['Any 6 cupcakes'],  desc: 'Any 6 cupcakes', hint: 'e.g. 3 Belgian Chocolate, 3 Red Velvet', image: 'images/box-party.jpg' }
      ]
    }
  ]
};
