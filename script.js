/**
 * KFC CSV Landing Page - Vanilla JS + PapaParse.js
 * Đọc dữ liệu thực đơn & khuyến mãi từ data/menu.csv (hoặc menu.csv), lọc/tìm kiếm và quản lý giỏ hàng.
 */

const CSV_FILE_PATH = 'data/menu.csv';
const ALT_CSV_FILE_PATH = 'menu.csv';
const STORAGE_CART_KEY = 'kfc_csv_cart_v1';

// Dữ liệu dự phòng đồng bộ với data/menu.csv (hỗ trợ khi mở trực tiếp bằng giao thức file://)
const FALLBACK_CSV_DATA = `id,name,category,description,price,old_price,badge,promo_code,image,featured
1,"Gà Rán Giòn Cay","Gà rán","Gà rán giòn rụm đậm vị cay nồng chuẩn vị KFC, lớp vỏ vàng ươm hấp dẫn.",45000,55000,"Bán chạy",GION10,images/chicken-crispy.svg,true
2,"Gà Truyền Thống","Gà rán","Công thức 11 loại thảo mộc và gia vị bí truyền đậm đà, thịt gà mềm mọng nước.",45000,,"Chuẩn vị","",images/chicken-crispy.svg,false
3,"Combo Gà Rán 1 Người","Combo","1 Miếng Gà Rán + 1 Khoai Tây Chiên (Vừa) + 1 Pepsi Tươi mát lạnh.",95000,115000,"Tiết kiệm 20K",COMBO95,images/combo-bucket.svg,true
4,"Combo Gia Đình Thỏa Thích","Combo","6 Miếng Gà Rán + 2 Khoai Tây Chiên (Lớn) + 3 Pepsi Tươi giải nhiệt.",279000,335000,"Tiết kiệm 56K",FAMILY56,images/combo-bucket.svg,true
5,"Burger Gà Zinger","Burger","Fillet gà giòn cay kẹp trong bánh mì mè thơm, xà lách tươi và sốt Mayo đậm đà.",65000,79000,"Deal Hot",ZINGER15,images/burger-zinger.svg,true
6,"Burger Gà Phô Mai","Burger","Fillet gà giòn phủ sốt phô mai cheddar tan chảy béo ngậy cực đỉnh.",59000,,"Béo ngậy","",images/burger-zinger.svg,false
7,"Khoai Tây Chiên (L)","Món ăn kèm","Khoai tây chiên vàng giòn rụm, vỏ mỏng ruột mịn bùi béo.",35000,,"Giòn rụm","",images/fries-golden.svg,false
8,"Bắp Cải Trộn Coleslaw","Món ăn kèm","Bắp cải tươi giòn ngọt trộn sốt béo thanh nhẹ giải ngấy hoàn hảo.",22000,,"Thanh mát","",images/coleslaw.svg,false
9,"Pepsi Tươi Cold","Đồ uống","Ly Pepsi tươi mát lạnh sảng khoái đánh tan cơn khát.",19000,,"Sảng khoái","",images/drink-cola.svg,false
10,"Trà Đào Băng Tuyết","Đồ uống","Trà đào thơm ngát thanh nhiệt kết hợp đá tuyết mát lạnh sảng khoái.",29000,,"Thơm mát","",images/peach-tea.svg,false
11,"Gà Viên Lắc Phô Mai","Gà rán","Từng viên gà không xương chiên giòn tan phủ đầy bột phô mai mặn béo vui miệng.",49000,,"Món mới","",images/chicken-popcorn.svg,false
12,"Bánh Tart Trứng Nướng (2 Cái)","Món ăn kèm","Đế bánh ngàn lớp giòn xốp ôm trọn nhân kem trứng sữa nướng thơm lừng nóng hổi.",38000,,"Yêu thích","",images/egg-tart.svg,false`;

// Bảng mã giảm giá hợp lệ
const PROMO_CODES = {
  FAMILY56: { discount: 30000, minOrder: 200000, label: 'Giảm thêm 30.000đ cho đơn từ 200K' },
  COMBO95: { discount: 15000, minOrder: 95000, label: 'Giảm thêm 15.000đ cho đơn từ 95K' },
  ZINGER15: { discount: 15000, minOrder: 90000, label: 'Giảm thêm 15.000đ cho đơn từ 90K' },
  GION10: { discount: 10000, minOrder: 60000, label: 'Giảm thêm 10.000đ cho đơn từ 60K' }
};

