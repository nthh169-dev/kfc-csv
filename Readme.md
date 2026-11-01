# KFC Landing Page (Static & Serverless)

Trang landing page quảng cáo gà rán KFC sử dụng giao diện hiện đại, tối ưu tốc độ tải và sử dụng file CSV làm cơ sở dữ liệu cho thực đơn (menu) và các chương trình khuyến mãi.

## 🚀 Công nghệ sử dụng
* **HTML5 / CSS3**: Giao diện responsive, sử dụng Flexbox/Grid.
* **JavaScript (Vanilla JS)**: Xử lý tương tác, hiệu ứng và đọc dữ liệu.
* **CSV File**: Lưu trữ dữ liệu sản phẩm (thay thế Database truyền thống).
* **PapaParse.js**: Thư viện JavaScript giúp đọc file CSV trực tiếp trên trình duyệt.

## 📂 Cấu trúc thư mục
```text
kfc-landing-page/
│
├── index.html          # Trang chủ Landing Page
├── style.css           # File định dạng giao diện
├── script.js           # File xử lý logic (đọc CSV, render sản phẩm)
├── data/
│   └── menu.csv        # Database dạng file CSV
├── images/             # Chứa hình ảnh đơn giản, dung lượng nhẹ (.svg hoặc .webp)
└── README.md           # Tài liệu hướng dẫn dự án