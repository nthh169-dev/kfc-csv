/**
 * BỘ KIỂM THỬ NGHIÊM NGẶT MODULE 2: THANH TOÁN (payment.test.js)
 * Kiểm thử đầy đủ 4 phương thức: Tiền mặt (cod), Mã QR MoMo (qr_momo), Mã QR ZaloPay (qr_zalopay), Thẻ ATM (atm)
 * Chạy trực tiếp bằng Node.js: node modules/payment/payment.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const Payment = require('./payment.js');

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

function createSampleCartSnapshot(itemsOverride) {
  const items = itemsOverride || [
    { id: '1', name: 'Gà Rán Giòn Cay', category: 'Gà rán', price: 45000, qty: 2 },
    { id: '9', name: 'Pepsi Tươi Cold', category: 'Đồ uống', price: 19000, qty: 1 }
  ];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
  return {
    detailedItems: items,
    totalCount,
    subtotal,
    appliedPromo: ''
  };
}

const REFERENCE_NOW = new Date('2026-11-01T14:44:00+07:00');

const tests = [];
function test(id, name, fn) {
  tests.push({ id, name, fn });
}

/* ==========================================================================
   DANH SÁCH CÁC TEST CASE NGHIÊM NGẶT
   ========================================================================== */

test('TC-01', 'Danh mục PAYMENT_METHODS có đúng 4 phương thức: Tiền mặt, Mã QR MoMo, Mã QR ZaloPay, Thẻ ATM', () => {
  const keys = Object.keys(Payment.PAYMENT_METHODS);
  assert.deepEqual(keys, ['cod', 'qr_momo', 'qr_zalopay', 'atm']);

  // Từ chối phương thức lạ không thuộc 4 tùy chọn trên
  const invalidMethod = Payment.validateCheckoutPayload({
    fulfillmentMode: 'pickup',
    pickupStore: 'hcm-q1',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    paymentMethod: 'bitcoin'
  });
  assert.equal(invalidMethod.isValid, false);
  assert.ok(invalidMethod.errors.paymentMethod);
});

test('TC-02', 'Giỏ hàng rỗng trả về trạng thái isEmpty và chặn đặt hàng (EMPTY_CART)', () => {
  const emptySummary = Payment.computeOrderSummary({ detailedItems: [], totalCount: 0, subtotal: 0 });
  assert.equal(emptySummary.isEmpty, true);
  assert.equal(emptySummary.grandTotal, 0);

  const service = Payment.createPaymentService({
    storage: createMockStorage(),
    getCartSnapshot: () => ({ detailedItems: [], totalCount: 0, subtotal: 0 })
  });

  const result = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
    paymentMethod: 'cod'
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EMPTY_CART');
});

test('TC-03', 'Tính phí giao hàng chuẩn 15.000đ (< 150K) và miễn phí tại mốc biên 150.000đ', () => {
  const below = Payment.computeOrderSummary(
    createSampleCartSnapshot([{ id: 'x', name: 'Combo', price: 149999, qty: 1 }]),
    { fulfillmentMode: 'delivery' }
  );
  assert.equal(below.shippingFee, 15000);
  assert.equal(below.grandTotal, 164999);

  const exact = Payment.computeOrderSummary(
    createSampleCartSnapshot([{ id: 'y', name: 'Combo', price: 150000, qty: 1 }]),
    { fulfillmentMode: 'delivery' }
  );
  assert.equal(exact.shippingFee, 0);
  assert.equal(exact.grandTotal, 150000);
});

test('TC-04', 'Hình thức Tự đến lấy (pickup) luôn miễn phí giao hàng 0đ', () => {
  const snapshot = createSampleCartSnapshot([{ id: '1', name: 'Gà Rán', price: 45000, qty: 1 }]);
  const summary = Payment.computeOrderSummary(snapshot, { fulfillmentMode: 'pickup' });
  assert.equal(summary.shippingFee, 0);
  assert.equal(summary.grandTotal, 45000);
});

