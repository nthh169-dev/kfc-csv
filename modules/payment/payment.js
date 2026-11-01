/**
 * MODULE 2: THANH TOÁN (PAYMENT & CHECKOUT MODULE)
 * Ứng dụng: KFC Landing Page (Static & Serverless)
 * Hỗ trợ 4 phương thức: Tiền mặt (COD), Mã QR MoMo, Mã QR ZaloPay, Thẻ ATM nội địa.
 * Thiết kế theo chuẩn DESIGN.md & kiến trúc CSV trong Readme.md.
 */

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.KFCPaymentModule = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  /* ==========================================================================
     1. HẰNG SỐ CẤU HÌNH NGHIỆP VỤ
     ========================================================================== */

  const ORDERS_STORAGE_KEY = 'kfc_csv_orders_v1';
  const CART_STORAGE_KEY_DEFAULT = 'kfc_csv_cart_v1';
  const FREE_SHIPPING_THRESHOLD = 150000; // Miễn phí giao hàng cho đơn từ 150.000đ
  const STANDARD_SHIPPING_FEE = 15000;    // Phí giao tiêu chuẩn 15.000đ

  const DEFAULT_PROMO_RULES = {
    FAMILY56: { discount: 30000, minOrder: 200000, label: 'Giảm thêm 30.000đ cho đơn từ 200K' },
    COMBO95: { discount: 15000, minOrder: 95000, label: 'Giảm thêm 15.000đ cho đơn từ 95K' },
    ZINGER15: { discount: 15000, minOrder: 90000, label: 'Giảm thêm 15.000đ cho đơn từ 90K' },
    GION10: { discount: 10000, minOrder: 60000, label: 'Giảm thêm 10.000đ cho đơn từ 60K' }
  };

  const PICKUP_STORES = [
    { id: 'hcm-q1', name: 'KFC Đại Lộ Ẩm Thực - 123 Quận 1, TP.HCM' },
    { id: 'hcm-q3', name: 'KFC Lê Văn Sỹ - 245 Quận 3, TP.HCM' },
    { id: 'hn-cg', name: 'KFC Xuân Thủy - 88 Cầu Giấy, Hà Nội' }
  ];

  const ATM_BANKS = [
    { id: 'VCB', name: 'Vietcombank - Ngân hàng Ngoại thương VN' },
    { id: 'CTG', name: 'VietinBank - Ngân hàng Công thương VN' },
    { id: 'BIDV', name: 'BIDV - Ngân hàng Đầu tư & Phát triển VN' },
    { id: 'TCB', name: 'Techcombank - Ngân hàng Kỹ thương VN' },
    { id: 'MB', name: 'MB Bank - Ngân hàng Quân đội' },
    { id: 'ACB', name: 'ACB - Ngân hàng Á Châu' },
    { id: 'AGR', name: 'Agribank - NH Nông nghiệp & PTNT' },
    { id: 'STB', name: 'Sacombank - Ngân hàng Sài Gòn Thương Tín' },
    { id: 'VPB', name: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng' },
    { id: 'TPB', name: 'TPBank - Ngân hàng Tiên Phong' }
  ];

  // 4 Phương thức thanh toán chính thức theo yêu cầu
  const PAYMENT_METHODS = {
    cod: {
      id: 'cod',
      label: '💵 Tiền mặt',
      sub: 'Thanh toán tiền mặt khi nhận món'
    },
    qr_momo: {
      id: 'qr_momo',
      label: '📱 Mã QR MoMo',
      sub: 'Quét mã QR bằng ứng dụng Ví MoMo'
    },
    qr_zalopay: {
      id: 'qr_zalopay',
      label: '💙 Mã QR ZaloPay',
      sub: 'Quét mã QR bằng ZaloPay hoặc Zalo'
    },
    atm: {
      id: 'atm',
      label: '💳 Thẻ ATM',
      sub: 'Thẻ ATM nội địa các ngân hàng VN'
    }
  };

  /* ==========================================================================
     2. HÀM TIỆN ÍCH & KIỂM TRA HỢP LỆ (PURE FUNCTIONS)
     ========================================================================== */

  function formatVnd(amount) {
    if (typeof root.formatCurrency === 'function') {
      return root.formatCurrency(amount);
    }
    return Number(amount || 0).toLocaleString('vi-VN') + 'đ';
  }

  function safeEscapeHtml(str) {
    const text = String(str ?? '');
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Chuẩn hóa số điện thoại Việt Nam:
   * Chuyển +84xxxxxxxxx -> 0xxxxxxxxx, loại bỏ khoảng trắng, dấu chấm, gạch ngang.
   */
  function normalizeVietnamPhone(rawPhone) {
    let cleaned = String(rawPhone ?? '').trim().replace(/[\s.\-()]/g, '');
    if (cleaned.startsWith('+84')) {
      cleaned = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('84') && cleaned.length === 11) {
      cleaned = '0' + cleaned.slice(2);
    }
    return cleaned;
  }

  function isValidVietnamPhone(rawPhone) {
    const normalized = normalizeVietnamPhone(rawPhone);
    return /^0[35789]\d{8}$/.test(normalized);
  }

  /**
   * Kiểm tra thuật toán Luhn cho số thẻ chuẩn (13 - 19 chữ số)
   */
  function isValidLuhn(rawCardNumber) {
    const digits = String(rawCardNumber ?? '').replace(/[\s-]/g, '');
    if (!/^\d{13,19}$/.test(digits)) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = Number(digits[i]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * Kiểm tra số thẻ ATM nội địa Việt Nam:
   * Chấp nhận đầu số Napas 9704 (16-19 chữ số, không lặp vô nghĩa) hoặc thẻ thỏa thuật toán Luhn (16-19 chữ số).
   */
  function isValidAtmCardNumber(rawCardNumber) {
    const digits = String(rawCardNumber ?? '').replace(/[\s-]/g, '');
    if (!/^\d{16,19}$/.test(digits)) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    if (digits.startsWith('9704')) {
      const tail = digits.slice(4);
      if (/^(\d)\1+$/.test(tail)) return false;
      return true;
    }

    return isValidLuhn(digits);
  }

  /**
   * Kiểm tra hạn thẻ / hiệu lực thẻ MM/YY so với thời điểm tham chiếu
   */
  function isValidCardExpiry(rawExpiry, referenceDate = new Date()) {
    const cleaned = String(rawExpiry ?? '').trim();
    const match = /^(\d{2})\/(\d{2})$/.exec(cleaned);
    if (!match) return false;

    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return false;

    const currentYear = referenceDate.getFullYear();
    const currentMonth = referenceDate.getMonth() + 1;

    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;
    if (year > currentYear + 20) return false;

    return true;
  }

  /**
   * Tính toán tổng quan tài chính đơn hàng (đồng bộ từ dữ liệu Giỏ Hàng)
   */
  function computeOrderSummary(cartSnapshot, options = {}) {
    const fulfillmentMode = options.fulfillmentMode === 'pickup' ? 'pickup' : 'delivery';
    const promoRules = options.promoRules || DEFAULT_PROMO_RULES;
    const rawPromo = String(options.promoCode ?? '').trim().toUpperCase();

    const items = Array.isArray(cartSnapshot?.detailedItems)
      ? cartSnapshot.detailedItems.filter((item) => item && Number(item.qty) > 0 && Number(item.price) >= 0)
      : [];

    const subtotal = items.reduce((acc, item) => acc + Number(item.price) * Number(item.qty), 0);
    const totalCount = items.reduce((acc, item) => acc + Number(item.qty), 0);

    if (items.length === 0 || totalCount <= 0 || subtotal <= 0) {
      return {
        isEmpty: true,
        detailedItems: [],
        totalCount: 0,
        subtotal: 0,
        promoCode: rawPromo || null,
        promoValid: false,
        promoMessage: '',
        discount: 0,
        shippingFee: 0,
        amountToFreeShip: FREE_SHIPPING_THRESHOLD,
        grandTotal: 0
      };
    }

    let discount = 0;
    let promoValid = false;
    let promoMessage = '';

    if (rawPromo) {
      const rule = promoRules[rawPromo];
      if (!rule) {
        promoMessage = `Mã "${rawPromo}" không tồn tại.`;
      } else if (subtotal < rule.minOrder) {
        const diff = rule.minOrder - subtotal;
        promoMessage = `Mua thêm ${formatVnd(diff)} để áp dụng mã ${rawPromo}.`;
      } else {
        discount = Math.min(subtotal, Number(rule.discount) || 0);
        promoValid = true;
        promoMessage = `Đã áp dụng mã ${rawPromo}: -${formatVnd(discount)}`;
      }
    }

    let shippingFee = 0;
    let amountToFreeShip = 0;

    if (fulfillmentMode === 'delivery') {
      if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        shippingFee = 0;
        amountToFreeShip = 0;
      } else {
        shippingFee = STANDARD_SHIPPING_FEE;
        amountToFreeShip = FREE_SHIPPING_THRESHOLD - subtotal;
      }
    }

    const netAfterDiscount = Math.max(0, subtotal - discount);
    const grandTotal = netAfterDiscount + shippingFee;

    return {
      isEmpty: false,
      detailedItems: items.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        category: String(item.category || ''),
        price: Number(item.price),
        qty: Number(item.qty),
        lineTotal: Number(item.price) * Number(item.qty)
      })),
      totalCount,
      subtotal,
      promoCode: rawPromo || null,
      promoValid,
      promoMessage,
      discount,
      shippingFee,
      amountToFreeShip,
      grandTotal
    };
  }

  /**
   * Kiểm tra toàn diện dữ liệu biểu mẫu Thanh Toán cho 4 phương thức:
   * cod (Tiền mặt), qr_momo (Mã QR MoMo), qr_zalopay (Mã QR ZaloPay), atm (Thẻ ATM)
   */
  function validateCheckoutPayload(payload = {}, options = {}) {
    const errors = {};
    const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
    const grandTotal = Number(options.grandTotal ?? payload.grandTotal ?? 0);

    // 1. Kiểm tra Họ tên
    const fullName = String(payload.fullName ?? '').trim().replace(/\s+/g, ' ');
    if (!fullName) {
      errors.fullName = 'Vui lòng nhập họ và tên người nhận.';
    } else if (fullName.length < 2) {
      errors.fullName = 'Họ và tên phải có ít nhất 2 ký tự.';
    } else if (fullName.length > 80) {
      errors.fullName = 'Họ và tên không vượt quá 80 ký tự.';
    } else if (!/^[\p{L}\s.'-]+$/u.test(fullName)) {
      errors.fullName = 'Họ và tên chỉ được chứa chữ cái và khoảng trắng hợp lệ.';
    }

    // 2. Kiểm tra Số điện thoại
    const rawPhone = String(payload.phone ?? '').trim();
    const normalizedPhone = normalizeVietnamPhone(rawPhone);
    if (!rawPhone) {
      errors.phone = 'Vui lòng nhập số điện thoại liên hệ.';
    } else if (!isValidVietnamPhone(rawPhone)) {
      errors.phone = 'Số điện thoại không hợp lệ (gồm 10 số di động VN, VD: 0901234567).';
    }

    // 3. Hình thức nhận hàng & Địa chỉ / Cửa hàng
    const fulfillmentMode = payload.fulfillmentMode;
    if (fulfillmentMode !== 'delivery' && fulfillmentMode !== 'pickup') {
      errors.fulfillmentMode = 'Vui lòng chọn hình thức nhận hàng hợp lệ.';
    } else if (fulfillmentMode === 'delivery') {
      const address = String(payload.address ?? '').trim().replace(/\s+/g, ' ');
      if (!address) {
        errors.address = 'Vui lòng nhập địa chỉ giao hàng.';
      } else if (address.length < 10) {
        errors.address = 'Địa chỉ cần chi tiết hơn (tối thiểu 10 ký tự, gồm số nhà và tên đường).';
      } else if (address.length > 200) {
        errors.address = 'Địa chỉ không vượt quá 200 ký tự.';
      } else if (/[<>]/.test(address)) {
        errors.address = 'Địa chỉ chứa ký tự không hợp lệ.';
      }
    } else if (fulfillmentMode === 'pickup') {
      const storeId = String(payload.pickupStore ?? '').trim();
      const exists = PICKUP_STORES.some((s) => s.id === storeId);
      if (!storeId || !exists) {
        errors.pickupStore = 'Vui lòng chọn cửa hàng đến nhận món.';
      }
    }

    // 4. Ghi chú đơn hàng
    const note = String(payload.note ?? '').trim();
    if (note.length > 200) {
      errors.note = 'Ghi chú tối đa 200 ký tự.';
    } else if (/[<>]/.test(note)) {
      errors.note = 'Ghi chú không được chứa thẻ HTML.';
    }

    // 5. Phương thức thanh toán (cod | qr_momo | qr_zalopay | atm)
    const paymentMethod = String(payload.paymentMethod ?? '');
    let selectedBankObj = null;

    if (!PAYMENT_METHODS[paymentMethod]) {
      errors.paymentMethod = 'Vui lòng chọn phương thức thanh toán hợp lệ (Tiền mặt, Mã QR MoMo, Mã QR ZaloPay hoặc Thẻ ATM).';
    } else if (paymentMethod === 'cod') {
      const rawCash = String(payload.cashGiven ?? '').trim();
      if (rawCash !== '') {
        const cashVal = Number(rawCash);
        if (!Number.isFinite(cashVal) || cashVal < 0) {
          errors.cashGiven = 'Số tiền mặt không hợp lệ.';
        } else if (grandTotal > 0 && cashVal < grandTotal) {
          errors.cashGiven = `Số tiền khách đưa cần tối thiểu ${formatVnd(grandTotal)}.`;
        }
      }
    } else if (paymentMethod === 'atm') {
      const bankId = String(payload.atmBank ?? '').trim().toUpperCase();
      selectedBankObj = ATM_BANKS.find((b) => b.id === bankId) || null;
      if (!bankId || !selectedBankObj) {
        errors.atmBank = 'Vui lòng chọn ngân hàng phát hành thẻ ATM.';
      }

      const cardHolder = String(payload.cardHolder ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
      const rawCardNumber = String(payload.cardNumber ?? '').replace(/[\s-]/g, '');
      const cardExpiry = String(payload.cardExpiry ?? '').trim();

      if (!cardHolder) {
        errors.cardHolder = 'Vui lòng nhập tên chủ thẻ ATM.';
      } else if (!/^[A-Z]{1,30}(?:\s+[A-Z]{1,30})+$/.test(cardHolder) || cardHolder.length < 4 || cardHolder.length > 50) {
        errors.cardHolder = 'Tên chủ thẻ viết IN HOA không dấu (gồm họ và tên, VD: NGUYEN VAN AN).';
      }

      if (!rawCardNumber) {
        errors.cardNumber = 'Vui lòng nhập số thẻ ATM (16–19 chữ số).';
      } else if (!isValidAtmCardNumber(rawCardNumber)) {
        errors.cardNumber = 'Số thẻ ATM không hợp lệ (gồm 16–19 chữ số Napas 9704... hoặc chuẩn Luhn).';
      }

      if (!cardExpiry) {
        errors.cardExpiry = 'Vui lòng nhập hạn hiệu lực thẻ MM/YY.';
      } else if (!isValidCardExpiry(cardExpiry, referenceDate)) {
        errors.cardExpiry = 'Hạn thẻ không hợp lệ hoặc thẻ đã hết hạn.';
      }
    }

    const isValid = Object.keys(errors).length === 0;
    const pickupStoreObj = PICKUP_STORES.find((s) => s.id === payload.pickupStore);

    return {
      isValid,
      errors,
      sanitized: {
        fullName,
        phone: normalizedPhone,
        fulfillmentMode: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
        address: fulfillmentMode === 'delivery' ? String(payload.address ?? '').trim().replace(/\s+/g, ' ') : '',
        pickupStore: fulfillmentMode === 'pickup' && pickupStoreObj ? pickupStoreObj.name : '',
        pickupStoreId: fulfillmentMode === 'pickup' && pickupStoreObj ? pickupStoreObj.id : '',
        note,
        paymentMethod,
        cashGiven:
          paymentMethod === 'cod' && String(payload.cashGiven ?? '').trim() !== ''
            ? Number(payload.cashGiven)
            : null,
        atmBankId: paymentMethod === 'atm' && selectedBankObj ? selectedBankObj.id : null,
        atmBankName: paymentMethod === 'atm' && selectedBankObj ? selectedBankObj.name : null,
        cardLast4:
          paymentMethod === 'atm'
            ? String(payload.cardNumber ?? '').replace(/[\s-]/g, '').slice(-4)
            : null,
        cardHolder:
          paymentMethod === 'atm'
            ? String(payload.cardHolder ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
            : null
      }
    };
  }

  /**
   * Sinh mã đơn hàng duy nhất theo ngày: KFC-YYYYMMDD-XXXX
   */
  function generateOrderId(date = new Date(), randomFn = Math.random) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const suffix = Math.floor(1000 + randomFn() * 9000);
    return `KFC-${yyyy}${mm}${dd}-${suffix}`;
  }

  /**
   * Chống CSV Formula Injection (=, +, -, @, tab, CR) và escape chuẩn RFC-4180
   */
  function escapeCsvCell(value) {
    let str = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Xuất hóa đơn đơn hàng ra chuỗi CSV chuẩn UTF-8 BOM (mở trực tiếp bằng Excel)
   */
  function generateOrderCsv(order) {
    if (!order || !Array.isArray(order.items)) {
      throw new Error('Dữ liệu đơn hàng không hợp lệ để xuất CSV.');
    }

    const lines = [];
    lines.push(['order_id', 'created_at', 'customer_name', 'phone', 'fulfillment', 'destination', 'payment_method', 'item_id', 'item_name', 'qty', 'unit_price', 'line_total', 'discount', 'shipping_fee', 'grand_total'].join(','));

    const destination = order.fulfillmentMode === 'pickup' ? order.pickupStore : order.address;
    order.items.forEach((item, index) => {
      const row = [
        order.orderId,
        order.createdAt,
        order.customer.fullName,
        order.customer.phone,
        order.fulfillmentMode,
        destination,
        order.paymentMethodLabel,
        item.id,
        item.name,
        item.qty,
        item.price,
        item.lineTotal,
        index === 0 ? order.pricing.discount : 0,
        index === 0 ? order.pricing.shippingFee : 0,
        index === 0 ? order.pricing.grandTotal : ''
      ];
      lines.push(row.map(escapeCsvCell).join(','));
    });

    return '\uFEFF' + lines.join('\r\n');
  }

  /* ==========================================================================
     3. BỘ XỬ LÝ ĐẶT HÀNG & ADAPTER GIỎ HÀNG (STATEFUL SERVICE)
     ========================================================================== */

  function createPaymentService(deps = {}) {
    let isSubmitting = false;

    const getStorage = () => deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

    function getPromoRules() {
      if (deps.promoRules) return deps.promoRules;
      try {
        if (typeof PROMO_CODES !== 'undefined' && PROMO_CODES) return PROMO_CODES;
      } catch {
        // Bỏ qua nếu không tồn tại trong scope
      }
      return DEFAULT_PROMO_RULES;
    }

    function getCartSnapshot() {
      if (typeof deps.getCartSnapshot === 'function') {
        return deps.getCartSnapshot();
      }
      if (typeof root.calculateCartTotals === 'function') {
        const totals = root.calculateCartTotals();
        let activePromo = '';
        try {
          if (typeof state !== 'undefined' && state && state.appliedPromo) {
            activePromo = state.appliedPromo;
          }
        } catch {
          activePromo = '';
        }
        return {
          detailedItems: totals.detailedItems || [],
          totalCount: totals.totalCount || 0,
          subtotal: totals.subtotal || 0,
          appliedPromo: activePromo
        };
      }
      return { detailedItems: [], totalCount: 0, subtotal: 0, appliedPromo: '' };
    }

    function clearCartAfterCheckout() {
      if (typeof deps.clearCart === 'function') {
        deps.clearCart();
        return;
      }
      try {
        if (typeof state !== 'undefined' && state) {
          state.cart = {};
          state.appliedPromo = null;
        }
        if (typeof dom !== 'undefined' && dom) {
          if (dom.promoInput) dom.promoInput.value = '';
          if (dom.promoFeedback) dom.promoFeedback.textContent = '';
        }
      } catch {
        // Bỏ qua nếu chạy độc lập
      }

      const storage = getStorage();
      if (storage) {
        try {
          storage.setItem(CART_STORAGE_KEY_DEFAULT, JSON.stringify({}));
        } catch {
          // Bỏ qua lỗi quota
        }
      }

      if (typeof root.saveCartToStorage === 'function') root.saveCartToStorage();
      if (typeof root.renderCart === 'function') root.renderCart();
    }

    function loadOrderHistory() {
      const storage = getStorage();
      if (!storage) return [];
      try {
        const raw = storage.getItem(ORDERS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function saveOrderRecord(order) {
      const storage = getStorage();
      if (!storage) return;
      try {
        const history = loadOrderHistory();
        const updated = [order, ...history].slice(0, 50);
        storage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Không làm gãy luồng đặt hàng nếu trình duyệt chặn localStorage
      }
    }

    function submitOrder(formPayload, options = {}) {
      if (isSubmitting) {
        return {
          ok: false,
          code: 'DUPLICATE_SUBMISSION',
          message: 'Đơn hàng đang được xử lý, vui lòng không bấm lặp lại.'
        };
      }

      isSubmitting = true;
      try {
        const snapshot = getCartSnapshot();
        const promoCode =
          options.promoCode !== undefined
            ? options.promoCode
            : (formPayload.promoCode ?? snapshot.appliedPromo ?? '');

        const summary = computeOrderSummary(snapshot, {
          fulfillmentMode: formPayload.fulfillmentMode,
          promoCode,
          promoRules: getPromoRules()
        });

        if (summary.isEmpty) {
          return {
            ok: false,
            code: 'EMPTY_CART',
            message: 'Giỏ hàng đang trống. Vui lòng chọn món trước khi thanh toán.'
          };
        }

        const now = options.now instanceof Date ? options.now : new Date();
        const validation = validateCheckoutPayload(formPayload, {
          referenceDate: now,
          grandTotal: summary.grandTotal
        });

        if (!validation.isValid) {
          return {
            ok: false,
            code: 'VALIDATION_ERROR',
            message: 'Vui lòng kiểm tra lại các thông tin được đánh dấu đỏ.',
            errors: validation.errors
          };
        }

        const clean = validation.sanitized;
        const orderId = generateOrderId(now, deps.randomFn || Math.random);
        const methodInfo = PAYMENT_METHODS[clean.paymentMethod];

        const orderRecord = {
          orderId,
          createdAt: now.toISOString(),
          estimatedMinutes: clean.fulfillmentMode === 'pickup' ? 15 : 25,
          fulfillmentMode: clean.fulfillmentMode,
          address: clean.address,
          pickupStore: clean.pickupStore,
          note: clean.note,
          paymentMethod: clean.paymentMethod,
          paymentMethodLabel: methodInfo.label.replace(/^[^\p{L}\d]+\s*/u, ''),
          paymentMeta: {
            cashGiven: clean.cashGiven,
            changeDue: clean.cashGiven !== null ? Math.max(0, clean.cashGiven - summary.grandTotal) : null,
            atmBankId: clean.atmBankId,
            atmBankName: clean.atmBankName,
            cardLast4: clean.cardLast4,
            cardHolder: clean.cardHolder,
            qrTransferNote:
              clean.paymentMethod === 'qr_momo'
                ? `MOMO ${orderId}`
                : clean.paymentMethod === 'qr_zalopay'
                  ? `ZLP ${orderId}`
                  : null
          },
          customer: {
            fullName: clean.fullName,
            phone: clean.phone
          },
          items: summary.detailedItems,
          pricing: {
            subtotal: summary.subtotal,
            promoCode: summary.promoValid ? summary.promoCode : null,
            discount: summary.discount,
            shippingFee: summary.shippingFee,
            grandTotal: summary.grandTotal
          }
        };

        saveOrderRecord(orderRecord);
        clearCartAfterCheckout();

        return {
          ok: true,
          code: 'ORDER_CREATED',
          order: orderRecord
        };
      } finally {
        isSubmitting = false;
      }
    }

    function _setSubmittingLockForTest(locked) {
      isSubmitting = Boolean(locked);
    }

    return {
      getPromoRules,
      getCartSnapshot,
      loadOrderHistory,
      submitOrder,
      _setSubmittingLockForTest
    };
  }

  /* ==========================================================================
     4. GIAO DIỆN MODAL THANH TOÁN (DOM CONTROLLER TRÊN TRÌNH DUYỆT)
     ========================================================================== */

  function createQrSvgMarkup(provider) {
    const isMomo = provider === 'momo';
    const accent = isMomo ? '#A50064' : '#0052CC';
    const badgeLabel = isMomo ? 'MoMo' : 'ZLP';
    const ariaLabel = isMomo ? 'Mã QR Ví MoMo minh họa' : 'Mã QR ZaloPay minh họa';

    // Minh họa QR hình học tự vẽ < 1.5 KB theo đúng quy tắc SVG nhẹ của DESIGN.md
    return `
      <svg viewBox="0 0 100 100" width="96" height="96" fill="none" aria-label="${ariaLabel}">
        <rect width="100" height="100" rx="6" fill="#FFFFFF"/>
        <rect x="6" y="6" width="26" height="26" rx="4" stroke="${accent}" stroke-width="5"/>
        <rect x="14" y="14" width="10" height="10" fill="${accent}"/>
        <rect x="68" y="6" width="26" height="26" rx="4" stroke="${accent}" stroke-width="5"/>
        <rect x="76" y="14" width="10" height="10" fill="#1F1A17"/>
        <rect x="6" y="68" width="26" height="26" rx="4" stroke="${accent}" stroke-width="5"/>
        <rect x="14" y="76" width="10" height="10" fill="#1F1A17"/>
        <rect x="40" y="8" width="8" height="8" fill="#1F1A17"/>
        <rect x="52" y="12" width="8" height="14" fill="#1F1A17"/>
        <rect x="8" y="40" width="16" height="8" fill="#1F1A17"/>
        <rect x="74" y="40" width="18" height="8" fill="#1F1A17"/>
        <rect x="40" y="74" width="8" height="18" fill="#1F1A17"/>
        <rect x="54" y="68" width="14" height="10" fill="${accent}"/>
        <rect x="74" y="68" width="18" height="10" fill="#1F1A17"/>
        <rect x="56" y="84" width="36" height="8" fill="#1F1A17"/>
        <rect x="30" y="36" width="40" height="26" rx="6" fill="${accent}"/>
        <text x="50" y="53" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#FFFFFF">${badgeLabel}</text>
      </svg>
    `;
  }

  function mountPaymentModalUI(doc = root.document, service = createPaymentService()) {
    if (!doc || !doc.body) return null;

    const existingModal = doc.getElementById('payment-modal');
    if (existingModal) {
      return existingModal._controller;
    }

    const uiState = {
      fulfillmentMode: 'delivery',
      paymentMethod: 'cod',
      promoCode: '',
      lastOrder: null,
      draftRefCode: generateOrderId()
    };

    const backdrop = doc.createElement('div');
    backdrop.className = 'payment-backdrop';
    backdrop.id = 'payment-backdrop';
    backdrop.hidden = true;

    const modal = doc.createElement('div');
    modal.className = 'payment-modal';
    modal.id = 'payment-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'payment-modal-title');
    modal.hidden = true;

    modal.innerHTML = `
      <div class="payment-dialog">
        <div class="payment-header">
          <div class="payment-header-left">
            <span class="payment-step-badge" id="payment-step-badge">Bước 2/2</span>
            <h2 class="payment-title" id="payment-modal-title">Thanh Toán Đơn Hàng</h2>
          </div>
          <button type="button" class="icon-close-btn" id="payment-close-btn" aria-label="Đóng cửa sổ thanh toán">✕</button>
        </div>

        <div class="payment-body" id="payment-body-checkout">
          <div class="payment-form-alert" id="payment-global-alert" role="alert" hidden></div>

          <form id="payment-checkout-form" novalidate>
            <div class="payment-layout">
              <!-- CỘT TRÁI: THÔNG TIN NHẬN HÀNG & 4 PHƯƠNG THỨC THANH TOÁN -->
              <div class="payment-left-col">
                <!-- Khối 1: Hình thức nhận món -->
                <div class="payment-section-block">
                  <h3 class="payment-block-heading">1. Hình thức nhận món</h3>
                  <div class="fulfillment-switch" role="radiogroup" aria-label="Chọn hình thức nhận món">
                    <label class="choice-card is-selected" data-fulfillment-card="delivery">
                      <input type="radio" name="fulfillmentMode" value="delivery" checked>
                      <span class="choice-card-content">
                        <span class="choice-card-title">🛵 Giao tận nơi (25p)</span>
                        <span class="choice-card-sub">Miễn phí đơn từ 150.000đ</span>
                      </span>
                    </label>
                    <label class="choice-card" data-fulfillment-card="pickup">
                      <input type="radio" name="fulfillmentMode" value="pickup">
                      <span class="choice-card-content">
                        <span class="choice-card-title">🏪 Tự đến lấy (15p)</span>
                        <span class="choice-card-sub">Miễn phí 0đ tại quầy</span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- Khối 2: Thông tin người nhận -->
                <div class="payment-section-block">
                  <h3 class="payment-block-heading">2. Thông tin người nhận</h3>
                  <div class="form-grid form-grid-2">
                    <div class="form-field">
                      <label class="form-label" for="pay-fullname">Họ và tên <span class="required-mark">*</span></label>
                      <input type="text" id="pay-fullname" name="fullName" class="form-control" placeholder="VD: Nguyễn Văn An" autocomplete="name" aria-describedby="err-fullName">
                      <span class="field-error" id="err-fullName" role="alert"></span>
                    </div>

                    <div class="form-field">
                      <label class="form-label" for="pay-phone">Số điện thoại <span class="required-mark">*</span></label>
                      <input type="tel" id="pay-phone" name="phone" class="form-control" placeholder="VD: 0901234567" autocomplete="tel" aria-describedby="err-phone">
                      <span class="field-error" id="err-phone" role="alert"></span>
                    </div>
                  </div>

                  <div class="form-field" id="pay-address-group" style="margin-top: 16px;">
                    <label class="form-label" for="pay-address">Địa chỉ giao hàng chi tiết <span class="required-mark">*</span></label>
                    <input type="text" id="pay-address" name="address" class="form-control" placeholder="Số nhà, tên đường, phường/xã, quận/huyện..." autocomplete="street-address" aria-describedby="err-address">
                    <span class="field-error" id="err-address" role="alert"></span>
                  </div>

                  <div class="form-field" id="pay-pickup-group" style="margin-top: 16px;" hidden>
                    <label class="form-label" for="pay-pickup-store">Chọn cửa hàng nhận món <span class="required-mark">*</span></label>
                    <select id="pay-pickup-store" name="pickupStore" class="form-control" aria-describedby="err-pickupStore">
                      ${PICKUP_STORES.map((s) => `<option value="${safeEscapeHtml(s.id)}">${safeEscapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <span class="field-error" id="err-pickupStore" role="alert"></span>
                  </div>

                  <div class="form-field" style="margin-top: 16px;">
                    <label class="form-label" for="pay-note">Ghi chú cho bếp / tài xế (tùy chọn)</label>
                    <textarea id="pay-note" name="note" class="form-control" rows="2" maxlength="200" placeholder="VD: Thêm tương ớt, gọi điện khi tới sảnh..." aria-describedby="err-note"></textarea>
                    <span class="field-error" id="err-note" role="alert"></span>
                  </div>
                </div>

                <!-- Khối 3: 4 Phương thức thanh toán (Tiền mặt, Mã QR MoMo, Mã QR ZaloPay, Thẻ ATM) -->
                <div class="payment-section-block">
                  <h3 class="payment-block-heading">3. Phương thức thanh toán</h3>
                  <div class="payment-methods-grid" role="radiogroup" aria-label="Chọn phương thức thanh toán">
                    ${Object.values(PAYMENT_METHODS)
                      .map(
                        (m, idx) => `
                      <label class="choice-card ${idx === 0 ? 'is-selected' : ''}" data-method-card="${m.id}">
                        <input type="radio" name="paymentMethod" value="${m.id}" ${idx === 0 ? 'checked' : ''}>
                        <span class="choice-card-content">
                          <span class="choice-card-title">${safeEscapeHtml(m.label)}</span>
                          <span class="choice-card-sub">${safeEscapeHtml(m.sub)}</span>
                        </span>
                      </label>
                    `
                      )
                      .join('')}
                  </div>

                  <!-- Panel 1: Tiền mặt (COD) -->
                  <div class="payment-method-panel" id="panel-method-cod">
                    <div class="form-field">
                      <label class="form-label" for="pay-cash-given">Tiền mặt dự kiến đưa tài xế (tùy chọn)</label>
                      <input type="number" id="pay-cash-given" name="cashGiven" class="form-control" min="0" step="1000" placeholder="Để trống nếu trả đúng số tiền" aria-describedby="err-cashGiven">
                      <div class="cash-quick-chips" aria-label="Chọn nhanh mệnh giá tiền mặt">
                        <button type="button" class="cash-chip-btn" data-cash-preset="exact">Đúng số tiền</button>
                        <button type="button" class="cash-chip-btn" data-cash-preset="100000">100.000đ</button>
                        <button type="button" class="cash-chip-btn" data-cash-preset="200000">200.000đ</button>
                        <button type="button" class="cash-chip-btn" data-cash-preset="500000">500.000đ</button>
                      </div>
                      <p class="cash-change-preview" id="pay-cash-change" hidden></p>
                      <span class="field-error" id="err-cashGiven" role="alert"></span>
                    </div>
                  </div>

                  <!-- Panel 2: Mã QR MoMo -->
                  <div class="payment-method-panel" id="panel-method-qr-momo" hidden>
                    <div class="qr-preview-box">
                      <div class="qr-svg-wrap is-momo">${createQrSvgMarkup('momo')}</div>
                      <div class="qr-info-list">
                        <span class="qr-brand-pill is-momo">VÍ ĐIỆN TỬ MOMO</span>
                        <span>Đơn vị nhận: <strong>KFC VIỆT NAM OFFICIAL</strong></span>
                        <span>SĐT Ví MoMo: <strong>0901 688 688</strong></span>
                        <span>Số tiền quét: <strong id="qr-momo-amount">0đ</strong></span>
                        <div class="qr-copy-row">
                          <span>Lời nhắn: <code id="qr-momo-ref">MOMO</code></span>
                          <button type="button" class="qr-copy-btn" data-copy-target="qr-momo-ref">Sao chép</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Panel 3: Mã QR ZaloPay -->
                  <div class="payment-method-panel" id="panel-method-qr-zalopay" hidden>
                    <div class="qr-preview-box">
                      <div class="qr-svg-wrap is-zalopay">${createQrSvgMarkup('zalopay')}</div>
                      <div class="qr-info-list">
                        <span class="qr-brand-pill is-zalopay">CỔNG QR ZALOPAY</span>
                        <span>Đơn vị nhận: <strong>ZALOPAY - KFC VIỆT NAM</strong></span>
                        <span>Mã cửa hàng: <strong>ZLP-KFC-6886</strong></span>
                        <span>Số tiền quét: <strong id="qr-zalopay-amount">0đ</strong></span>
                        <div class="qr-copy-row">
                          <span>Nội dung: <code id="qr-zalopay-ref">ZLP</code></span>
                          <button type="button" class="qr-copy-btn" data-copy-target="qr-zalopay-ref">Sao chép</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Panel 4: Thẻ ATM nội địa -->
                  <div class="payment-method-panel" id="panel-method-atm" hidden>
                    <div class="form-grid">
                      <div class="form-field">
                        <label class="form-label" for="pay-atm-bank">Ngân hàng phát hành thẻ ATM <span class="required-mark">*</span></label>
                        <select id="pay-atm-bank" name="atmBank" class="form-control" aria-describedby="err-atmBank">
                          <option value="">-- Chọn ngân hàng nội địa --</option>
                          ${ATM_BANKS.map((b) => `<option value="${safeEscapeHtml(b.id)}">${safeEscapeHtml(b.name)}</option>`).join('')}
                        </select>
                        <span class="field-error" id="err-atmBank" role="alert"></span>
                      </div>

                      <div class="form-field">
                        <label class="form-label" for="pay-card-number">Số thẻ ATM (16–19 chữ số Napas) <span class="required-mark">*</span></label>
                        <input type="text" id="pay-card-number" name="cardNumber" class="form-control" inputmode="numeric" placeholder="VD: 9704 3600 1234 5678" autocomplete="cc-number" aria-describedby="err-cardNumber">
                        <span class="field-error" id="err-cardNumber" role="alert"></span>
                      </div>

                      <div class="form-grid form-grid-2">
                        <div class="form-field">
                          <label class="form-label" for="pay-card-holder">Tên chủ thẻ (IN HOA) <span class="required-mark">*</span></label>
                          <input type="text" id="pay-card-holder" name="cardHolder" class="form-control" placeholder="NGUYEN VAN AN" autocomplete="cc-name" aria-describedby="err-cardHolder">
                          <span class="field-error" id="err-cardHolder" role="alert"></span>
                        </div>

                        <div class="form-field">
                          <label class="form-label" for="pay-card-expiry">Hiệu lực đến (MM/YY) <span class="required-mark">*</span></label>
                          <input type="text" id="pay-card-expiry" name="cardExpiry" class="form-control" placeholder="12/29" maxlength="5" autocomplete="cc-exp" aria-describedby="err-cardExpiry">
                          <span class="field-error" id="err-cardExpiry" role="alert"></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- CỘT PHẢI: TÓM TẮT ĐƠN HÀNG ĐỒNG BỘ TỪ GIỎ HÀNG -->
              <div class="payment-right-col">
                <div class="order-summary-card">
                  <h3 class="payment-block-heading">Tóm tắt đơn hàng (<span id="pay-item-count">0</span> món)</h3>

                  <div class="free-ship-banner" id="pay-freeship-banner"></div>

                  <div class="summary-items-list" id="pay-summary-items"></div>

                  <div class="checkout-promo-box">
                    <label for="pay-promo-input" class="sr-only">Mã ưu đãi</label>
                    <input type="text" id="pay-promo-input" class="form-control" placeholder="Mã giảm (VD: FAMILY56)">
                    <button type="button" class="btn btn-secondary" id="pay-apply-promo-btn">Áp mã</button>
                  </div>
                  <p class="checkout-promo-msg" id="pay-promo-msg" aria-live="polite"></p>

                  <div class="checkout-totals">
                    <div class="checkout-total-row">
                      <span>Tạm tính:</span>
                      <span id="pay-subtotal">0đ</span>
                    </div>
                    <div class="checkout-total-row is-discount" id="pay-discount-row" hidden>
                      <span>Giảm giá ưu đãi:</span>
                      <span id="pay-discount">-0đ</span>
                    </div>
                    <div class="checkout-total-row">
                      <span>Phí giao hàng:</span>
                      <span id="pay-shipping">0đ</span>
                    </div>
                    <div class="checkout-total-row is-grand-total">
                      <span>Tổng thanh toán:</span>
                      <strong id="pay-grand-total">0đ</strong>
                    </div>
                  </div>

                  <div class="payment-actions-stack">
                    <button type="submit" class="btn btn-primary btn-block" id="pay-submit-btn">
                      Xác Nhận & Thanh Toán
                    </button>
                    <button type="button" class="btn btn-secondary btn-block" id="pay-back-to-cart-btn">
                      ← Quay lại sửa Giỏ Hàng
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <!-- MÀN HÌNH XÁC NHẬN ĐƠN HÀNG / HÓA ĐƠN -->
        <div class="payment-body" id="payment-body-receipt" hidden></div>
      </div>
    `;

    doc.body.appendChild(backdrop);
    doc.body.appendChild(modal);

    const els = {
      closeBtn: modal.querySelector('#payment-close-btn'),
      stepBadge: modal.querySelector('#payment-step-badge'),
      modalTitle: modal.querySelector('#payment-modal-title'),
      checkoutBody: modal.querySelector('#payment-body-checkout'),
      receiptBody: modal.querySelector('#payment-body-receipt'),
      globalAlert: modal.querySelector('#payment-global-alert'),
      form: modal.querySelector('#payment-checkout-form'),
      addressGroup: modal.querySelector('#pay-address-group'),
      pickupGroup: modal.querySelector('#pay-pickup-group'),
      panelCod: modal.querySelector('#panel-method-cod'),
      panelQrMomo: modal.querySelector('#panel-method-qr-momo'),
      panelQrZalopay: modal.querySelector('#panel-method-qr-zalopay'),
      panelAtm: modal.querySelector('#panel-method-atm'),
      cashGivenInput: modal.querySelector('#pay-cash-given'),
      cashChangePreview: modal.querySelector('#pay-cash-change'),
      qrMomoAmount: modal.querySelector('#qr-momo-amount'),
      qrMomoRef: modal.querySelector('#qr-momo-ref'),
      qrZalopayAmount: modal.querySelector('#qr-zalopay-amount'),
      qrZalopayRef: modal.querySelector('#qr-zalopay-ref'),
      itemCount: modal.querySelector('#pay-item-count'),
      freeShipBanner: modal.querySelector('#pay-freeship-banner'),
      summaryItems: modal.querySelector('#pay-summary-items'),
      promoInput: modal.querySelector('#pay-promo-input'),
      applyPromoBtn: modal.querySelector('#pay-apply-promo-btn'),
      promoMsg: modal.querySelector('#pay-promo-msg'),
      subtotal: modal.querySelector('#pay-subtotal'),
      discountRow: modal.querySelector('#pay-discount-row'),
      discount: modal.querySelector('#pay-discount'),
      shipping: modal.querySelector('#pay-shipping'),
      grandTotal: modal.querySelector('#pay-grand-total'),
      submitBtn: modal.querySelector('#pay-submit-btn'),
      backToCartBtn: modal.querySelector('#pay-back-to-cart-btn')
    };

    const FIELD_IDS = {
      fullName: 'pay-fullname',
      phone: 'pay-phone',
      address: 'pay-address',
      pickupStore: 'pay-pickup-store',
      note: 'pay-note',
      cashGiven: 'pay-cash-given',
      atmBank: 'pay-atm-bank',
      cardHolder: 'pay-card-holder',
      cardNumber: 'pay-card-number',
      cardExpiry: 'pay-card-expiry'
    };

    let latestGrandTotal = 0;

    function clearFieldErrors() {
      els.globalAlert.hidden = true;
      els.globalAlert.textContent = '';
      Object.entries(FIELD_IDS).forEach(([key, inputId]) => {
        const input = modal.querySelector(`#${inputId}`);
        const errSpan = modal.querySelector(`#err-${key}`);
        if (input) input.setAttribute('aria-invalid', 'false');
        if (errSpan) errSpan.textContent = '';
      });
    }

    function showFieldErrors(errors = {}, globalMessage = '') {
      clearFieldErrors();
      if (globalMessage) {
        els.globalAlert.textContent = globalMessage;
        els.globalAlert.hidden = false;
      }

      let firstInvalidInput = null;
      Object.entries(errors).forEach(([key, message]) => {
        const inputId = FIELD_IDS[key];
        const input = inputId ? modal.querySelector(`#${inputId}`) : null;
        const errSpan = modal.querySelector(`#err-${key}`);
        if (input) {
          input.setAttribute('aria-invalid', 'true');
          if (!firstInvalidInput) firstInvalidInput = input;
        }
        if (errSpan) {
          errSpan.textContent = message;
        }
      });

      if (firstInvalidInput && typeof firstInvalidInput.focus === 'function') {
        firstInvalidInput.focus();
      }
    }

    function updateCashChangePreview() {
      const raw = els.cashGivenInput.value.trim();
      if (!raw || latestGrandTotal <= 0) {
        els.cashChangePreview.hidden = true;
        els.cashChangePreview.textContent = '';
        return;
      }
      const val = Number(raw);
      if (Number.isFinite(val) && val >= latestGrandTotal) {
        els.cashChangePreview.hidden = false;
        els.cashChangePreview.textContent = `💵 Tiền thối dự kiến: ${formatVnd(val - latestGrandTotal)}`;
      } else {
        els.cashChangePreview.hidden = true;
      }
    }

    function refreshSummaryUI() {
      const snapshot = service.getCartSnapshot();
      const summary = computeOrderSummary(snapshot, {
        fulfillmentMode: uiState.fulfillmentMode,
        promoCode: uiState.promoCode,
        promoRules: service.getPromoRules()
      });

      latestGrandTotal = summary.grandTotal;
      els.itemCount.textContent = String(summary.totalCount);

      if (summary.isEmpty) {
        els.summaryItems.innerHTML = `<p class="choice-card-sub">Giỏ hàng hiện đang trống.</p>`;
      } else {
        els.summaryItems.innerHTML = summary.detailedItems
          .map(
            (item) => `
            <div class="summary-item-row">
              <div>
                <div class="summary-item-name">${safeEscapeHtml(item.name)}</div>
                <div class="summary-item-qty">SL: ${item.qty} × ${formatVnd(item.price)}</div>
              </div>
              <span class="summary-item-total">${formatVnd(item.lineTotal)}</span>
            </div>
          `
          )
          .join('');
      }

      if (uiState.fulfillmentMode === 'pickup') {
        els.freeShipBanner.textContent = '🏪 Nhận món tại quầy: Miễn phí giao hàng 0đ!';
      } else if (summary.amountToFreeShip === 0 && !summary.isEmpty) {
        els.freeShipBanner.textContent = '🎉 Đơn hàng đủ điều kiện Miễn phí giao hàng tận nơi!';
      } else {
        els.freeShipBanner.textContent = `🛵 Mua thêm ${formatVnd(summary.amountToFreeShip)} để được Miễn phí giao hàng (đơn từ 150.000đ).`;
      }

      els.promoMsg.textContent = summary.promoMessage;
      els.subtotal.textContent = formatVnd(summary.subtotal);

      if (summary.discount > 0) {
        els.discountRow.hidden = false;
        els.discount.textContent = `-${formatVnd(summary.discount)}`;
      } else {
        els.discountRow.hidden = true;
      }

      els.shipping.textContent = summary.shippingFee === 0 ? 'Miễn phí (0đ)' : formatVnd(summary.shippingFee);
      els.grandTotal.textContent = formatVnd(summary.grandTotal);

      // Cập nhật thông tin số tiền & mã tham chiếu cho cả QR MoMo và QR ZaloPay
      els.qrMomoAmount.textContent = formatVnd(summary.grandTotal);
      els.qrMomoRef.textContent = `MOMO ${uiState.draftRefCode}`;
      els.qrZalopayAmount.textContent = formatVnd(summary.grandTotal);
      els.qrZalopayRef.textContent = `ZLP ${uiState.draftRefCode}`;

      els.submitBtn.textContent = `Thanh Toán ${formatVnd(summary.grandTotal)}`;
      els.submitBtn.disabled = summary.isEmpty;
      updateCashChangePreview();

      return summary;
    }

    function updateFulfillmentVisibility(mode) {
      uiState.fulfillmentMode = mode === 'pickup' ? 'pickup' : 'delivery';
      modal.querySelectorAll('[data-fulfillment-card]').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.fulfillmentCard === uiState.fulfillmentMode);
      });
      els.addressGroup.hidden = uiState.fulfillmentMode !== 'delivery';
      els.pickupGroup.hidden = uiState.fulfillmentMode !== 'pickup';
      refreshSummaryUI();
    }

    function updateMethodVisibility(method) {
      uiState.paymentMethod = PAYMENT_METHODS[method] ? method : 'cod';
      modal.querySelectorAll('[data-method-card]').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.methodCard === uiState.paymentMethod);
      });
      els.panelCod.hidden = uiState.paymentMethod !== 'cod';
      els.panelQrMomo.hidden = uiState.paymentMethod !== 'qr_momo';
      els.panelQrZalopay.hidden = uiState.paymentMethod !== 'qr_zalopay';
      els.panelAtm.hidden = uiState.paymentMethod !== 'atm';
    }

    function renderReceiptView(order) {
      els.stepBadge.textContent = 'Hoàn tất';
      els.modalTitle.textContent = 'Đặt Hàng Thành Công!';
      els.checkoutBody.hidden = true;
      els.receiptBody.hidden = false;

      const destinationLabel = order.fulfillmentMode === 'pickup' ? 'Cửa hàng nhận món' : 'Địa chỉ giao đến';
      const destinationValue = order.fulfillmentMode === 'pickup' ? order.pickupStore : order.address;

      let methodDetail = order.paymentMethodLabel;
      if (order.paymentMeta.atmBankId && order.paymentMeta.cardLast4) {
        methodDetail += ` (${order.paymentMeta.atmBankId} **** ${order.paymentMeta.cardLast4})`;
      } else if (order.paymentMeta.qrTransferNote) {
        methodDetail += ` (${order.paymentMeta.qrTransferNote})`;
      }

      els.receiptBody.innerHTML = `
        <div class="receipt-view">
          <div class="receipt-icon-badge" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3>Gà Nóng Đang Được Chế Biến!</h3>
          <span class="receipt-order-code">Mã đơn: ${safeEscapeHtml(order.orderId)}</span>
          <p>Dự kiến có món sau <strong>${order.estimatedMinutes} phút</strong>. Cảm ơn <strong>${safeEscapeHtml(order.customer.fullName)}</strong>!</p>

          <div class="receipt-card">
            <div class="receipt-meta-row">
              <span>Người nhận:</span>
              <strong>${safeEscapeHtml(order.customer.fullName)} (${safeEscapeHtml(order.customer.phone)})</strong>
            </div>
            <div class="receipt-meta-row">
              <span>${destinationLabel}:</span>
              <strong>${safeEscapeHtml(destinationValue)}</strong>
            </div>
            <div class="receipt-meta-row">
              <span>Thanh toán:</span>
              <strong>${safeEscapeHtml(methodDetail)}</strong>
            </div>
            ${
              order.paymentMeta.changeDue !== null && order.paymentMeta.changeDue > 0
                ? `<div class="receipt-meta-row"><span>Tiền thối dự kiến:</span><strong>${formatVnd(order.paymentMeta.changeDue)}</strong></div>`
                : ''
            }
            <div class="receipt-meta-row">
              <span>Tổng thanh toán:</span>
              <strong style="color: var(--color-primary-dark); font-size: 1.15rem;">${formatVnd(order.pricing.grandTotal)}</strong>
            </div>
          </div>

          <div class="receipt-actions">
            <button type="button" class="btn btn-secondary" id="receipt-download-csv-btn">📥 Tải Hóa Đơn CSV</button>
            <button type="button" class="btn btn-primary" id="receipt-done-btn">Tiếp Tục Xem Thực Đơn</button>
          </div>
        </div>
      `;

      const downloadBtn = els.receiptBody.querySelector('#receipt-download-csv-btn');
      const doneBtn = els.receiptBody.querySelector('#receipt-done-btn');

      downloadBtn.addEventListener('click', () => {
        const csvContent = generateOrderCsv(order);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = doc.createElement('a');
        link.href = url;
        link.download = `${order.orderId}.csv`;
        doc.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });

      doneBtn.addEventListener('click', () => closeModal());
      doneBtn.focus();
    }

    function openModal() {
      const snapshot = service.getCartSnapshot();
      if (!snapshot || !snapshot.totalCount || snapshot.totalCount <= 0) {
        if (typeof root.showToast === 'function') {
          root.showToast('Giỏ hàng đang trống, hãy chọn món trước nhé!');
        }
        return false;
      }

      if (typeof root.closeCartDrawer === 'function') {
        root.closeCartDrawer();
      }

      uiState.draftRefCode = generateOrderId();
      uiState.promoCode = snapshot.appliedPromo || '';
      els.promoInput.value = uiState.promoCode;

      els.stepBadge.textContent = 'Bước 2/2';
      els.modalTitle.textContent = 'Thanh Toán Đơn Hàng';
      els.checkoutBody.hidden = false;
      els.receiptBody.hidden = true;
      clearFieldErrors();
      refreshSummaryUI();

      backdrop.hidden = false;
      modal.hidden = false;

      const nameInput = modal.querySelector('#pay-fullname');
      if (nameInput && typeof nameInput.focus === 'function') {
        nameInput.focus();
      }
      return true;
    }

    function closeModal() {
      modal.hidden = true;
      backdrop.hidden = true;
    }

    // Sự kiện đổi Hình thức nhận hàng & Phương thức thanh toán
    modal.addEventListener('change', (event) => {
      const target = event.target;
      if (target.name === 'fulfillmentMode') {
        updateFulfillmentVisibility(target.value);
      } else if (target.name === 'paymentMethod') {
        updateMethodVisibility(target.value);
      }
    });

    // Nút chọn nhanh mệnh giá tiền mặt & nút sao chép mã QR MoMo / ZaloPay
    modal.addEventListener('click', (event) => {
      const cashBtn = event.target.closest('button[data-cash-preset]');
      if (cashBtn) {
        const preset = cashBtn.dataset.cashPreset;
        els.cashGivenInput.value = preset === 'exact' ? String(latestGrandTotal) : preset;
        updateCashChangePreview();
        return;
      }

      const copyBtn = event.target.closest('button[data-copy-target]');
      if (copyBtn) {
        const codeEl = modal.querySelector(`#${copyBtn.dataset.copyTarget}`);
        const text = codeEl ? codeEl.textContent : '';
        if (text && root.navigator?.clipboard?.writeText) {
          root.navigator.clipboard.writeText(text).catch(() => {});
        }
        copyBtn.textContent = 'Đã chép ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Sao chép';
        }, 1600);
      }
    });

    els.cashGivenInput.addEventListener('input', updateCashChangePreview);

    // Tự động định dạng cụm 4 chữ số cho thẻ ATM & dấu '/' cho ô MM/YY
    const cardNumberInput = modal.querySelector('#pay-card-number');
    cardNumberInput.addEventListener('input', (e) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
      e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    });

    const expiryInput = modal.querySelector('#pay-card-expiry');
    expiryInput.addEventListener('input', (e) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (digits.length >= 3) {
        e.target.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      } else {
        e.target.value = digits;
      }
    });

    // Áp dụng mã giảm giá ngay tại màn hình Thanh Toán
    els.applyPromoBtn.addEventListener('click', () => {
      uiState.promoCode = els.promoInput.value.trim().toUpperCase();
      try {
        const rules = service.getPromoRules();
        if (typeof state !== 'undefined' && state) {
          state.appliedPromo = rules[uiState.promoCode] ? uiState.promoCode : null;
        }
        if (typeof root.renderCart === 'function') root.renderCart();
      } catch {
        // Bỏ qua nếu độc lập
      }
      refreshSummaryUI();
    });

    // Quay lại sửa Giỏ Hàng
    els.backToCartBtn.addEventListener('click', () => {
      closeModal();
      if (typeof root.openCartDrawer === 'function') {
        root.openCartDrawer();
      }
    });

    els.closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    doc.addEventListener('keydown', (event) => {
      if (modal.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key === 'Tab') {
        const focusables = Array.from(
          modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter((el) => !el.closest('[hidden]'));
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // Submit form Thanh Toán
    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(els.form);
      const payload = {
        fulfillmentMode: formData.get('fulfillmentMode') || uiState.fulfillmentMode,
        fullName: formData.get('fullName') || '',
        phone: formData.get('phone') || '',
        address: formData.get('address') || '',
        pickupStore: formData.get('pickupStore') || '',
        note: formData.get('note') || '',
        paymentMethod: formData.get('paymentMethod') || uiState.paymentMethod,
        cashGiven: formData.get('cashGiven') || '',
        atmBank: formData.get('atmBank') || '',
        cardHolder: formData.get('cardHolder') || '',
        cardNumber: formData.get('cardNumber') || '',
        cardExpiry: formData.get('cardExpiry') || '',
        promoCode: uiState.promoCode
      };

      const result = service.submitOrder(payload, { promoCode: uiState.promoCode });
      if (!result.ok) {
        showFieldErrors(result.errors || {}, result.message);
        return;
      }

      uiState.lastOrder = result.order;
      renderReceiptView(result.order);
      if (typeof root.showToast === 'function') {
        root.showToast(`🎉 Đặt thành công đơn ${result.order.orderId} (${formatVnd(result.order.pricing.grandTotal)})!`);
      }
    });

    // Chặn (capture) sự kiện click trên nút #checkout-btn của Giỏ Hàng để mở Modal Thanh Toán
    const cartCheckoutBtn = doc.getElementById('checkout-btn');
    if (cartCheckoutBtn) {
      cartCheckoutBtn.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openModal();
        },
        true
      );
    }

    const controller = {
      openModal,
      closeModal,
      refreshSummaryUI,
      getLastOrder: () => uiState.lastOrder,
      elements: { modal, backdrop, ...els }
    };

    modal._controller = controller;
    return controller;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mountPaymentModalUI(document));
    } else {
      mountPaymentModalUI(document);
    }
  }

  return {
    ORDERS_STORAGE_KEY,
    FREE_SHIPPING_THRESHOLD,
    STANDARD_SHIPPING_FEE,
    DEFAULT_PROMO_RULES,
    PICKUP_STORES,
    ATM_BANKS,
    PAYMENT_METHODS,
    formatVnd,
    normalizeVietnamPhone,
    isValidVietnamPhone,
    isValidLuhn,
    isValidAtmCardNumber,
    isValidCardExpiry,
    computeOrderSummary,
    validateCheckoutPayload,
    generateOrderId,
    escapeCsvCell,
    generateOrderCsv,
    createPaymentService,
    mountPaymentModalUI
  };
});
