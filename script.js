// ARTEON - JavaScript
const defaultProducts = [
  { id: 1, name: "Quiet Harbour", category: "painting", price: 4200, allowOffers: true, emoji: "\u26F5", tag: "Oil on canvas", desc: "Hand-painted seascape in muted tones, signed by the artist." },
  { id: 2, name: "Morning Field", category: "painting", price: 3000, allowOffers: false, emoji: "\uD83C\uDF3E", tag: "Acrylic", desc: "Acrylic landscape with warm light across open fields." },
  { id: 3, name: "Old Town Study", category: "drawing", price: 1800, allowOffers: true, emoji: "\uD83C\uDFD8\uFE0F", tag: "Charcoal", desc: "Detailed charcoal drawing of a narrow street." },
  { id: 4, name: "Portrait in Ink", category: "drawing", price: 1500, allowOffers: true, emoji: "\uD83D\uDD8B\uFE0F", tag: "Ink", desc: "Fine-line ink portrait on handmade paper." },
  { id: 5, name: "Terracotta Dusk", category: "painting", price: 5500, allowOffers: true, emoji: "\uD83C\uDF05", tag: "Original", desc: "Large traditional canvas in earthy reds and golds." },
  { id: 6, name: "Still Life with Pears", category: "painting", price: 2600, allowOffers: false, emoji: "\uD83C\uDF50", tag: "Watercolour", desc: "Soft watercolour study framed and ready to hang." }
];

const safeParse = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
let cart = safeParse("arteonCart", []);
let products = (safeParse("arteonProducts", null) || defaultProducts.map(p => ({ ...p })))
  .map(p => {
    const { saleType, endsAt, ...rest } = p;
    if (saleType === "auction" && endsAt) return { ...rest, saleType, endsAt };
    return { ...rest, tag: rest.tag === "Auction" ? "" : rest.tag };
  });
let offers = safeParse("arteonOffers", []);
let currentFilter = "all";
let pendingImage = "";
let activeOffer = null;
let pendingPresentation = null;
let pendingOptions = null;
let formPresentation = [];

const presFor = p => (p && Array.isArray(p.presentation)) ? p.presentation : [];
const withChoice = (base, choice) => choice && choice.label ? `${base} \u2022 ${choice.label}` : base;
const isAuction = p => p && p.saleType === "auction" && p.endsAt;
const isClosed = p => isAuction(p) && Date.now() >= p.endsAt;
const bidsFor = p => offers.filter(o => o.productId === p.id && o.type === "bid");
const topBid = p => bidsFor(p).reduce((best, o) => (!best || o.amount > best.amount) ? o : best, null);
const currentPrice = p => { const t = topBid(p); return t ? t.amount : p.price; };