test('TC-05', 'Kiểm tra điều kiện mã giảm giá & chống âm tiền tuyệt đối', () => {
  const smallCart = createSampleCartSnapshot(); // 109.000đ
  const validPromo = Payment.computeOrderSummary(smallCart, {
    fulfillmentMode: 'delivery',
    promoCode: 'combo95'
  });
  assert.equal(validPromo.promoValid, true);
  assert.equal(validPromo.discount, 15000);

  const tinyCart = createSampleCartSnapshot([{ id: '9', name: 'Pepsi', price: 19000, qty: 1 }]);
  const capped = Payment.computeOrderSummary(tinyCart, {
    fulfillmentMode: 'pickup',
    promoCode: 'SUPER100',
    promoRules: { SUPER100: { discount: 100000, minOrder: 10000 } }
  });
  assert.equal(capped.discount, 19000);
  assert.equal(capped.grandTotal, 0);
});

test('TC-06', 'Validate Họ tên Unicode tiếng Việt & Số điện thoại di động VN (+84, 03/05/07/08/09)', () => {
  assert.equal(Payment.normalizeVietnamPhone('+84 901 234-567'), '0901234567');
  assert.equal(Payment.isValidVietnamPhone('0356789123'), true);
  assert.equal(Payment.isValidVietnamPhone('0123456789'), false);

  const base = {
    fulfillmentMode: 'pickup',
    pickupStore: 'hcm-q1',
    phone: '0901234567',
    paymentMethod: 'cod'
  };
  assert.equal(Payment.validateCheckoutPayload({ ...base, fullName: 'Trần Thị Mỹ Linh' }).isValid, true);
  assert.equal(Payment.validateCheckoutPayload({ ...base, fullName: '<script>alert(1)</script>' }).isValid, false);
});

test('TC-07', 'Validate Địa chỉ giao hàng (delivery >= 10 ký tự) & Cửa hàng nhận món (pickup)', () => {
  const common = { fullName: 'Lê Hoàng Nam', phone: '0912345678', paymentMethod: 'cod' };
  assert.equal(
    Payment.validateCheckoutPayload({ ...common, fulfillmentMode: 'delivery', address: 'Quận 1' }).isValid,
    false
  );
  assert.equal(
    Payment.validateCheckoutPayload({ ...common, fulfillmentMode: 'delivery', address: '45 Lê Lợi, Phường Bến Nghé, Quận 1' }).isValid,
    true
  );
  assert.equal(
    Payment.validateCheckoutPayload({ ...common, fulfillmentMode: 'pickup', pickupStore: 'hn-cg' }).isValid,
    true
  );
});

test('TC-08', 'Phương thức 1 - Tiền mặt (COD): chặn đưa thiếu tiền & tính đúng tiền thối khi đưa dư', () => {
  const service = Payment.createPaymentService({
    storage: createMockStorage(),
    getCartSnapshot: () => createSampleCartSnapshot() // 109K + 15K ship = 124K
  });

  const underPaid = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
    paymentMethod: 'cod',
    cashGiven: '100000'
  }, { now: REFERENCE_NOW });
  assert.equal(underPaid.ok, false);
  assert.ok(underPaid.errors.cashGiven);

  const paidOk = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
    paymentMethod: 'cod',
    cashGiven: '200000'
  }, { now: REFERENCE_NOW });
  assert.equal(paidOk.ok, true);
  assert.equal(paidOk.order.paymentMethod, 'cod');
  assert.equal(paidOk.order.paymentMeta.changeDue, 76000);
});

test('TC-09', 'Phương thức 2 - Mã QR MoMo (qr_momo): tạo đơn thành công & sinh nội dung chuyển khoản MOMO', () => {
  const storage = createMockStorage();
  const service = Payment.createPaymentService({
    storage,
    randomFn: () => 0.25, // -> suffix 3250
    getCartSnapshot: () => createSampleCartSnapshot([{ id: '3', name: 'Combo 1 Người', price: 95000, qty: 2 }]) // 190K -> free ship
  });

  const res = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Phạm Thu Hà',
    phone: '0988112233',
    address: '56 Lê Thánh Tôn, Quận 1, TP.HCM',
    paymentMethod: 'qr_momo'
  }, { now: REFERENCE_NOW });

  assert.equal(res.ok, true);
  assert.equal(res.order.paymentMethod, 'qr_momo');
  assert.equal(res.order.paymentMethodLabel, 'Mã QR MoMo');
  assert.equal(res.order.paymentMeta.qrTransferNote, 'MOMO KFC-20261101-3250');
  assert.equal(res.order.pricing.grandTotal, 190000);
});

