# DESIGN.md – Hướng dẫn thiết kế

## 1. Cảm giác tổng thể
Nhanh, nóng, vui, thèm ăn. Nhiều khoảng trắng, chữ lớn, bo góc mềm, tương phản mạnh.

## 2. Bảng màu (khai báo trong `:root`)
```css
:root {
  --color-primary: #E4002B;   /* đỏ chủ đạo */
  --color-primary-dark: #B30022;
  --color-cream: #FFF6E5;     /* nền kem */
  --color-gold: #F5B301;      /* nhấn vàng giòn */
  --color-ink: #1F1A17;       /* chữ chính */
  --color-muted: #6B625C;     /* chữ phụ */
  --color-white: #FFFFFF;

  --radius: 16px;
  --space: 8px;               /* bội số 8px: 8, 16, 24, 32, 48, 64 */
  --shadow: 0 6px 20px rgba(31, 26, 23, 0.12);
}
```
Nền xen kẽ giữa `--color-cream` và `--color-white` giữa các phần để tách khối.

## 3. Chữ
- Dùng **font hệ thống**, không tải font ngoài:
  `font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;`
- Tiêu đề hero: `clamp(2rem, 6vw, 3.5rem)`, đậm 800.
- Tiêu đề phần: `1.75rem`–`2.25rem`, đậm 700.
- Nội dung: `1rem`, line-height 1.6.

## 4. Bố cục
- Chiều rộng tối đa nội dung: `1100px`, căn giữa, padding ngang 16px.
- Lưới thực đơn: 1 cột (mobile) → 2 cột (≥ 640px) → 4 cột (≥ 1024px), dùng CSS Grid.
- Header dính trên cùng (`position: sticky`), nền trắng, đổ bóng nhẹ.
- Nút chính: nền đỏ, chữ trắng, bo `999px`, cao ≥ 44px. Nút phụ: viền đỏ, nền trong suốt.
- Hover: nâng thẻ lên 4px (`transform: translateY(-4px)`) và tăng bóng; thời gian 200ms.

## 5. Quy tắc hình ảnh (nhẹ và đơn giản)
| Loại | Định dạng | Giới hạn |
|---|---|---|
| Hình hero, minh họa món | **SVG** tự vẽ bằng hình cơ bản (tròn, chữ nhật bo góc, đường cong) | ≤ 10 KB mỗi file |
| Icon (giòn tan, giao nhanh, giá tốt, sao) | **SVG** inline hoặc file riêng | ≤ 2 KB mỗi file |
| Ảnh món (nếu cần) | **WebP**, 400×300px, chất lượng ~70 | ≤ 50 KB mỗi file |
| Tổng thư mục `images/` | – | **≤ 500 KB** |

Quy tắc khác:
- Không ảnh nền toàn màn hình, không video, không GIF.
- Mỗi ảnh có `alt` mô tả; thêm `width`, `height` và `loading="lazy"` (trừ ảnh hero).
- Nếu chưa có ảnh món: dùng một SVG chung (đùi gà cách điệu) hoặc ô màu + emoji 🍗 làm ảnh tạm.
- **Bản quyền**: không dùng logo, ảnh sản phẩm hay hình Colonel chính thức của KFC. Thay bằng wordmark chữ (ví dụ chữ đậm màu trắng trên nền đỏ) và hình minh họa tự vẽ.

## 6. Khả năng truy cập
- Tương phản chữ/nền ≥ 4.5:1.
- Có trạng thái `:focus-visible` rõ ràng cho nút và liên kết.
- Cấu trúc tiêu đề h1 → h2 → h3 đúng thứ tự; dùng thẻ `header`, `nav`, `main`, `section`, `footer`.
- Tôn trọng `prefers-reduced-motion`: tắt hiệu ứng chuyển động khi người dùng yêu cầu.