const peso = amount => `\u20B1${Number(amount).toLocaleString("en-PH")}`;
const esc = str => String(str ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function isValidContact(value) {
  const v = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  const digits = v.replace(/\D/g, "");
  return /^[+\d\s()-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
}

function timeLeft(ms) {
  if (ms <= 0) return "Closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function toLocalInput(ts) {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function saveProducts() {
  try {
    localStorage.setItem("arteonProducts", JSON.stringify(products));
    return true;
  } catch {
    showToast("Storage is full \u2014 try a smaller photo or remove an artwork.");
    return false;
  }
}

function saveOffers() {
  try {
    localStorage.setItem("arteonOffers", JSON.stringify(offers));
    return true;
  } catch {
    showToast("Couldn't save your offer.");
    return false;
  }
}

/* ===== Filters (built from the artworks you have) ===== */
function renderFilters() {
  const cats = [...new Set(products.map(p => p.category))];
  if (currentFilter !== "all" && !cats.includes(currentFilter)) currentFilter = "all";
  const label = c => c.charAt(0).toUpperCase() + c.slice(1);
  document.getElementById("filterRow").innerHTML = ["all", ...cats].map(c => `
    <button class="filter ${c === currentFilter ? "active" : ""}" data-filter="${esc(c)}" role="tab" aria-selected="${c === currentFilter}">${esc(c === "all" ? "All" : label(c))}</button>
  `).join("");
  document.getElementById("categoryList").innerHTML = cats.map(c => `<option value="${esc(c)}"></option>`).join("");
}

/* ===== Artworks ===== */
function renderProducts() {
  const grid = document.getElementById("productGrid");
  const list = currentFilter === "all" ? products : products.filter(p => p.category === currentFilter);
  if (!list.length) {
    grid.innerHTML = `<p class="empty-note">No artworks yet. Add one in the \u201CMy Artworks\u201D section below.</p>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const actions = [];
    let priceHtml = `<span class="price">${peso(p.price)}</span>`;
    let tagText = p.tag;
    if (isAuction(p)) {
      const top = topBid(p);
      const closed = isClosed(p);
      tagText = closed ? "Auction closed" : "Auction";
      priceHtml = `<span class="price">${peso(currentPrice(p))}</span><br><small>${top ? `Top bid by ${esc(top.name)}` : "Starting bid"} \u00B7 <span class="countdown" data-ends="${p.endsAt}">${timeLeft(p.endsAt - Date.now())}</span></small>`;
      if (!closed) actions.push(`<button class="add-btn" data-bid="${p.id}" aria-label="Place a bid on ${esc(p.name)}">Place bid</button>`);
      else if (top) actions.push(`<button class="add-btn" disabled>Sold to ${esc(top.name)}</button>`);
      else actions.push(`<button class="add-btn" disabled>No bids</button>`);
    } else {
      actions.push(`<button class="add-btn" data-product="${p.id}" aria-label="Add ${esc(p.name)} to cart">+ Add</button>`);
      if (p.allowOffers) actions.push(`<button class="add-btn" data-offer="${p.id}" aria-label="Make an offer on ${esc(p.name)}">Make offer</button>`);
    }
    return `
    <article class="product-card" role="listitem">
      <div class="product-image">
        ${tagText ? `<span class="tag">${esc(tagText)}</span>` : ""}
        ${p.image
          ? `<img class="product-photo" src="${p.image}" alt="${esc(p.name)}" loading="lazy" />`
          : `<div class="product-emoji" aria-hidden="true">${esc(p.emoji || "\uD83D\uDDBC\uFE0F")}</div>`}
      </div>
      <div class="product-info">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc)}</p>
        ${p.size ? `<small class="art-size">Size: ${esc(p.size)}</small>` : ""}
        <div class="product-bottom">
          <div>${priceHtml}</div>
          <div class="product-actions">${actions.join("")}</div>
        </div>
      </div>
    </article>`;
  }).join("");
}

document.getElementById("productGrid").addEventListener("click", e => {
  const add = e.target.closest("[data-product]");
  const offer = e.target.closest("[data-offer]");
  const bid = e.target.closest("[data-bid]");
  if (add) addToCart(Number(add.dataset.product));
  if (offer) openOfferModal(Number(offer.dataset.offer));
  if (bid) openBidModal(Number(bid.dataset.bid));
});

setInterval(() => {
  let expired = false;
  document.querySelectorAll(".countdown").forEach(el => {
    const left = Number(el.dataset.ends) - Date.now();
    if (left <= 0 && el.textContent !== "Closed") expired = true;
    const label = timeLeft(left);
    if (el.textContent !== label) el.textContent = label;
  });
  if (expired) refreshShop();
}, 1000);

function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  choosePresentation(choice => {
    cart.push({
      id: Date.now(),
      name: product.name,
      details: withChoice(product.desc, choice),
      price: product.price + choice.fee
    });
    saveCart();
    showToast(`${product.name} added to cart.`);
  }, presFor(product));
}

function saveCart() {
  try {
    localStorage.setItem("arteonCart", JSON.stringify(cart));
  } catch (err) {
    showToast("Couldn't save your cart - browser storage is full.");
  }
  updateCartCount();
}

function updateCartCount() {
  document.getElementById("cartCount").textContent = cart.length;
}

function renderCart() {
  const items = document.getElementById("cartItems");
  if (!cart.length) {
    items.innerHTML = `<div class="cart-item"><p>Your cart is empty. Add an artwork to get started.</p></div>`;
  } else {
    items.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div>
          <h4>${esc(item.name)}</h4>
          <p>${esc(item.details)}</p>
        </div>
        <div>
          <strong>${peso(item.price)}</strong><br>
          <button data-remove="${item.id}" aria-label="Remove ${esc(item.name)}">Remove</button>
        </div>
      </div>
    `).join("");
  }
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  document.getElementById("cartTotal").textContent = peso(total);

  items.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      cart = cart.filter(item => item.id !== Number(btn.dataset.remove));
      saveCart();
      renderCart();
    });
  });
}

/* ===== Custom bouquet ===== */
function updateCustomTotal() {
  const flowerPrices = { Rose: 120, Tulip: 130, Sunflower: 110, Daisy: 100 };
  const flower = document.getElementById("flower").value;
  const size = document.getElementById("size");
  const wrap = document.getElementById("wrap");

  let total = flowerPrices[flower];
  total += Number(size.options[size.selectedIndex].dataset.price);

  const wrapPrices = { Kraft: 30, Pastel: 45, Premium: 70 };
  total += wrapPrices[wrap.value];

  document.querySelectorAll(".check-item input:checked").forEach(item => {
    total += Number(item.dataset.price);
  });

  document.getElementById("customTotal").textContent = peso(total);
  document.getElementById("previewTitle").textContent =
    `${size.value} ${document.getElementById("ribbon").value} Bouquet`;

  const addons = [...document.querySelectorAll(".check-item input:checked")]
    .map(i => i.dataset.addon).join(", ");
  document.getElementById("previewDetails").textContent =
    `${flower} \u2022 ${wrap.value} wrapping \u2022 ${document.getElementById("ribbon").value} ribbon${addons ? " \u2022 " + addons : ""}`;
  document.getElementById("previewWrap").textContent = `${wrap.value} wrapping`;
}

/* ===== Toast ===== */
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ===== Filters ===== */
document.getElementById("filterRow").addEventListener("click", e => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  renderFilters();
  renderProducts();
});

