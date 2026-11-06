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

#### **Mã Đơn Hàng (Tự Động Sinh)**
- **Format**: `DH + MMYY + "-" + 5 chữ số`
- **Ví dụ**: `DH1126-00001` (tháng 11, năm 26, số thứ tự 1)
- **Quy Tắc**:
  - MM: Tháng (01-12)
  - YY: Năm cuối cùng (26 = 2026)
  - Phần số: 5 chữ số (00001-99999)
  - **Reset hàng năm**: Từ ngày 01/01, phần số sẽ reset lại về 00001

#### **Ngày Đăng Ký**
- Tự động đặt ngày hiện tại theo định dạng DD/MM/YYYY
- Có thể sửa thủ công nếu cần

### 📑 Các Phần Biểu Mẫu

#### 1️⃣ **Thông Tin Đơn Hàng** (Order Information)
- Mã Đơn Hàng (tự động sinh)
- Ngày Đăng Ký (tự động đặt, có thể sửa)
- Nhân Viên Phụ Trách
- Nhân Viên Nhập Liệu
- Tình Trạng Đơn Hàng

#### 2️⃣ **Thông Tin Khách Hàng** (Customer Information)
- Tên Khách Hàng
- Số Điện Thoại
- Mã Số Thuế (MST)
- Tên Công Ty
- Địa Chỉ Công Ty
- Địa Chỉ Giao Nhận
- Email
- Gõ tên khách hàng để tìm; chọn kết quả sẽ tự điền số điện thoại, địa chỉ giao nhận và email đã lưu vào các ô còn trống
- Tra MST sẽ tìm khách hàng nội bộ trước, sau đó tra thông tin doanh nghiệp VietQR nếu chưa có

#### 3️⃣ **Thông Tin Sản Phẩm/Dịch Vụ** (Products & Services)
- Loại Sản Phẩm
- Nhà Cung Cấp (NCC)
- Hình Thức Thanh Toán
- Gói Dịch Vụ
- Thành Tiền
- Thực Thu
- Thực Đóng NCC
- Thực Đóng Cuối Cùng
- NCC, hình thức, gói cước và các khoản tiền được tải theo lựa chọn; danh sách gói có phân trang

#### 4️⃣ **Tệp Đính Kèm** (Attachments)
- Hợp Đồng
- Xác Nhận / BBBG
- GPKD (Giấy Phép Kinh Doanh)
- CCCD
- File tổng (chỉ nhận RAR/ZIP, tối đa 5MB)

### 🎨 Giao Diện

- **Responsive Design**: Hoạt động tốt trên desktop, tablet, mobile
- **Bố cục sản phẩm và hồ sơ**: Hai phần hiển thị 50/50 trên desktop và xếp dọc trên mobile
- **Tệp đính kèm**: Năm mục nằm cùng một hàng trên màn hình rộng, tự xuống dòng trên màn hình nhỏ
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
- `DATAGS_modern_youth_lux_smooth (1).html` - Thêm script loading + cập nhật logic sinh mã
- `ADD_ORDER_FULL_PAGE_GUIDE.md` - Hướng dẫn (file này)

### API Endpoints Được Sử Dụng
- `GET /api/orders/next-code` - Lấy mã đơn tiếp theo từ server
- `GET /api/employees/options` - Tải danh sách nhân viên có giới hạn
- `GET /api/customers?page=1&limit=20&q=...` - Tìm khách hàng theo tên, chỉ tải kết quả phù hợp
- `GET /api/customers/search-by-mst?mst=...` - Tra cứu khách hàng đã lưu theo MST
- `GET /api/sanpham/order-options` - Tải loại/NCC/hình thức và từng trang gói cước phù hợp
- `POST /api/orders/create` - Tạo đơn hàng bằng JSON, kèm tệp đính kèm dạng data URL; tự lưu khách hàng mới từ tên, số điện thoại, địa chỉ giao nhận và email nếu chưa có trong danh sách
- `https://api.vietqr.io/v2/business/{mst}` - Tra cứu tên và địa chỉ doanh nghiệp khi MST chưa có trong danh sách khách hàng

Các API nội bộ yêu cầu đăng nhập; trang gửi JWT đang lưu trong `datags_auth_token`.

Tên khách hàng được tìm với debounce 350 ms và giới hạn 20 kết quả. Gói cước được tải theo trang, tối đa 50 gói mỗi request (API giới hạn tối đa 100).

### JavaScript Functions
```javascript
// Khởi tạo trang (tự động chạy khi load)
initializeAddOrderPage()

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

### Danh sách nhân viên, khách hàng hoặc gói cước không tải
- Mở trang qua `http://localhost:5000/add-order`, không mở file HTML bằng `file://`
- Đăng nhập trước; lỗi 401 nghĩa là phiên đăng nhập chưa có hoặc đã hết hạn
- Kiểm tra quyền xem đơn hàng/khách hàng/nhân viên tương ứng
- Xem tab Network để biết API cụ thể đang trả lỗi nào

### Mã đơn hàng không tự động sinh
- Kiểm tra kết nối MongoDB
- Chắc chắn API `/api/orders/next-code` hoạt động và tài khoản có quyền tạo đơn hàng
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

## 💡 Ví Dụ Mã Đơn Hàng

| Ngày | Tháng | Năm | Mã Được Tạo | Ghi Chú |
|------|-------|-----|-------------|--------|
| 15/11/2026 | 11 | 26 | DH1126-00001 | Đơn hàng đầu tiên tháng 11 |
| 16/11/2026 | 11 | 26 | DH1126-00002 | Đơn hàng thứ hai tháng 11 |
| 01/12/2026 | 12 | 26 | DH1226-00001 | Tháng mới → reset |
| 01/01/2027 | 01 | 27 | DH0127-00001 | Năm mới → reset hoàn toàn |

## 📞 Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra console log (F12)
2. Xem network tab để kiểm tra API calls
3. Liên hệ với đội phát triển

## 🔄 Cập Nhật

**Phiên Bản**: 1.2.0
**Ngày Cập Nhật**: 06/11/2026  
**Trạng Thái**: ✅ Đã Hoạt Động

### Thay Đổi Phiên Bản 1.2.0
- ✅ Khôi phục tra cứu khách hàng có giới hạn và tự điền địa chỉ
- ✅ Khôi phục tra cứu MST khách hàng nội bộ và thông tin doanh nghiệp
- ✅ Khôi phục chuỗi chọn NCC/hình thức/gói và tự điền giá trị tài chính
- ✅ Gửi JWT cho API; dùng API cấp mã và tạo đơn hàng chính thức
- ✅ Tải tùy chọn sản phẩm theo bộ lọc, phân trang gói cước

### Thay Đổi Phiên Bản 1.1.0
- ✅ Cập nhật format mã đơn hàng theo quy định: DH + MMYY + "-" + 5 chữ số
- ✅ Tự động reset phần số hàng năm (01/01)
- ✅ Hỗ trợ cả format cũ (DH0000001) và format mới (DH1126-00001)
- ✅ Tối ưu logic tìm mã lớn nhất của tháng/năm

### Kế Hoạch Cập Nhật Tiếp Theo
- [ ] Tích hợp validation form nâng cao
- [ ] Thêm autocomplete cho dropdown
- [ ] Upload file với progress bar
- [ ] Lưu draft đơn hàng
- [ ] In preview đơn hàng
- [ ] Gửi email xác nhận