// State ứng dụng
const state = {
  items: [],
  activeCategory: 'Tất cả',
  searchQuery: '',
  sortBy: 'default',
  cart: loadCartFromStorage(),
  appliedPromo: null
};

// Tham chiếu DOM
const dom = {
  promoGrid: document.getElementById('promo-grid'),
  menuGrid: document.getElementById('menu-grid'),
  categoryTabs: document.getElementById('category-tabs'),
  searchInput: document.getElementById('menu-search'),
  sortSelect: document.getElementById('menu-sort'),
  csvFileInput: document.getElementById('csv-file-input'),
  csvStatus: document.getElementById('csv-status'),
  cartCount: document.getElementById('cart-count'),
  cartOpenBtn: document.getElementById('cart-open-btn'),
  cartCloseBtn: document.getElementById('cart-close-btn'),
  cartDrawer: document.getElementById('cart-drawer'),
  cartBackdrop: document.getElementById('cart-backdrop'),
  cartItems: document.getElementById('cart-items'),
  cartSubtotal: document.getElementById('cart-subtotal'),
  cartDiscount: document.getElementById('cart-discount'),
  discountRow: document.getElementById('discount-row'),
  cartTotal: document.getElementById('cart-total'),
  promoInput: document.getElementById('promo-code-input'),
  applyPromoBtn: document.getElementById('apply-promo-btn'),
  promoFeedback: document.getElementById('promo-feedback'),
  checkoutBtn: document.getElementById('checkout-btn'),
  mobileMenuBtn: document.getElementById('mobile-menu-btn'),
  mobileNav: document.getElementById('mobile-nav'),
  toast: document.getElementById('toast')
};

let toastTimer = null;

/* ==========================================================================
   TIỆN ÍCH ĐỊNH DẠNG & CHUẨN HÓA DỮ LIỆU
   ========================================================================== */

function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + 'đ';
}

function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* Chọn SVG minh họa tự vẽ tương ứng theo tên món/danh mục khi ảnh CSV chưa có sẵn */
function resolveFallbackSvg(name, category) {
  const key = normalizeVietnamese(`${name} ${category}`);
  if (key.includes('combo') || key.includes('gia dinh')) return 'images/combo-bucket.svg';
  if (key.includes('burger')) return 'images/burger-zinger.svg';
  if (key.includes('vien') || key.includes('popcorn')) return 'images/chicken-popcorn.svg';
  if (key.includes('com')) return 'images/rice-chicken.svg';
  if (key.includes('khoai')) return 'images/fries-golden.svg';
  if (key.includes('coleslaw') || key.includes('bap cai')) return 'images/coleslaw.svg';
  if (key.includes('tart') || key.includes('trung')) return 'images/egg-tart.svg';
  if (key.includes('tra dao')) return 'images/peach-tea.svg';
  if (key.includes('uong') || key.includes('pepsi') || key.includes('cola')) return 'images/drink-cola.svg';
  return 'images/chicken-crispy.svg';
}

function normalizeMenuRow(row, index) {
  const name = String(row.name || 'Món gà rán').trim();
  const category = String(row.category || 'Khác').trim();
  const price = Number(row.price) || 0;
  const rawOldPrice = row.old_price ? Number(row.old_price) : null;
  const isFeatured =
    String(row.featured || '').trim().toLowerCase() === 'true' ||
    String(row.is_promo || '').trim().toLowerCase() === 'true';

  const fallbackSvg = resolveFallbackSvg(name, category);
  const rawImage = String(row.image || '').trim();

  return {
    id: String(row.id || index + 1).trim(),
    name,
    category,
    price,
    oldPrice: rawOldPrice && rawOldPrice > price ? rawOldPrice : null,
    rating: Number(row.rating) || (isFeatured ? 4.9 : 4.8),
    badge: String(row.badge || (isFeatured ? 'Nổi bật' : '')).trim(),
    isPromo: isFeatured,
    promoCode: String(row.promo_code || '').trim().toUpperCase(),
    image: rawImage || fallbackSvg,
    fallbackSvg,
    imageAlt: String(row.image_alt || `Minh họa món ${name}`).trim(),
    description: String(row.description || '').trim()
  };
}