/* ===== Manage artworks (add / edit / delete with photos) ===== */
const form = document.getElementById("productForm");

const saleFields = document.createElement("div");
saleFields.className = "sale-fields";
saleFields.innerHTML = `
  <label>Sale type
    <select id="pSaleType">
      <option value="fixed">Fixed price</option>
      <option value="auction">Auction (starting bid)</option>
    </select>
  </label>
  <label id="pEndsWrap" hidden>Bidding closes on
    <input id="pEndsAt" type="datetime-local" />
  </label>
  <small id="pPriceHint" hidden>The price above is used as the starting bid.</small>
  <label class="check-item"><input id="pAllowOffers" type="checkbox" checked /> Accept customer offers</label>
`;
form.insertBefore(saleFields, document.getElementById("productSubmit"));

function syncSaleType() {
  const auction = document.getElementById("pSaleType").value === "auction";
  document.getElementById("pEndsWrap").hidden = !auction;
  document.getElementById("pPriceHint").hidden = !auction;
  document.getElementById("pAllowOffers").closest("label").hidden = auction;
}
document.getElementById("pSaleType").addEventListener("change", syncSaleType);

const presFields = document.createElement("div");
presFields.className = "sale-fields";
presFields.innerHTML = `
  <label>Artwork size (e.g. 40 \u00D7 60 cm)
    <input id="pSize" type="text" />
  </label>
  <strong>Presentation options for this artwork</strong>
  <small>Optional. Add options such as a frame and set the price based on the size of this piece.</small>
  <div id="pPresList"></div>
  <button type="button" id="pPresAdd" class="link-btn">+ Add an option</button>
`;
form.insertBefore(presFields, document.getElementById("productSubmit"));

function renderFormPresentation() {
  document.getElementById("pPresList").innerHTML = formPresentation.map((o, i) => `
    <div class="offer-meta">
      <label>Name <input type="text" data-fp-name="${i}" value="${esc(o.label)}" /></label>
      <label>Price (\u20B1) <input type="number" min="0" step="1" data-fp-fee="${i}" value="${o.fee}" /></label>
      <button type="button" class="link-btn danger" data-fp-remove="${i}">Remove</button>
    </div>
  `).join("");
}

document.getElementById("pPresList").addEventListener("input", e => {
  const n = e.target.closest("[data-fp-name]");
  const f = e.target.closest("[data-fp-fee]");
  if (n) formPresentation[Number(n.dataset.fpName)].label = n.value;
  if (f) formPresentation[Number(f.dataset.fpFee)].fee = f.value === "" ? "" : Number(f.value);
});

document.getElementById("pPresList").addEventListener("click", e => {
  const rm = e.target.closest("[data-fp-remove]");
  if (!rm) return;
  formPresentation.splice(Number(rm.dataset.fpRemove), 1);
  renderFormPresentation();
});

document.getElementById("pPresAdd").addEventListener("click", () => {
  formPresentation.push({ id: Date.now(), label: "", fee: 0 });
  renderFormPresentation();
});

function fileToDataUrl(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setPreview(src) {
  pendingImage = src || "";
  const box = document.getElementById("imagePreview");
  box.hidden = !pendingImage;
  document.getElementById("imagePreviewImg").src = pendingImage;
}

document.getElementById("pImage").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    setPreview(await fileToDataUrl(file));
  } catch {
    showToast("Couldn't read that image. Try another file.");
  }
});

document.getElementById("removeImage").addEventListener("click", () => {
  setPreview("");
  document.getElementById("pImage").value = "";
});

function resetForm() {
  form.reset();
  document.getElementById("editId").value = "";
  document.getElementById("productSubmit").textContent = "Add artwork";
  document.getElementById("cancelEdit").hidden = true;
  setPreview("");
  formPresentation = [];
  renderFormPresentation();
  syncSaleType();
}

document.getElementById("cancelEdit").addEventListener("click", resetForm);

form.addEventListener("submit", e => {
  e.preventDefault();
  const editId = Number(document.getElementById("editId").value);

  const presentation = formPresentation
    .map(o => ({ id: o.id, label: String(o.label).trim(), fee: Number(o.fee) }))
    .filter(o => o.label);
  if (presentation.some(o => !(o.fee >= 0))) { showToast("Enter a valid price for each presentation option."); return; }

  const auction = document.getElementById("pSaleType").value === "auction";
  let endsAt = null;
  if (auction) {
    endsAt = new Date(document.getElementById("pEndsAt").value).getTime();
    if (!endsAt || isNaN(endsAt) || endsAt <= Date.now()) { showToast("Choose a closing date and time in the future."); return; }
  }

  const data = {
    name: document.getElementById("pName").value.trim(),
    price: Number(document.getElementById("pPrice").value),
    category: document.getElementById("pCategory").value.trim().toLowerCase(),
    tag: document.getElementById("pTag").value.trim(),
    desc: document.getElementById("pDesc").value.trim(),
    size: document.getElementById("pSize").value.trim(),
    presentation,
    image: pendingImage,
    allowOffers: auction ? false : document.getElementById("pAllowOffers").checked,
    saleType: auction ? "auction" : "fixed",
    endsAt
  };

  const backup = products.map(p => ({ ...p }));
  if (editId) {
    const p = products.find(x => x.id === editId);
    Object.assign(p, data);
  } else {
    products.push({ id: Date.now(), emoji: "\uD83D\uDDBC\uFE0F", ...data });
  }

  if (!saveProducts()) { products = backup; return; }
  showToast(editId ? "Artwork updated." : "Artwork added to the gallery.");
  resetForm();
  refreshShop();
});

