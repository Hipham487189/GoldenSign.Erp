# Hướng Dẫn Sử Dụng Trang Full Page "Thêm Đơn Hàng Mới"

## 📋 Giới Thiệu

Tính năng "Thêm Đơn Hàng Mới" đã được nâng cấp từ modal dialog sang một trang full page chuyên dụng, cung cấp trải nghiệm người dùng tốt hơn và giao diện hiện đại.

## 🚀 Cách Sử Dụng

### Cách 1: Nhấp Nút "Thêm Đơn Hàng" trên Trang Chính
1. Đăng nhập vào hệ thống DATAGS
2. Tìm nút **"Thêm Đơn Hàng"** (biểu tượng `+`) ở thanh công cụ
3. Nhấp nút → Trang form full page sẽ mở

### Cách 2: Truy Cập Trực Tiếp (URL)
- Nhập URL: `http://localhost:5000/add-order`

### Cách 3: Phím Tắt (Keyboard Shortcut)
- Nhấp `Shift + A` trên trang chính để mở modal cũ (nếu cần)

## 📝 Các Tính Năng

### ✅ Tự Động Điền Dữ Liệu
- **Mã Đơn Hàng (Mã DH)**: Tự động sinh mã tiếp theo (DH0000001, DH0000002, ...)
- **Ngày Đăng Ký**: Tự động đặt ngày hiện tại theo định dạng DD/MM/YYYY
- Các trường khác: Có thể nhập thủ công

### 📑 Các Phần Biểu Mẫu

#### 1️⃣ **Thông Tin Đơn Hàng** (Order Information)
- Mã Đơn Hàng
- Ngày Đăng Ký
- Nhân Viên Phụ Trách
- Nhân Viên Nhập Liệu
- Tình Trạng Đơn Hàng

#### 2️⃣ **Thông Tin Khách Hàng** (Customer Information)
- Tên Khách Hàng
- Số Điện Thoại
- Mã Số Thuế (MST)
- Tên Công Ty
- Địa Chỉ Công Ty

#### 3️⃣ **Thông Tin Sản Phẩm/Dịch Vụ** (Products & Services)
- Loại Sản Phẩm
- Nhà Cung Cấp (NCC)
- Hình Thức Thanh Toán
- Gói Dịch Vụ
- Thành Tiền
- Thực Thu
- Thực Đóng NCC
- Thực Đóng Cuối Cùng

#### 4️⃣ **Tệp Đính Kèm** (Attachments)
- Chứng Minh Thư / Căn Cước (CMT/CCCD)
- Hợp Đồng
- Xác Nhận / BBBG
- GPKD (Giấy Phép Kinh Doanh)
- CCCD/CMND

### 🎨 Giao Diện

- **Responsive Design**: Hoạt động tốt trên desktop, tablet, mobile
- **Dark Mode**: Hỗ trợ chế độ tối (mặc định)
- **Light Mode**: Hỗ trợ chế độ sáng
- **Sticky Header & Footer**: Header và nút hành động luôn hiển thị

### 💾 Nút Hành Động

| Nút | Chức Năng |
|-----|-----------|
| **🔄 Xóa** | Xóa toàn bộ dữ liệu đã nhập (yêu cầu xác nhận) |
| **✔️ Tạo Mới Đơn Hàng** | Gửi form và tạo đơn hàng mới |

## 🔧 Chi Tiết Kỹ Thuật

### File Được Tạo
- `add-order.html` - Trang form full page
- `public/js/add-order-full-page.js` - Script điều khiển

### File Được Chỉnh Sửa
- `server.js` - Thêm route `/add-order`
- `DATAGS_modern_youth_lux_smooth (1).html` - Thêm script loading

### API Endpoints Được Sử Dụng
- `GET /api/orders` - Lấy danh sách đơn hàng để tính mã tiếp theo
- `POST /api/orders` - Tạo đơn hàng mới (multipart/form-data)

### JavaScript Functions
```javascript
// Khởi tạo trang (tự động chạy khi load)
initializeAddOrderPage()

// Sinh mã đơn hàng
generateOrderCode()

// Đặt ngày hiện tại
setCurrentDate()

// Xóa form (yêu cầu xác nhận)
resetForm()

// Gửi biểu mẫu
submitCreateOrder()

// Quay lại trang chính
goBack()
```

## ✨ CSS Features

### Các Biến CSS Được Sử Dụng
```css
--primary: #0284c7              /* Màu chính (xanh dương) */
--primary-hover: #0369a1        /* Màu khi hover */
--success-gradient              /* Gradient thành công */
--danger-gradient               /* Gradient nguy hiểm */
--bg-main                       /* Màu nền chính */
--bg-card                       /* Màu nền card */
--text-main                     /* Màu text chính */
--text-muted                    /* Màu text mờ */
```

### Grid Layout
- **3 cột** mặc định
- **2 cột** cho một số trường (sử dụng class `.two-col`)
- **Full width** cho file uploads

## 🛠️ Troubleshooting

### Trang không tải
- Đảm bảo server Node.js đang chạy: `npm start`
- Kiểm tra xem port 5000 có được sử dụng không
- Xem console log để tìm lỗi

### Mã đơn hàng không tự động sinh
- Kiểm tra kết nối MongoDB
- Chắc chắn là API `/api/orders` hoạt động
- Xem Browser DevTools Console để tìm lỗi

### Nút "Thêm Đơn Hàng" không chuyển hướng
- Đảm bảo `public/js/add-order-full-page.js` được load
- Kiểm tra cache trình duyệt (Ctrl+Shift+Delete)
- Reload trang chính (Ctrl+F5)

## 📱 Tương Thích

| Trình Duyệt | Phiên Bản | Hỗ Trợ |
|-------------|-----------|--------|
| Chrome | 90+ | ✅ |
| Firefox | 88+ | ✅ |
| Safari | 14+ | ✅ |
| Edge | 90+ | ✅ |
| Mobile Chrome | Latest | ✅ |
| Mobile Safari | Latest | ✅ |

## 📞 Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra console log (F12)
2. Xem network tab để kiểm tra API calls
3. Liên hệ với đội phát triển

## 🔄 Cập Nhật

**Phiên Bản**: 1.0.0  
**Ngày Cập Nhật**: 06/11/2026  
**Trạng Thái**: ✅ Đã Hoạt Động

### Kế Hoạch Cập Nhật Tiếp Theo
- [ ] Tích hợp validation form nâng cao
- [ ] Thêm autocomplete cho dropdown
- [ ] Upload file với progress bar
- [ ] Lưu draft đơn hàng
- [ ] In preview đơn hàng
- [ ] Gửi email xác nhận