/* Bộ phân tích CSV nhẹ dự phòng khi không kết nối mạng tới CDN PapaParse */
function basicParseCSV(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      if (ch === '\r') i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

function parseCsvString(csvText) {
  if (window.Papa) {
    const result = window.Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });
    return result.data;
  }
  return basicParseCSV(csvText);
}

/* ==========================================================================
   ĐỌC FILE CSV VỚI PAPAPARSE.JS
   ========================================================================== */

function loadMenuFromCSV() {
  if (window.location.protocol === 'file:') {
    const rawRows = parseCsvString(FALLBACK_CSV_DATA);
    applyMenuData(
      rawRows,
      'Đang hiển thị 12 món từ dữ liệu CSV tích hợp (chạy Live Server để tự động đọc data/menu.csv hoặc bấm "Nạp CSV" để chọn menu.csv bất kỳ).'
    );
    return;
  }

  const tryParseUrl = (url, onFail) => {
    if (window.Papa) {
      window.Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete(results) {
          if (results.data && results.data.length > 0) {
            applyMenuData(results.data, `Đã đồng bộ ${results.data.length} món ăn trực tiếp từ ${url} bằng PapaParse.js.`);
          } else {
            onFail();
          }
        },
        error() {
          onFail();
        }
      });
    } else {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('HTTP error');
          return res.text();
        })
        .then((text) => {
          const rows = basicParseCSV(text);
          if (rows.length > 0) {
            applyMenuData(rows, `Đã đồng bộ ${rows.length} món ăn từ ${url}.`);
          } else {
            onFail();
          }
        })
        .catch(onFail);
    }
  };

  tryParseUrl(CSV_FILE_PATH, () => {
    tryParseUrl(ALT_CSV_FILE_PATH, () => {
      const fallbackRows = parseCsvString(FALLBACK_CSV_DATA);
      applyMenuData(fallbackRows, 'Đã nạp dữ liệu CSV dự phòng.');
    });
  });
}

function applyMenuData(rawRows, statusMessage) {
  state.items = rawRows
    .map((row, idx) => normalizeMenuRow(row, idx))
    .filter((item) => item.name && item.price > 0);

  state.activeCategory = 'Tất cả';
  dom.csvStatus.textContent = statusMessage;

  renderPromos();
  renderCategoryTabs();
  renderMenuGrid();
  renderCart();
}

/* ==========================================================================
   RENDER GIAO DIỆN KHUYẾN MÃI & THỰC ĐƠN
   ========================================================================== */

function createProductImageMarkup(item) {
  if (!item.image) {
    return `<div class="fallback-thumb" role="img" aria-label="${escapeHtml(item.imageAlt)}">🍗</div>`;
  }
  return `
    <img
      src="${escapeHtml(item.image)}"
      alt="${escapeHtml(item.imageAlt)}"
      width="400"
      height="300"
      loading="lazy"
      data-fallback-svg="${escapeHtml(item.fallbackSvg)}"
      data-fallback-alt="${escapeHtml(item.imageAlt)}"
    >
  `;
}

function attachImageFallbacks(container) {
  const images = container.querySelectorAll('img[data-fallback-alt]');
  images.forEach((img) => {
    img.addEventListener('error', function handleImgError() {
      const fallbackSvg = img.dataset.fallbackSvg;
      // Thử chuyển sang SVG minh họa tự vẽ nếu đường dẫn ảnh trong CSV chưa tồn tại
      if (fallbackSvg && img.getAttribute('src') !== fallbackSvg) {
        img.setAttribute('src', fallbackSvg);
        return;
      }
      // Nếu vẫn lỗi thì dùng ô màu + emoji đùi gà theo DESIGN.md
      const placeholder = document.createElement('div');
      placeholder.className = 'fallback-thumb';
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', img.dataset.fallbackAlt || 'Minh họa món gà rán');
      placeholder.textContent = '🍗';
      img.replaceWith(placeholder);
    });
  });
}