document.getElementById("manageList").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-delete]");

  if (editBtn) {
    const p = products.find(x => x.id === Number(editBtn.dataset.edit));
    if (!p) return;
    document.getElementById("editId").value = p.id;
    document.getElementById("pName").value = p.name;
    document.getElementById("pPrice").value = p.price;
    document.getElementById("pCategory").value = p.category;
    document.getElementById("pTag").value = p.tag || "";
    document.getElementById("pDesc").value = p.desc;
    document.getElementById("pSize").value = p.size || "";
    formPresentation = presFor(p).map(o => ({ ...o }));
    renderFormPresentation();
    document.getElementById("pAllowOffers").checked = !!p.allowOffers;
    document.getElementById("pSaleType").value = isAuction(p) ? "auction" : "fixed";
    document.getElementById("pEndsAt").value = isAuction(p) ? toLocalInput(p.endsAt) : "";
    syncSaleType();
    setPreview(p.image || "");
    document.getElementById("productSubmit").textContent = "Save changes";
    document.getElementById("cancelEdit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (delBtn) {
    const id = Number(delBtn.dataset.delete);
    const p = products.find(x => x.id === id);
    if (!p || !confirm(`Remove "${p.name}" from the gallery?`)) return;
    products = products.filter(x => x.id !== id);
    offers = offers.filter(o => o.productId !== id);
    saveProducts();
    saveOffers();
    if (Number(document.getElementById("editId").value) === id) resetForm();
    refreshShop();
    showToast("Artwork removed.");
  }
});

function renderManageList() {
  document.getElementById("productCount").textContent = `(${products.length})`;
  document.getElementById("manageList").innerHTML = products.length
    ? products.map(p => `
      <li class="manage-item">
        <div class="manage-thumb">
          ${p.image ? `<img src="${p.image}" alt="" />` : `<span aria-hidden="true">${esc(p.emoji || "\uD83D\uDDBC\uFE0F")}</span>`}
        </div>
        <div class="manage-meta">
          <strong>${esc(p.name)}</strong>
          <small>${isAuction(p) ? `${peso(currentPrice(p))} \u00B7 auction ${isClosed(p) ? "closed" : "closes " + esc(new Date(p.endsAt).toLocaleString())}` : peso(p.price)} \u00B7 ${esc(p.category)}${p.size ? ` \u00B7 ${esc(p.size)}` : ""}${p.allowOffers ? " \u00B7 offers on" : ""}</small>
        </div>
        <div class="manage-actions">
          <button type="button" class="link-btn" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">Edit</button>
          <button type="button" class="link-btn danger" data-delete="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button>
        </div>
      </li>`).join("")
    : `<li class="empty-note">Nothing here yet \u2014 add your first artwork.</li>`;
}

/* ===== Presentation choice (options are set per artwork by the seller) ===== */
const presentationModal = document.createElement("div");
presentationModal.className = "modal hidden";
presentationModal.id = "presentationModal";
presentationModal.innerHTML = `
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="presentationTitle">
    <button type="button" id="closePresentation" class="modal-close" aria-label="Close">\u00D7</button>
    <h2 id="presentationTitle">Choose your presentation</h2>
    <p>How would you like your artwork delivered?</p>
    <form id="presentationForm">
      <div id="presentationChoices"></div>
      <button type="submit" class="btn btn-primary full">Continue</button>
    </form>
  </div>
`;
document.body.appendChild(presentationModal);

const feeText = fee => fee > 0 ? `+${peso(fee)}` : "free";

function renderPresentationChoices(options) {
  document.getElementById("presentationChoices").innerHTML = options.map((o, i) => `
    <label class="check-item"><input type="radio" name="presentation" value="${o.id}" ${i === 0 ? "checked" : ""} /> ${esc(o.label)} (${feeText(o.fee)})</label>
  `).join("");
}

function choosePresentation(callback, options = []) {
  if (!options.length) {
    callback({ label: "", fee: 0 });
    return;
  }
  pendingPresentation = callback;
  pendingOptions = options;
  renderPresentationChoices(options);
  presentationModal.classList.remove("hidden");
}

document.getElementById("closePresentation").addEventListener("click", () => {
  pendingPresentation = null;
  presentationModal.classList.add("hidden");
});

document.getElementById("presentationForm").addEventListener("submit", e => {
  e.preventDefault();
  const options = pendingOptions || [];
  const value = Number(new FormData(e.target).get("presentation"));
  const option = options.find(o => o.id === value) || options[0];
  const callback = pendingPresentation;
  pendingPresentation = null;
  presentationModal.classList.add("hidden");
  if (callback && option) callback({ label: option.label, fee: option.fee });
});