test('TC-10', 'Phương thức 3 - Mã QR ZaloPay (qr_zalopay): tạo đơn thành công & sinh nội dung ZLP', () => {
  const storage = createMockStorage();
  const service = Payment.createPaymentService({
    storage,
    randomFn: () => 0.4, // -> suffix 4600
    getCartSnapshot: () => createSampleCartSnapshot([{ id: '5', name: 'Burger Zinger', price: 65000, qty: 1 }])
  });

  const res = service.submitOrder({
    fulfillmentMode: 'pickup',
    pickupStore: 'hcm-q3',
    fullName: 'Trương Quốc Bảo',
    phone: '0977665544',
    paymentMethod: 'qr_zalopay'
  }, { now: REFERENCE_NOW });

  assert.equal(res.ok, true);
  assert.equal(res.order.paymentMethod, 'qr_zalopay');
  assert.equal(res.order.paymentMethodLabel, 'Mã QR ZaloPay');
  assert.equal(res.order.paymentMeta.qrTransferNote, 'ZLP KFC-20261101-4600');
  assert.equal(res.order.pricing.grandTotal, 65000);
});

test('TC-11', 'Phương thức 4 - Thẻ ATM (atm): bắt buộc chọn ngân hàng, kiểm tra thẻ Napas 9704 / Luhn & ẩn số thẻ', () => {
  // Kiểm tra hàm isValidAtmCardNumber
  assert.equal(Payment.isValidAtmCardNumber('9704 3600 1234 5678'), true);  // Đầu số Napas chuẩn 16 số
  assert.equal(Payment.isValidAtmCardNumber('9704 1500 8888 9999 123'), true); // Napas 19 số
  assert.equal(Payment.isValidAtmCardNumber('9704 0000 0000 0000'), false); // Đuôi lặp toàn số 0 -> chặn
  assert.equal(Payment.isValidAtmCardNumber('1234 5678 1234 5678'), false); // Không phải 9704 và sai Luhn -> chặn
  assert.equal(Payment.isValidAtmCardNumber('9704 1234'), false);           // Quá ngắn -> chặn

  const storage = createMockStorage();
  const service = Payment.createPaymentService({
    storage,
    getCartSnapshot: () => createSampleCartSnapshot([{ id: '4', name: 'Combo Gia Đình', price: 279000, qty: 1 }])
  });

  // Thiếu ngân hàng phát hành -> báo lỗi atmBank
  const missingBank = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Võ Thành Đạt',
    phone: '0977889900',
    address: '88 Đồng Khởi, Phường Bến Nghé, Quận 1',
    paymentMethod: 'atm',
    atmBank: '',
    cardHolder: 'VO THANH DAT',
    cardNumber: '9704 3600 1234 5678',
    cardExpiry: '08/29'
  }, { now: REFERENCE_NOW });
  assert.equal(missingBank.ok, false);
  assert.ok(missingBank.errors.atmBank);

  // Đầy đủ ngân hàng VCB + thẻ Napas hợp lệ -> thành công & chỉ lưu 4 số cuối
  const validAtm = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Võ Thành Đạt',
    phone: '0977889900',
    address: '88 Đồng Khởi, Phường Bến Nghé, Quận 1',
    paymentMethod: 'atm',
    atmBank: 'VCB',
    cardHolder: 'VO THANH DAT',
    cardNumber: '9704 3600 1234 5678',
    cardExpiry: '08/29'
  }, { now: REFERENCE_NOW });

  assert.equal(validAtm.ok, true);
  assert.equal(validAtm.order.paymentMethod, 'atm');
  assert.equal(validAtm.order.paymentMeta.atmBankId, 'VCB');
  assert.equal(validAtm.order.paymentMeta.cardLast4, '5678');

  const rawSaved = storage.getItem(Payment.ORDERS_STORAGE_KEY);
  assert.equal(rawSaved.includes('9704360012345678'), false);
});

