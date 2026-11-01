# QUY TẮC LÀM VIỆC VỚI AI

## 1. Ngôn ngữ và quy ước
- Trao đổi, giải thích và báo cáo bằng tiếng Việt.
- Tên biến, tên hàm, tên cột và tên bảng mới: tiếng Việt không dấu.
- Ưu tiên code ngắn gọn, dễ đọc, dễ bảo trì.
- Không tạo code trùng lặp nếu đã có chức năng tương tự.

## 2. Trước khi sửa code
- Đọc `AGENTS.md` và tài liệu liên quan đến nhiệm vụ.
- Khảo sát cấu trúc dự án và file đang sử dụng.
- Tìm đúng nguyên nhân lỗi trước khi sửa.
- Không tự ý thay đổi kiến trúc hoặc công nghệ.
- Không sửa chức năng ngoài phạm vi yêu cầu.

## 3. Quy tắc dữ liệu
- Kiểm tra schema, model và luồng dữ liệu hiện tại.
- Nếu dùng MongoDB, ưu tiên MongoDB làm nguồn dữ liệu chính khi kiến trúc dự án quy định.
- Chỉ đồng bộ Google Sheets/AppSheet khi có yêu cầu nghiệp vụ.
- Không tự ý đổi tên trường, xóa dữ liệu hoặc thay đổi cấu trúc database.
- Bảo toàn dữ liệu cũ và tính toán đúng nghiệp vụ.

## 4. Bảo mật
- Không ghi API key, mật khẩu, token hoặc thông tin nhạy cảm vào code.
- Không đưa file `.env` lên Git.
- Kiểm tra phân quyền trước khi sửa API và chức năng dữ liệu.
- Không vô hiệu hóa xác thực để sửa lỗi.

## 5. Cách thực hiện nhiệm vụ
- Mỗi lần chỉ xử lý một nhóm chức năng.
- Ưu tiên sửa ít file nhất có thể.
- Tái sử dụng hàm và thành phần đã có.
- Không viết lại toàn bộ file nếu không cần thiết.
- Không tự ý cài thêm thư viện.

## 6. Kiểm tra sau khi sửa
- Chạy kiểm tra phù hợp với dự án.
- Kiểm tra lỗi cú pháp, luồng dữ liệu và các chức năng liên quan.
- Nếu không thể chạy test, phải nói rõ.
- Không báo thành công nếu chưa kiểm tra.

## 7. Báo cáo kết quả
Chỉ báo cáo:
1. Nguyên nhân.
2. File đã sửa.
3. Nội dung đã thay đổi.
4. Kết quả kiểm tra.
5. Vấn đề còn tồn tại.

## 8. Tiết kiệm token
- Không đọc lại toàn bộ dự án nếu không cần.
- Chỉ đọc file liên quan trực tiếp đến nhiệm vụ.
- Không lặp lại tài liệu đã có.
- Nếu thiếu thông tin, tìm trong code trước khi hỏi.
- Ưu tiên phương án sửa nhỏ, rõ ràng và có thể kiểm tra.

## 9. Quy tắc tải dữ liệu và tối ưu hiệu năng

### Nguyên tắc bắt buộc
- Không dùng API `/all` để tải toàn bộ dữ liệu nghiệp vụ; không thay bằng API khác nhưng vẫn trả toàn bộ collection.
- Không tải toàn bộ collection MongoDB về frontend để tìm kiếm, lọc, phân trang hoặc tính toán; không phân trang giả bằng JavaScript.
- Mọi danh sách có thể tăng trưởng phải được giới hạn. Frontend chỉ nhận dữ liệu cần cho màn hình và thao tác hiện tại; backend thực hiện lọc, tìm kiếm, sắp xếp và phân trang.
- Không xóa chức năng cũ để giảm dữ liệu tải; không đổi nghiệp vụ, công thức tính toán hoặc quyền truy cập để tối ưu hiệu năng.
- Không đổi cấu trúc MongoDB nếu chưa đánh giá ảnh hưởng và phương án tương thích.

### Thay thế API `/all` theo mục đích
- **Bảng dữ liệu:** dùng API phân trang backend; mặc định 50 bản ghi/trang, hỗ trợ 20/50/100 và giới hạn tối đa 100 bản ghi/request. Trả dữ liệu cùng thông tin phân trang, chỉ tải trang hiện tại.
- **Tìm kiếm:** truy vấn tại MongoDB bằng tham số phù hợp như `q`, `page`, `limit`; debounce 300–400 ms; xử lý từ khóa rỗng/không hợp lệ; không tải collection về trình duyệt để tìm.
- **Dropdown/autocomplete:** chỉ gọi khi mở hoặc bắt đầu tìm; gợi ý tối đa 20 kết quả; lưu ID/mã định danh ổn định và bảo đảm hiển thị đúng giá trị đã lưu khi sửa dữ liệu cũ.
- **Thông báo:** chỉ tải một số thông báo mới nhất khi mở màn hình; phân trang lịch sử và hỗ trợ lọc trạng thái, người nhận, thời gian khi cần. Không tải toàn bộ lịch sử mỗi lần đăng nhập.
- **Lịch sử:** truy vấn theo mã đơn hàng, MST hoặc đối tượng liên quan; phân trang khi dài và sort tại MongoDB. Không tải lịch sử của mọi đối tượng cùng lúc.
- **Báo cáo/thống kê:** dùng MongoDB Aggregation khi phù hợp; chỉ trả số liệu tổng hợp và trường cần hiển thị. Không tính tổng bằng cách tải toàn bộ đơn hàng về frontend; giữ nguyên kết quả nghiệp vụ.
- **Xuất Excel:** áp dụng bộ lọc của màn hình; không giới hạn ở trang hiện tại nếu nghiệp vụ cần xuất toàn bộ kết quả lọc. Với dữ liệu lớn, streaming hoặc xử lý theo batch; không tải dữ liệu xuất lớn vào bộ nhớ trình duyệt.
- Chỉ giữ API trả toàn bộ khi dữ liệu nhỏ, có giới hạn rõ ràng hoặc là cấu hình/danh mục tĩnh nhỏ, có lý do nghiệp vụ cụ thể và đã đánh giá quyền truy cập, hiệu năng, ảnh hưởng. Ghi rõ ngoại lệ trong báo cáo kỹ thuật. Không áp dụng ngoại lệ cho nhân viên, khách hàng, đơn hàng, thông báo, lịch sử hay collection tăng trưởng không giới hạn.