/* ===== Offers: customer side ===== */
const offerModal = document.createElement("div");
offerModal.className = "modal hidden";
offerModal.id = "offerModal";
offerModal.innerHTML = `
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="offerTitle">
    <button type="button" id="closeOffer" class="modal-close" aria-label="Close">\u00D7</button>
    <h2 id="offerTitle"></h2>
    <p id="offerHint"></p>
    <form id="offerForm">
      <label>Your name <input id="offerName" type="text" required /></label>
      <label id="offerContactWrap" hidden>Phone number or email <input id="offerContact" type="text" autocomplete="email" placeholder="09123456789 or you@example.com" /></label>
      <label>Amount (\u20B1) <input id="offerAmount" type="number" min="1" step="1" required /></label>
      <label id="offerNoteWrap">Note to the artist (optional) <textarea id="offerNote" rows="2"></textarea></label>
      <button type="submit" id="offerSubmit" class="btn btn-primary full">Submit offer</button>
    </form>
  </div>
`;
document.body.appendChild(offerModal);

function openOfferModal(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  activeOffer = { productId, type: "offer" };
  document.getElementById("offerTitle").textContent = `Make an offer for ${p.name}`;
  document.getElementById("offerHint").textContent = `Listed at ${peso(p.price)}. The artist can accept, reject or counter.`;
  document.getElementById("offerAmount").removeAttribute("min");
  document.getElementById("offerAmount").value = "";
  document.getElementById("offerNoteWrap").hidden = false;
  document.getElementById("offerContactWrap").hidden = true;
  document.getElementById("offerContact").required = false;
  document.getElementById("offerSubmit").textContent = "Submit offer";
  offerModal.classList.remove("hidden");
}

function openBidModal(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  if (isClosed(p)) { showToast("Bidding has closed for this artwork."); refreshShop(); return; }
  const top = topBid(p);
  const minBid = top ? top.amount + 1 : p.price;
  activeOffer = { productId, type: "bid", minBid };
  document.getElementById("offerTitle").textContent = `Place a bid on ${p.name}`;
  document.getElementById("offerHint").textContent = `${top ? `Current bid ${peso(top.amount)}.` : `Starting bid ${peso(p.price)}.`} Minimum ${peso(minBid)}. Closes ${new Date(p.endsAt).toLocaleString()}.`;
  document.getElementById("offerAmount").min = minBid;
  document.getElementById("offerAmount").value = minBid;
  document.getElementById("offerNoteWrap").hidden = true;
  document.getElementById("offerContactWrap").hidden = false;
  document.getElementById("offerContact").required = true;
  document.getElementById("offerSubmit").textContent = "Place bid";
  offerModal.classList.remove("hidden");
}

document.getElementById("closeOffer").addEventListener("click", () => offerModal.classList.add("hidden"));

document.getElementById("offerForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!activeOffer) return;
  const p = products.find(x => x.id === activeOffer.productId);
  if (!p) return;
  const amount = Number(document.getElementById("offerAmount").value);
  if (!(amount > 0)) { showToast("Enter a valid amount."); return; }
  const isBid = activeOffer.type === "bid";
  let contact = "";
  if (isBid) {
    contact = document.getElementById("offerContact").value.trim();
    if (!contact) { showToast("Enter your phone number or email to place a bid."); return; }
    if (!isValidContact(contact)) { showToast("Enter a valid phone number or email address."); return; }
    if (isClosed(p)) { showToast("Bidding has closed for this artwork."); offerModal.classList.add("hidden"); refreshShop(); return; }
    const top = topBid(p);
    const minBid = top ? top.amount + 1 : p.price;
    if (amount < minBid) { showToast(`Your bid must be at least ${peso(minBid)}.`); return; }
  }
  offers.push({
    id: Date.now(),
    productId: p.id,
    type: isBid ? "bid" : "offer",
    name: document.getElementById("offerName").value.trim(),
    contact,
    amount,
    note: isBid ? "" : document.getElementById("offerNote").value.trim(),
    status: isBid ? "bid" : "pending",
    createdAt: Date.now()
  });
  saveOffers();
  offerModal.classList.add("hidden");
  e.target.reset();
  showToast(isBid ? "Your bid was placed." : "Your offer was sent to the artist.");
  refreshShop();
});

/* ===== Offers: artist inbox ===== */
const inbox = document.createElement("section");
inbox.className = "offer-inbox";
inbox.id = "offerInbox";
inbox.innerHTML = `<h3>Offers &amp; bids <span id="offerCount"></span></h3><ul id="offerList" class="offer-list"></ul>`;
document.getElementById("manageList").insertAdjacentElement("afterend", inbox);

const statusLabel = { pending: "Pending", accepted: "Accepted", rejected: "Rejected", countered: "Countered", purchased: "Purchased", bid: "Bid", won: "Winning bid", outbid: "Outbid" };