function renderPromos() {
  const promos = state.items.filter((item) => item.isPromo);

  if (promos.length === 0) {
    dom.promoGrid.innerHTML = `<div class="empty-state"><p>Hiện chưa có chương trình khuyến mãi hoặc món nổi bật trong file CSV.</p></div>`;
    return;
  }

  dom.promoGrid.innerHTML = promos
    .map((item) => `
      <article class="promo-card">
        <div class="promo-media">
          ${createProductImageMarkup(item)}
          ${item.badge ? `<span class="card-badge">${escapeHtml(item.badge)}</span>` : ''}
          ${item.promoCode ? `<span class="promo-code-chip">Mã: ${escapeHtml(item.promoCode)}</span>` : ''}
        </div>
        <div class="promo-body">
          <h3 class="promo-title">${escapeHtml(item.name)}</h3>
          <p class="promo-desc">${escapeHtml(item.description)}</p>
          <div class="price-row">
            <span class="price-current">${formatCurrency(item.price)}</span>
            ${item.oldPrice ? `<span class="price-old">${formatCurrency(item.oldPrice)}</span>` : ''}
          </div>
          <button
            type="button"
            class="btn btn-primary btn-block"
            data-add-id="${escapeHtml(item.id)}"
            data-promo-code="${escapeHtml(item.promoCode)}"
          >
            Chọn Ngay
          </button>
        </div>
      </article>
    `)
    .join('');

  attachImageFallbacks(dom.promoGrid);
}

function renderCategoryTabs() {
  const categories = ['Tất cả', ...new Set(state.items.map((item) => item.category))];

  dom.categoryTabs.innerHTML = categories
    .map((category) => {
      const isActive = category === state.activeCategory;
      return `
        <button
          type="button"
          class="tab-btn ${isActive ? 'is-active' : ''}"
          data-category="${escapeHtml(category)}"
          aria-pressed="${isActive}"
        >
          ${escapeHtml(category)}
        </button>
      `;
    })
    .join('');
}

function getFilteredAndSortedItems() {
  const normalizedQuery = normalizeVietnamese(state.searchQuery);

  const filtered = state.items.filter((item) => {
    const matchCategory = state.activeCategory === 'Tất cả' || item.category === state.activeCategory;
    if (!matchCategory) return false;
    if (!normalizedQuery) return true;

    const searchable = normalizeVietnamese(`${item.name} ${item.category} ${item.description} ${item.badge}`);
    return searchable.includes(normalizedQuery);
  });

  const sorted = [...filtered];
  if (state.sortBy === 'price-asc') {
    sorted.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    sorted.sort((a, b) => b.price - a.price);
  } else if (state.sortBy === 'rating-desc') {
    sorted.sort((a, b) => b.rating - a.rating);
  }

  return sorted;
}

function renderMenuGrid() {
  const items = getFilteredAndSortedItems();

  if (items.length === 0) {
    dom.menuGrid.innerHTML = `
      <div class="empty-state">
        <h3>Không tìm thấy món phù hợp 🍗</h3>
        <p>Hãy thử từ khóa khác hoặc chọn danh mục "Tất cả" để xem toàn bộ thực đơn.</p>
      </div>
    `;
    return;
  }

  dom.menuGrid.innerHTML = items
    .map((item) => `
      <article class="menu-card">
        <div class="menu-card-media">
          ${createProductImageMarkup(item)}
          ${item.badge ? `<span class="card-badge">${escapeHtml(item.badge)}</span>` : ''}
          <span class="rating-pill" aria-label="Đánh giá ${item.rating} trên 5 sao">${item.rating.toFixed(1)} ★</span>
        </div>
        <div class="menu-card-body">
          <span class="menu-category-label">${escapeHtml(item.category)}</span>
          <h3 class="menu-card-title">${escapeHtml(item.name)}</h3>
          <p class="menu-card-desc">${escapeHtml(item.description)}</p>
          <div class="menu-card-footer">
            <div class="menu-price-group">
              <span class="menu-price">${formatCurrency(item.price)}</span>
              ${item.oldPrice ? `<span class="menu-old-price">${formatCurrency(item.oldPrice)}</span>` : ''}
            </div>
            <button
              type="button"
              class="btn btn-primary add-btn"
              data-add-id="${escapeHtml(item.id)}"
              aria-label="Thêm ${escapeHtml(item.name)} vào giỏ hàng"
            >
              + Thêm
            </button>
          </div>
        </div>
      </article>
    `)
    .join('');

  attachImageFallbacks(dom.menuGrid);
}

