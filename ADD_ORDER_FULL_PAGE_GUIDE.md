# Hướng Dẫn Sử Dụng Trang Full Page "Thêm Đơn Hàng Mới"

## 📋 Giới Thiệu

Tính năng "Thêm Đơn Hàng Mới" đã được nâng cấp từ modal dialog sang một trang full page chuyên dụng, cung cấp trải nghiệm người dùng tốt hơn và giao diện hiện đại.

> Máy chủ mặc định bật đơn nhiều sản phẩm và UNC khi thiếu `DON_NHIEU_SAN_PHAM_ENABLED`, `TAO_DON_NHIEU_SAN_PHAM_ENABLED` và `UNC_NHIEU_SAN_PHAM_ENABLED`. Có thể đặt từng biến thành `false` để tắt; tắt biến đơn nhiều sản phẩm cũng tắt tạo đơn và UNC nhiều sản phẩm. Dòng sản phẩm đã lưu có thể chỉnh sửa theo quyền trong chi tiết đơn.

> Chọn **Nhập nhiều sản phẩm** trong trang thêm đơn, hoặc mở `/add-order?xemThuNhieuSanPham=1`. Nhấn ô **Chọn sản phẩm / dịch vụ** ở dòng trống hoặc **Thêm dòng**, gõ tên gói (ít nhất 2 ký tự) và chọn kết quả rồi nhập thông tin dòng. Loại sản phẩm, NCC và hình thức được lấy từ danh mục; gói thiếu thông tin sẽ báo lỗi. Mỗi trang tìm kiếm có tối đa 20 gói. Bảng hỗ trợ sửa, xóa và xem lịch sử thanh toán từng dòng trước khi tạo đơn. Nút tạo đơn gửi dữ liệu tới API; nếu các biến tính năng chưa bật, máy chủ sẽ từ chối. Khi thoát, các dòng chưa lưu bị xóa sau khi xác nhận. Tổng hiển thị gồm mọi trạng thái và không phải công nợ. Chưa áp dụng chiết khấu, VAT hoặc combo.

> Bản xem thử dùng giá bán, thực đóng công ty và công nợ NCC từ gói được chọn trong danh mục. Hộp chọn gói hiển thị thực đóng và thực công nợ công ty theo **một đơn vị**, chỉ đọc; tính theo số lượng vẫn dùng quy tắc hiện tại. Cột thuế suất hiện để trống, chưa nhập hoặc tính thuế; thành tiền vẫn bằng giá bán sau thuế nhân số lượng. Hàng cuối bảng cộng thành tiền của mọi dòng xem thử, không phân biệt trạng thái và không phải công nợ. Thiếu giá hoặc giá không phải số nguyên VNĐ hợp lệ sẽ báo lỗi và không thêm dòng.

> Phải thu khách tương ứng với **Thực Thu** trong dữ liệu đơn cũ. Trên dòng sản phẩm, giá trị này không bắt buộc; để trống sẽ được tính và hiển thị là **0 đồng**. Bộ chuẩn hóa chi tiết cũng chuyển giá trị không nhập (`null` hoặc thiếu trường) thành 0; không thay đổi dữ liệu cũ.

> Giao diện UNC nhiều sản phẩm và API đã được nối với các hàm tạo, duyệt, từ chối và xem tệp theo quyền. Danh sách UNC tập trung hiển thị phiếu cũ và từng phiếu mới, phân trang 50 phiếu; việc xem tệp và duyệt phiếu mới phụ thuộc các cờ tính năng. Tệp UNC mới lưu bằng GridFS `tep_unc`, chỉ tải khi xem; tệp từng lưu trong đơn vẫn đọc theo định dạng cũ. Thông tin phiếu vẫn nằm trong đơn, chưa tách collection riêng. GridFS, báo cáo và danh sách chưa được kiểm thử trên MongoDB thật. UNC cấp đơn cũ không được tự phân bổ theo NCC.

> Khi gửi UNC cho đơn nhiều sản phẩm, phải nhập số tiền phân bổ cho ít nhất một dòng; tổng phân bổ không vượt tiền UNC. Chỉ sau khi duyệt, tiền phân bổ mới được ghi vào thanh toán khách của dòng tương ứng và cập nhật tổng thanh toán, còn lại trên đơn theo tổng các dòng; phần dư vẫn chưa phân bổ.

> Mỗi đơn tối đa 5 phiếu UNC, tính cả phiếu cũ và phiếu ở mọi trạng thái. Tệp UNC tải mới hoặc thay thế tối đa 3 MB; tệp và phiếu đã lưu trước đó không bị xóa.

> API đọc đơn chỉ trả thông tin tài chính trong chi tiết sản phẩm cho tài khoản có quyền tài chính và không bị ẩn cột tài chính liên quan. Khi một cột tài chính liên quan bị ẩn, toàn bộ tiền và lịch sử thanh toán trên dòng cũng được ẩn để tránh suy ra giá trị đó.