function bidStatus(o, p) {
  if (o.status === "purchased") return "purchased";
  const top = topBid(p);
  if (isClosed(p) && top && top.id === o.id) return "won";
  if (top && top.id !== o.id) return "outbid";
  return "bid";
}

function renderOffers() {
  const list = document.getElementById("offerList");
  const sorted = [...offers].sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById("offerCount").textContent = `(${offers.filter(o => o.status === "pending").length} pending)`;
  if (!sorted.length) {
    list.innerHTML = `<li class="empty-note">No offers or bids yet.</li>`;
    return;
  }
  list.innerHTML = sorted.map(o => {
    const p = products.find(x => x.id === o.productId);
    if (!p) return "";
    if (o.type === "bid") {
      const st = bidStatus(o, p);
      const action = st === "won" ? `<button type="button" class="link-btn" data-win="${o.id}">Add to cart at ${peso(o.amount)}</button>` : "";
      return `
      <li class="offer-item status-${st}">
        <div class="offer-meta">
          <strong>${esc(p.name)}</strong>
          <small>Bid of ${peso(o.amount)} from ${esc(o.name)}</small>
          ${o.contact ? `<small>Contact: ${esc(o.contact)}</small>` : ""}
        </div>
        <span class="status-badge">${statusLabel[st]}</span>
        <div class="offer-actions">${action}</div>
      </li>`;
    }
    let actions = "";
    if (o.status === "pending") {
      actions = `
        <button type="button" class="link-btn" data-accept="${o.id}">Accept</button>
        <button type="button" class="link-btn danger" data-reject="${o.id}">Reject</button>
        <button type="button" class="link-btn" data-counter="${o.id}">Counter</button>`;
    } else if (o.status === "accepted") {
      actions = `<button type="button" class="link-btn" data-buy="${o.id}">Add to cart at ${peso(o.amount)}</button>`;
    } else if (o.status === "countered") {
      actions = `<button type="button" class="link-btn" data-buy="${o.id}">Accept counter ${peso(o.counter)}</button>`;
    }
    return `
      <li class="offer-item status-${o.status}">
        <div class="offer-meta">
          <strong>${esc(p.name)}</strong>
          <small>Offer of ${peso(o.amount)} from ${esc(o.name)}${o.counter ? ` \u00B7 counter ${peso(o.counter)}` : ""}</small>
          ${o.note ? `<small>\u201C${esc(o.note)}\u201D</small>` : ""}
        </div>
        <span class="status-badge">${statusLabel[o.status] || esc(o.status)}</span>
        <div class="offer-actions">${actions}</div>
      </li>`;
  }).join("");
}

inbox.addEventListener("click", e => {
  const find = attr => {
    const btn = e.target.closest(`[${attr}]`);
    return btn ? offers.find(o => o.id === Number(btn.getAttribute(attr))) : null;
  };
  const accept = find("data-accept");
  const reject = find("data-reject");
  const counter = find("data-counter");
  const buy = find("data-buy");
  const win = find("data-win");

  if (win) {
    const p = products.find(x => x.id === win.productId);
    if (!p) return;
    choosePresentation(choice => {
      cart.push({
        id: Date.now(),
        name: p.name,
        details: withChoice("Winning bid", choice),
        price: win.amount + choice.fee
      });
      win.status = "purchased";
      saveCart();
      saveOffers();
      refreshShop();
      showToast(`${p.name} added to cart.`);
    }, presFor(p));
  }

  if (accept) {
    accept.status = "accepted";
    saveOffers();
    refreshShop();
    showToast("Accepted.");
  }

  if (reject) {
    reject.status = "rejected";
    saveOffers();
    refreshShop();
    showToast("Rejected.");
  }

  if (counter) {
    const value = Number(prompt("Your counter amount (\u20B1):", counter.amount));
    if (!(value > 0)) return;
    counter.status = "countered";
    counter.counter = value;
    saveOffers();
    refreshShop();
    showToast("Counter offer sent.");
  }

  if (buy) {
    const p = products.find(x => x.id === buy.productId);
    if (!p) return;
    choosePresentation(choice => {
      const countered = buy.status === "countered";
      cart.push({
        id: Date.now(),
        name: p.name,
        details: withChoice(countered ? "Agreed counter price" : "Agreed price", choice),
        price: (countered ? buy.counter : buy.amount) + choice.fee
      });
      buy.status = "purchased";
      saveCart();
      saveOffers();
      refreshShop();
      showToast(`${p.name} added to cart.`);
    }, presFor(p));
  }
});

function refreshShop() {
  renderFilters();
  renderProducts();
  renderManageList();
  renderOffers();
  renderBackupInfo();
}

/* ===== Custom form listeners ===== */
document.querySelectorAll("#flower, #size, #wrap, .check-item input").forEach(el => {
  if (el.closest("#productForm") || el.closest("#presentationModal")) return;
  el.addEventListener("change", updateCustomTotal);
});