/* ==========================================================================
   QUẢN LÝ GIỎ HÀNG & MÃ KHUYẾN MÃI
   ========================================================================== */

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(state.cart));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage
  }
}

function addToCart(itemId, promoCode = '') {
  const item = state.items.find((entry) => entry.id === String(itemId));
  if (!item) return;

  state.cart[item.id] = (state.cart[item.id] || 0) + 1;

  if (promoCode && PROMO_CODES[promoCode]) {
    state.appliedPromo = promoCode;
    dom.promoInput.value = promoCode;
  }

  saveCartToStorage();
  renderCart();
  showToast(`🍗 Đã thêm "${item.name}" vào giỏ hàng!`);
}

function updateCartQty(itemId, delta) {
  const current = state.cart[itemId] || 0;
  const next = current + delta;

  if (next <= 0) {
    delete state.cart[itemId];
  } else {
    state.cart[itemId] = next;
  }

  saveCartToStorage();
  renderCart();
}

function calculateCartTotals() {
  let subtotal = 0;
  let totalCount = 0;
  const detailedItems = [];

  Object.entries(state.cart).forEach(([id, qty]) => {
    const product = state.items.find((item) => item.id === id);
    if (product && qty > 0) {
      subtotal += product.price * qty;
      totalCount += qty;
      detailedItems.push({ ...product, qty });
    }
  });

  let discount = 0;
  if (state.appliedPromo && PROMO_CODES[state.appliedPromo]) {
    const rule = PROMO_CODES[state.appliedPromo];
    if (subtotal >= rule.minOrder) {
      discount = rule.discount;
    }
  }

  return {
    detailedItems,
    totalCount,
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount)
  };
}

function renderCart() {
  const { detailedItems, totalCount, subtotal, discount, total } = calculateCartTotals();
  dom.cartCount.textContent = String(totalCount);

  if (detailedItems.length === 0) {
    dom.cartItems.innerHTML = `
      <div class="empty-state">
        <p><strong>Giỏ hàng đang trống</strong></p>
        <p>Hãy chọn vài miếng gà giòn nóng hổi từ thực đơn nhé!</p>
      </div>
    `;
  } else {
    dom.cartItems.innerHTML = detailedItems
      .map((item) => `
        <div class="cart-item">
          <div class="cart-item-info">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="cart-item-price">${formatCurrency(item.price * item.qty)}</span>
          </div>
          <div class="qty-controls">
            <button type="button" class="qty-btn" data-qty-id="${escapeHtml(item.id)}" data-delta="-1" aria-label="Giảm số lượng ${escapeHtml(item.name)}">−</button>
            <span aria-label="Số lượng">${item.qty}</span>
            <button type="button" class="qty-btn" data-qty-id="${escapeHtml(item.id)}" data-delta="1" aria-label="Tăng số lượng ${escapeHtml(item.name)}">+</button>
          </div>
        </div>
      `)
      .join('');
  }

  dom.cartSubtotal.textContent = formatCurrency(subtotal);
  if (discount > 0) {
    dom.discountRow.hidden = false;
    dom.cartDiscount.textContent = `-${formatCurrency(discount)}`;
    dom.promoFeedback.textContent = `Đã áp dụng mã ${state.appliedPromo}: -${formatCurrency(discount)}`;
  } else {
    dom.discountRow.hidden = true;
    if (state.appliedPromo && PROMO_CODES[state.appliedPromo]) {
      const needed = PROMO_CODES[state.appliedPromo].minOrder - subtotal;
      if (needed > 0 && subtotal > 0) {
        dom.promoFeedback.textContent = `Mua thêm ${formatCurrency(needed)} để kích hoạt mã ${state.appliedPromo}.`;
      } else {
        dom.promoFeedback.textContent = '';
      }
    }
  }
  dom.cartTotal.textContent = formatCurrency(total);
}