### Backend MongoDB
- Luôn giới hạn kết quả, chỉ chọn trường cần thiết bằng projection/select và dùng `.lean()` cho truy vấn đọc phù hợp.
- Tránh truy vấn MongoDB trong vòng lặp theo từng bản ghi khi có thể dùng một truy vấn hoặc aggregation; không tải toàn bộ mã định danh về Node.js chỉ để tìm số lớn nhất.
- Sort tại MongoDB thay vì JavaScript với dữ liệu lớn. Validate và giới hạn `page`, `limit`, query đầu vào; không cho phép limit vô hạn hoặc quá lớn.
- Kiểm tra index hiện có trước khi thêm; index phải phục vụ query/filter/sort thực tế, không trùng lặp hoặc không có mục đích. Dùng `explain('executionStats')` cho truy vấn quan trọng và tránh `COLLSCAN` trên collection lớn khi có index phù hợp.
- Tránh `countDocuments` không cần thiết trên mỗi lần tìm kiếm.

### Frontend
- Không tải dữ liệu trước khi màn hình được mở, trừ dữ liệu thực sự cần thiết; tránh gọi lại API cho dữ liệu không đổi.
- Có loading, empty và error state; debounce tìm kiếm; hủy hoặc bỏ qua request cũ và không để response cũ ghi đè kết quả mới.
- Chỉ render trang hiện tại, không render hàng nghìn dòng DOM. Cache phải có giới hạn và được làm mới sau thêm/sửa/xóa.
- Không lưu toàn bộ dữ liệu nghiệp vụ vào `localStorage` để tránh gọi API.

### Bảo mật và phân quyền
- Mọi API dữ liệu phải xác thực theo quy định dự án; backend phải kiểm tra quyền, không chỉ ẩn nút trên giao diện.
- Giữ nguyên phạm vi dữ liệu nhân viên được xem và quyền hiện tại của Admin, Quản lý, Nhân viên, Chỉ xem. API tìm kiếm/phân trang không được bỏ qua điều kiện phân quyền.
- Không trả dữ liệu nhạy cảm không cần thiết về frontend; không ghi token, mật khẩu, API key hoặc URI kết nối vào log.

### Quy trình trước khi sửa
1. Xác định file HTML thực tế được `server.js` phục vụ và API frontend đang gọi.
2. Tìm mọi API `/all`, truy vấn không giới hạn và dữ liệu bị tải lặp.
3. Lần theo route, controller, model và collection MongoDB; xác định mục đích danh sách và nghiệp vụ phụ thuộc.
4. Kiểm tra phân quyền, điều kiện lọc và cách các nghiệp vụ hiện tại sử dụng dữ liệu.
5. Đề xuất phương án thay thế và liệt kê file dự kiến sửa; chỉ bắt đầu sửa sau khi hoàn tất phân tích.

### Kiểm tra sau khi sửa
- Xác nhận không còn API `/all` tải toàn bộ dữ liệu nghiệp vụ và API mới giới hạn kết quả.
- Kiểm tra phân trang, tìm kiếm (bao gồm request cũ), dropdown/autocomplete và giá trị khi sửa dữ liệu cũ.
- Kiểm tra thêm/sửa/xóa, dữ liệu cũ, công thức đơn hàng/công nợ và quyền Admin/Quản lý/Nhân viên/Chỉ xem.
- Kiểm tra truy vấn lặp/N+1, lỗi Console/API và hiệu năng trước-sau nếu môi trường cho phép.
- Không kết luận nghiệp vụ không bị ảnh hưởng nếu chưa kiểm tra các luồng liên quan; nêu rõ kiểm tra nào chưa thực hiện.

### Báo cáo sau mỗi lần chỉnh sửa liên quan đến tải dữ liệu/hiệu năng
1. Nguyên nhân gây chậm.
2. File đã kiểm tra.
3. File đã sửa.
4. API cũ và API mới.
5. Phương pháp tải dữ liệu mới.
6. Index được thêm/điều chỉnh, hoặc ghi rõ không thay đổi index.
7. Kết quả kiểm thử.
8. Nghiệp vụ và quyền đã xác nhận không bị ảnh hưởng.
9. Vấn đề còn tồn tại.
10. Hướng xử lý tiếp theo.

Quy ước bổ sung: không tự ý đổi tên thành phần cũ đang được sử dụng, không sửa lan sang module không liên quan, không xóa code cũ trước khi xác định đầy đủ nơi sử dụng và không đưa thông tin bí mật vào mã nguồn.