document.querySelectorAll(".swatch").forEach(swatch => {
  swatch.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach(s => {
      s.classList.remove("active");
      s.setAttribute("aria-checked", "false");
    });
    swatch.classList.add("active");
    swatch.setAttribute("aria-checked", "true");
    document.getElementById("ribbon").value = swatch.dataset.color;
    updateCustomTotal();
  });
});

document.getElementById("customForm").addEventListener("submit", e => {
  e.preventDefault();
  const totalText = document.getElementById("customTotal").textContent;
  const total = Number(totalText.replace(/[\u20B1,]/g, ""));
  const flower = document.getElementById("flower").value;
  const size = document.getElementById("size").value;
  const wrap = document.getElementById("wrap").value;
  const ribbon = document.getElementById("ribbon").value;

  choosePresentation(choice => {
    cart.push({
      id: Date.now(),
      name: `${size} Custom ${flower} Bouquet`,
      details: withChoice(`${wrap} wrapping \u2022 ${ribbon} ribbon`, choice),
      price: total + choice.fee
    });
    saveCart();
    showToast("Custom item added to cart.");
    document.getElementById("cartModal").classList.remove("hidden");
    renderCart();
  });
});

/* ===== Modals ===== */
document.getElementById("cartButton").addEventListener("click", () => {
  renderCart();
  document.getElementById("cartModal").classList.remove("hidden");
});
document.getElementById("closeCart").addEventListener("click", () => {
  document.getElementById("cartModal").classList.add("hidden");
});
document.getElementById("checkoutButton").addEventListener("click", () => {
  if (!cart.length) { showToast("Your cart is empty."); return; }
  document.getElementById("cartModal").classList.add("hidden");
  document.getElementById("checkoutModal").classList.remove("hidden");
});
document.getElementById("closeCheckout").addEventListener("click", () => {
  document.getElementById("checkoutModal").classList.add("hidden");
});

/* Close modals on backdrop click */
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) {
      if (modal === presentationModal) pendingPresentation = null;
      modal.classList.add("hidden");
    }
  });
});

/* Close modals with Escape */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    pendingPresentation = null;
    document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
  }
});

document.getElementById("checkoutForm").addEventListener("submit", e => {
  e.preventDefault();
  const orderNumber = `AR-${Math.floor(10000 + Math.random() * 90000)}`;
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  cart = [];
  saveCart();
  document.getElementById("checkoutModal").classList.add("hidden");
  showToast(`Order ${orderNumber} placed \u2014 ${peso(total)} total.`);
  e.target.reset();
});

document.getElementById("contactForm").addEventListener("submit", e => {
  e.preventDefault();
  showToast("Thanks! Your message has been received.");
  e.target.reset();
});

/* ===== Reviews ===== */
let reviews = safeParse("arteonReviews", []);
let reviewRating = 0;

const starText = n => "\u2605".repeat(n) + "\u2606".repeat(5 - n);

const reviewBox = document.createElement("div");
reviewBox.className = "review-box";
reviewBox.innerHTML = `
  <h3>Write a review</h3>
  <p id="reviewSummary"></p>
  <form id="reviewForm">
    <label>Your name <input id="reviewName" type="text" required /></label>
    <div>
      <span>Your rating</span>
      <div id="reviewStars" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="review-star" data-star="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">\u2606</button>`).join("")}
      </div>
    </div>
    <label>Your review <textarea id="reviewText" rows="3" required></textarea></label>
    <button type="submit" class="btn btn-primary">Submit review</button>
  </form>
  <ul id="reviewList" class="review-list"></ul>