function openCartDrawer() {
  dom.cartBackdrop.hidden = false;
  dom.cartDrawer.hidden = false;
  dom.cartCloseBtn.focus();
}

function closeCartDrawer() {
  dom.cartDrawer.hidden = true;
  dom.cartBackdrop.hidden = true;
  dom.cartOpenBtn.focus();
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, 2600);
}

/* ==========================================================================
   SỰ KIỆN TƯƠNG TÁC
   ========================================================================== */

function bindEvents() {
  dom.categoryTabs.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-category]');
    if (!btn) return;
    state.activeCategory = btn.dataset.category;
    renderCategoryTabs();
    renderMenuGrid();
  });

  dom.searchInput.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderMenuGrid();
  });

  dom.sortSelect.addEventListener('change', (event) => {
    state.sortBy = event.target.value;
    renderMenuGrid();
  });

  dom.csvFileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (window.Papa) {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          applyMenuData(results.data, `Đã nạp ${results.data.length} món từ file "${file.name}" bằng PapaParse.js.`);
          showToast(`📂 Đã cập nhật thực đơn từ ${file.name}`);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const rows = basicParseCSV(String(reader.result || ''));
        applyMenuData(rows, `Đã nạp ${rows.length} món từ file "${file.name}".`);
        showToast(`📂 Đã cập nhật thực đơn từ ${file.name}`);
      };
      reader.readAsText(file, 'UTF-8');
    }
  });

  document.addEventListener('click', (event) => {
    const addBtn = event.target.closest('button[data-add-id]');
    if (addBtn) {
      addToCart(addBtn.dataset.addId, addBtn.dataset.promoCode || '');
      return;
    }

    const qtyBtn = event.target.closest('button[data-qty-id]');
    if (qtyBtn) {
      updateCartQty(qtyBtn.dataset.qtyId, Number(qtyBtn.dataset.delta));
    }
  });

  dom.cartOpenBtn.addEventListener('click', openCartDrawer);
  dom.cartCloseBtn.addEventListener('click', closeCartDrawer);
  dom.cartBackdrop.addEventListener('click', closeCartDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.cartDrawer.hidden) {
      closeCartDrawer();
    }
  });

  dom.applyPromoBtn.addEventListener('click', () => {
    const code = dom.promoInput.value.trim().toUpperCase();
    if (!code) {
      state.appliedPromo = null;
      dom.promoFeedback.textContent = 'Vui lòng nhập mã ưu đãi (gợi ý: FAMILY56, COMBO95, ZINGER15, GION10).';
      renderCart();
      return;
    }

    if (!PROMO_CODES[code]) {
      dom.promoFeedback.textContent = 'Mã ưu đãi chưa chính xác. Thử ngay: FAMILY56, COMBO95, ZINGER15, GION10.';
      return;
    }

    state.appliedPromo = code;
    dom.promoFeedback.textContent = PROMO_CODES[code].label;
    renderCart();
  });

  dom.checkoutBtn.addEventListener('click', () => {
    const { totalCount, total } = calculateCartTotals();
    if (totalCount === 0) {
      showToast('Giỏ hàng đang trống, hãy chọn món trước nhé!');
      return;
    }

    state.cart = {};
    state.appliedPromo = null;
    dom.promoInput.value = '';
    dom.promoFeedback.textContent = '';
    saveCartToStorage();
    renderCart();
    closeCartDrawer();
    showToast(`🎉 Đặt thành công ${totalCount} món (${formatCurrency(total)})! Gà nóng đang chuẩn bị giao.`);
  });

  dom.mobileMenuBtn.addEventListener('click', () => {
    const expanded = dom.mobileMenuBtn.getAttribute('aria-expanded') === 'true';
    dom.mobileMenuBtn.setAttribute('aria-expanded', String(!expanded));
    dom.mobileNav.hidden = expanded;
  });

  dom.mobileNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
      dom.mobileNav.hidden = true;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadMenuFromCSV();
});