> Với đơn nhiều sản phẩm, màn hình sửa đơn tổng chỉ đọc các khoản tiền và thông tin gói; API cũng từ chối sửa trực tiếp các khoản tổng tính theo dòng. Bảng chi tiết nhóm NCC, loại sản phẩm và hình thức dưới tên sản phẩm; tổng thành tiền cộng mọi dòng khi dữ liệu giá và số lượng đầy đủ, không phải công nợ. Chỉ Admin được mở mục thanh toán khách trên dòng để nhập ngày và số tiền, rồi xác nhận ghi nhận trực tiếp; nhân viên gửi thanh toán qua UNC. Quyền này áp dụng cho ghi trực tiếp trên đơn đã lưu, không thay đổi luồng nhập khi tạo đơn. Tổng thanh toán và còn lại được cập nhật ngay. Không nhập trực tiếp khoản đã gửi UNC: nếu dòng có UNC chờ duyệt, phải xử lý phiếu trước. Khi lỗi không xác định kết quả, tải lại đơn và kiểm tra trước khi thử lại. Lịch sử đã ghi chỉ xem, không sửa hoặc xóa tại đây. Nhấn một dòng trong **Chi tiết đơn hàng** để mở hộp thoại xem thông tin chỉ đọc; nhấn biểu tượng bút ở dòng để mở form sửa gói, số lượng, đơn vị, trạng thái hoặc thực thu. Không đổi được gói nếu dòng đã có thanh toán hoặc có UNC chờ duyệt; giá gói mới lấy từ danh mục. Cũng có thể nhập thực thu tại bảng và bấm **Lưu thực thu sản phẩm**, hoặc tại **Kiểm tra đơn hàng** chọn **Theo sản phẩm**. Thao tác yêu cầu quyền sửa đơn, quyền tài chính và không bị ẩn cột liên quan.

> Trong chi tiết đơn đã lưu, người có quyền sửa sản phẩm có thể chọn trạng thái ngay tại từng dòng; thay đổi được lưu riêng và không tự đổi trạng thái đơn. Khi đổi trạng thái đơn rồi lưu, hoặc đổi nhanh ở danh sách, trạng thái mới được áp dụng cho tất cả sản phẩm. Nếu chỉ lưu thông tin khác mà không đổi trạng thái đơn, trạng thái riêng của các sản phẩm được giữ nguyên. Báo cáo công nợ tiếp tục chỉ tính dòng ở trạng thái kích hoạt.

> Chi tiết đơn hàng dùng bố cục tương tự trang tạo đơn: thông tin đơn và khách hàng ở đầu, tiếp theo là phần sản phẩm và gói cước, rồi đến hồ sơ đính kèm. Hồ sơ dùng cùng kiểu chọn tệp như form tạo đơn, bổ sung xem và tải tệp đã có; tệp mới chỉ được lưu khi bấm **Lưu Thay Đổi**. Chức năng chỉ đường, lịch sử mua hàng và dữ liệu liên quan theo MST vẫn nằm trong chi tiết. Đơn đã lưu tiếp tục sử dụng quy tắc sửa và thanh toán hiện tại, không hỗ trợ thêm hoặc xóa dòng sản phẩm tại đây.

> Tổng quan và Dashboard xác định ngày hiện tại theo giờ Việt Nam, đối chiếu với ngày đăng ký của đơn. Biểu đồ doanh thu theo NCC ở Tổng quan cộng thành tiền từng dòng sản phẩm theo NCC của dòng; đơn cũ không có chi tiết vẫn dùng NCC và thành tiền cấp đơn.

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
- Gõ ít nhất 2 ký tự để tìm, rồi chọn đúng khách theo tên, mã và số điện thoại. Phải chọn khách trong danh sách trước khi tạo đơn. Nếu chưa có, nhập thông tin và bấm **Tạo khách hàng mới**, kiểm tra tránh trùng rồi xác nhận nhân viên quản lý trước khi lưu. Admin và tài khoản `khoinguyen29` được chọn nhân viên đang hoạt động; tài khoản khác chỉ xác nhận nhân viên liên kết với chính mình. Khách được lưu vào danh sách trước khi tạo đơn. Nhiều khách có thể dùng chung MST.
- Đơn mới từ form lưu mã khách đã chọn; đơn cũ không đổi. Báo cáo công nợ hiện vẫn nhóm theo tên, chưa phân biệt khách trùng tên bằng mã.
- Tra MST tìm khách hàng nội bộ trước, sau đó tra thông tin doanh nghiệp VietQR nếu chưa có; chỉ điền tên và địa chỉ công ty còn trống, không thay đổi thông tin liên hệ hoặc khách hàng đã chọn. Địa chỉ công ty từ khách hàng nội bộ hiện lấy từ địa chỉ giao nhận được lưu trong hồ sơ khách hàng.

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
- **Bố cục sản phẩm và hồ sơ**: Mỗi phần chiếm toàn bộ chiều rộng nội dung, hồ sơ nằm dưới sản phẩm
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
- `GET /api/orders/nhan-vien-quan-ly?q=...` - Lấy tối đa 20 nhân viên phù hợp để xác nhận khi tạo khách, theo phạm vi quyền của tài khoản.
- `GET /api/sanpham/order-options` - Tải loại/NCC/hình thức và từng trang gói cước phù hợp
- `POST /api/orders/khach-hang-moi` - Người có quyền tạo đơn tạo khách hàng mới từ thông tin đã nhập; kiểm tra trùng tên và số điện thoại khi có số điện thoại.
- `POST /api/orders/create-voi-khach-hang` - Tạo đơn hàng bằng JSON và mã khách đã chọn, kèm tệp đính kèm dạng data URL; xác minh khách còn hoạt động trước khi lưu.
- `POST /api/orders/create` - API tạo đơn cũ tiếp tục hoạt động cho các giao diện cũ.
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