`;

let reviewsHost = document.getElementById("reviews");
if (!reviewsHost) {
  reviewsHost = document.createElement("section");
  reviewsHost.id = "reviews";
  reviewsHost.innerHTML = `<h2>Reviews</h2>`;
  const anchor = document.querySelector("footer");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(reviewsHost, anchor);
  else document.body.appendChild(reviewsHost);
}
reviewsHost.appendChild(reviewBox);

function paintStars() {
  reviewBox.querySelectorAll("[data-star]").forEach(btn => {
    const n = Number(btn.dataset.star);
    btn.textContent = n <= reviewRating ? "\u2605" : "\u2606";
    btn.setAttribute("aria-checked", String(n === reviewRating));
  });
}

function renderReviews() {
  const list = document.getElementById("reviewList");
  const summary = document.getElementById("reviewSummary");
  if (!reviews.length) {
    summary.textContent = "No reviews yet \u2014 be the first to rate us.";
    list.innerHTML = "";
    return;
  }
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  summary.textContent = `${avg.toFixed(1)} / 5 \u00B7 ${reviews.length} review${reviews.length > 1 ? "s" : ""}`;
  list.innerHTML = [...reviews].sort((a, b) => b.createdAt - a.createdAt).map(r => `
    <li class="review-item">
      <strong>${esc(r.name)}</strong>
      <span aria-label="${r.rating} out of 5 stars">${starText(r.rating)}</span>
      <p>${esc(r.text)}</p>
      <small>${esc(new Date(r.createdAt).toLocaleDateString())}</small>
    </li>
  `).join("");
}

reviewBox.querySelector("#reviewStars").addEventListener("click", e => {
  const btn = e.target.closest("[data-star]");
  if (!btn) return;
  reviewRating = Number(btn.dataset.star);
  paintStars();
});

document.getElementById("reviewForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!(reviewRating >= 1)) { showToast("Please choose a star rating."); return; }
  const name = document.getElementById("reviewName").value.trim();
  const text = document.getElementById("reviewText").value.trim();
  if (!name || !text) { showToast("Please enter your name and review."); return; }
  const next = [...reviews, { id: Date.now(), name, rating: reviewRating, text, createdAt: Date.now() }];
  try {
    localStorage.setItem("arteonReviews", JSON.stringify(next));
  } catch {
    showToast("Couldn't save your review.");
    return;
  }
  reviews = next;
  e.target.reset();
  reviewRating = 0;
  paintStars();
  renderReviews();
  showToast("Thanks for your review!");
});

/* ===== Mobile menu ===== */
document.querySelectorAll(".nav-links a").forEach(link => {
  const text = link.textContent.toLowerCase();
  const href = (link.getAttribute("href") || "").toLowerCase();
  if (/commission|custom|auction/.test(text) || /commission|custom|auction/.test(href)) {
    const item = link.closest("li");
    (item && item.parentElement.classList.contains("nav-links") ? item : link).remove();
  }
});

document.querySelectorAll("footer a, footer button").forEach(el => {
  const text = el.textContent.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^auctions?\s*(&|and)\s*offers$/.test(text) || /^commissions?$/.test(text)) {
    const item = el.closest("li");
    (item || el).remove();
  }
});

const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
menuToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", isOpen);
});
document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

/* ===== Backup & restore (data lives in this browser, so keep a copy) ===== */
const BACKUP_KEYS = ["arteonProducts", "arteonCart", "arteonOffers", "arteonReviews", "bcInbox", "bcLots", "bcOffers"];

const backupBox = document.createElement("section");
backupBox.className = "backup-box";
backupBox.innerHTML = `
  <h3>Backup &amp; restore</h3>
  <p id="backupInfo" role="status"></p>
  <p class="backup-help">Download a copy now and then. If this browser's data is ever cleared, or you open the site on another computer, restore it from the file.</p>
  <div class="backup-actions">
    <button type="button" id="backupDownload" class="btn btn-light">Download backup</button>
    <label class="btn btn-light backup-restore">Restore from backup
      <input id="backupFile" type="file" accept="application/json,.json" class="visually-hidden" />
    </label>
  </div>
`;
inbox.insertAdjacentElement("afterend", backupBox);

function renderBackupInfo() {
  const el = document.getElementById("backupInfo");
  if (!el) return;
  let chars = 0;
  try {
    BACKUP_KEYS.forEach(k => { chars += k.length + (localStorage.getItem(k) || "").length; });
  } catch (err) { /* storage blocked */ }
  const mb = chars / 1000000;
  el.textContent = `${products.length} artwork${products.length === 1 ? "" : "s"} saved in this browser, using about ${mb.toFixed(1)} of roughly 5 MB.` +
    (mb > 4 ? " Storage is almost full - download a backup and remove some photos." : "");
}

document.getElementById("backupDownload").addEventListener("click", () => {
  const data = {};
  BACKUP_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  });
  const file = JSON.stringify({ app: "arteon", version: 1, savedAt: new Date().toISOString(), data });
  const url = URL.createObjectURL(new Blob([file], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `arteon-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup downloaded.");
});

document.getElementById("backupFile").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showToast("Couldn't read that file.");
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (err) { showToast("That isn't a valid backup file."); return; }
    if (!parsed || parsed.app !== "arteon" || !parsed.data || typeof parsed.data !== "object") {
      showToast("That isn't an ARTEON backup.");
      return;
    }
    const keys = BACKUP_KEYS.filter(k => typeof parsed.data[k] === "string");
    if (!keys.length) { showToast("That backup is empty."); return; }
    for (const k of keys) {
      try { JSON.parse(parsed.data[k]); } catch (err) { showToast("That backup file is damaged."); return; }
    }
    if (!confirm("Replace the data in this browser with the backup? This cannot be undone.")) return;
    const previous = {};
    BACKUP_KEYS.forEach(k => { previous[k] = localStorage.getItem(k); });
    try {
      BACKUP_KEYS.forEach(k => {
        if (keys.indexOf(k) !== -1) localStorage.setItem(k, parsed.data[k]);
        else localStorage.removeItem(k);
      });
    } catch (err) {
      try {
        BACKUP_KEYS.forEach(k => {
          if (previous[k] === null) localStorage.removeItem(k);
          else localStorage.setItem(k, previous[k]);
        });
      } catch (err2) { /* nothing more we can do */ }
      showToast("Not enough browser storage to restore that backup.");
      return;
    }
    location.reload();
  };
  reader.readAsText(file);
});

/* Ask the browser not to clear our saved data when it is short on space */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ===== Init ===== */
document.getElementById("year").textContent = new Date().getFullYear();
renderFormPresentation();
syncSaleType();
refreshShop();
renderReviews();
updateCartCount();
updateCustomTotal();