test('TC-12', 'Chống gửi trùng đơn hàng đồng thời (Idempotency lock)', () => {
  const service = Payment.createPaymentService({
    storage: createMockStorage(),
    getCartSnapshot: () => createSampleCartSnapshot()
  });

  service._setSubmittingLockForTest(true);
  const blocked = service.submitOrder({
    fulfillmentMode: 'pickup',
    pickupStore: 'hcm-q1',
    fullName: 'Đỗ Hoàng',
    phone: '0909090909',
    paymentMethod: 'cod'
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'DUPLICATE_SUBMISSION');
  service._setSubmittingLockForTest(false);
});

test('TC-13', 'Lưu lịch sử đơn vào localStorage & tự động xóa sạch Giỏ Hàng sau thanh toán', () => {
  const storage = createMockStorage();
  let cartCleared = false;

  const service = Payment.createPaymentService({
    storage,
    randomFn: () => 0.5,
    getCartSnapshot: () => ({
      ...createSampleCartSnapshot([{ id: '4', name: 'Combo Gia Đình', price: 279000, qty: 1 }]),
      appliedPromo: 'FAMILY56'
    }),
    clearCart: () => {
      cartCleared = true;
    }
  });

  const res = service.submitOrder({
    fulfillmentMode: 'delivery',
    fullName: 'Hoàng Thu Trang',
    phone: '+84 918 222 333',
    address: '200 Pasteur, Phường Võ Thị Sáu, Quận 3',
    paymentMethod: 'qr_momo'
  }, { now: REFERENCE_NOW });

  assert.equal(res.ok, true);
  assert.equal(cartCleared, true);
  assert.equal(service.loadOrderHistory().length, 1);
});

test('TC-14', 'Xuất hóa đơn CSV: chuẩn UTF-8 BOM, escape RFC-4180 và chống CSV Formula Injection', () => {
  assert.equal(Payment.escapeCsvCell('=1+1'), '\'=1+1');
  assert.equal(Payment.escapeCsvCell('@SUM(A1:A2)'), '\'@SUM(A1:A2)');

  const sampleOrder = {
    orderId: 'KFC-20261101-9999',
    createdAt: '2026-11-01T07:44:00.000Z',
    fulfillmentMode: 'delivery',
    address: '12, Đường "Nguyễn Huệ", Quận 1',
    pickupStore: '',
    paymentMethodLabel: 'Mã QR MoMo',
    customer: { fullName: '=Nguyen Van Test', phone: '0901234567' },
    items: [{ id: '1', name: 'Gà Rán Giòn Cay', qty: 2, price: 45000, lineTotal: 90000 }],
    pricing: { discount: 10000, shippingFee: 15000, grandTotal: 95000 }
  };

  const csv = Payment.generateOrderCsv(sampleOrder);
  assert.equal(csv.startsWith('\uFEFForder_id,created_at,'), true);
  assert.equal(csv.includes('\'=Nguyen Van Test'), true);
  assert.equal(csv.includes('Mã QR MoMo'), true);
});

/* ==========================================================================
   TRÌNH CHẠY KIỂM THỬ & BÁO CÁO KẾT QUẢ
   ========================================================================== */

let passed = 0;
let failed = 0;

console.log('==============================================================');
console.log(' BẮT ĐẦU CHẠY BỘ KIỂM THỬ MODULE 2: THANH TOÁN (14 TEST CASES)');
console.log('==============================================================');

for (const tc of tests) {
  try {
    tc.fn();
    passed++;
    console.log(`✅ [PASS] ${tc.id}: ${tc.name}`);
  } catch (err) {
    failed++;
    console.error(`❌ [FAIL] ${tc.id}: ${tc.name}`);
    console.error('   Chi tiết lỗi:', err.message);
  }
}

console.log('--------------------------------------------------------------');
console.log(` TỔNG KẾT: ${passed}/${tests.length} đạt | ${failed} lỗi`);
console.log('==============================================================');

if (failed > 0) {
  process.exitCode = 1;
}
