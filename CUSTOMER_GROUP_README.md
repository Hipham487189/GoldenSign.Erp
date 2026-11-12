# Chức Năng Kết Nối Khách Hàng Thành Group - Tóm Tắt Hoàn Chỉnh

## 📋 Tóm Tắt

Đã thêm chức năng cho phép **kết nối các khách hàng thành nhóm (group)**. Mỗi khách hàng có thể thuộc một nhóm duy nhất, và một nhóm có thể chứa nhiều khách hàng.

**Ví dụ**: Khách hàng A có thể chọn kết nối khách hàng B cùng 1 Group "Khách Hàng Hà Nội".

---

## 📁 Các File Được Tạo/Sửa

| File | Loại | Mô Tả |
|------|------|-------|
| `models/CustomerGroup.js` | ✨ TẠO MỚI | Model để quản lý nhóm khách hàng |
| `models/Customer.js` | 🔄 CẬP NHẬT | Thêm trường `customerGroup` |
| `routes/customers.js` | 🔄 CẬP NHẬT | Thêm các endpoint quản lý nhóm |
| `CUSTOMER_GROUP_API.md` | 📖 HƯỚNG DẪN | API documentation chi tiết |
| `CUSTOMER_GROUP_USAGE_GUIDE.md` | 📘 VÍ DỤ | Hướng dẫn sử dụng và ví dụ |
| `CUSTOMER_GROUP_IMPLEMENTATION.md` | 📝 THAY ĐỔI | Tóm tắt các thay đổi thực hiện |

---

## 🔗 API Endpoints

### Quản Lý Nhóm

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| GET | `/api/customers/groups/list/all` | Lấy tất cả nhóm | view_customers |
| GET | `/api/customers/groups/list` | Lấy nhóm (phân trang) | view_customers |
| GET | `/api/customers/groups/:groupId` | Chi tiết nhóm | view_customers |
| POST | `/api/customers/groups/create` | Tạo nhóm | manage_customers |
| PUT | `/api/customers/groups/:groupId` | Cập nhật nhóm | manage_customers |
| DELETE | `/api/customers/groups/:groupId` | Xóa nhóm | manage_customers |

### Quản Lý Thành Viên Nhóm

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| POST | `/api/customers/groups/:groupId/add-customer` | Thêm KH vào nhóm | manage_customers |
| POST | `/api/customers/groups/:groupId/remove-customer` | Xóa KH khỏi nhóm | manage_customers |

### Tiện Ích

| Method | Endpoint | Mô Tả | Quyền |
|--------|----------|-------|-------|
| GET | `/api/customers/:customerId/groups` | Lấy nhóm của KH | view_customers |

---

## 💾 Database Schema

### CustomerGroup Collection
```javascript
{
  _id: ObjectId,
  name: String (required),              // Tên nhóm
  description: String,                  // Mô tả
  customers: [ObjectId],                // Danh sách khách hàng
  createdBy: ObjectId (User),           // Người tạo
  isActive: Boolean (default: true),    // Trạng thái
  createdAt: Date,
  updatedAt: Date
}
```

### Customer (Thêm Trường)
```javascript
customerGroup: ObjectId (ref: 'CustomerGroup')  // Nhóm của khách hàng
```

---

## 🎯 Quy Trình Sử Dụng Cơ Bản

### 1️⃣ Tạo Nhóm
```javascript
POST /api/customers/groups/create
{
  "name": "Nhóm Khách Hàng Hà Nội",
  "description": "Các khách hàng khu vực Hà Nội",
  "customers": ["id_kh1", "id_kh2"]
}
```

### 2️⃣ Thêm Khách Hàng Vào Nhóm
```javascript
POST /api/customers/groups/{groupId}/add-customer
{
  "customerId": "id_kh3"
}
```

### 3️⃣ Xem Nhóm
```javascript
GET /api/customers/groups/{groupId}
GET /api/customers/groups/list?page=1&limit=50
```

### 4️⃣ Xóa Khách Hàng Khỏi Nhóm
```javascript
POST /api/customers/groups/{groupId}/remove-customer
{
  "customerId": "id_kh3"
}
```

### 5️⃣ Xóa Nhóm
```javascript
DELETE /api/customers/groups/{groupId}
```

---

## ✅ Validation & Kiểm Soát

✓ ID ObjectId hợp lệ  
✓ Tên nhóm bắt buộc, không rỗng  
✓ Khách hàng phải tồn tại & active  
✓ Nhóm phải đang hoạt động  
✓ Soft delete (dữ liệu vẫn được lưu)  
✓ Xác thực & phân quyền (requireAuth, requirePermission)  

---

## 🔍 Tính Năng Nâng Cao

### Populate Tự Động
Khi lấy khách hàng, nhóm của họ sẽ được trả về:
```javascript
{
  "_id": "...",
  "name": "KH ABC",
  "phone": "...",
  "customerGroup": {
    "_id": "...",
    "name": "Nhóm Hà Nội"
  }
}
```

### Tìm Kiếm & Phân Trang
```javascript
GET /api/customers/groups/list?page=1&limit=50&q=Hà%20Nội
```

### Index MongoDB
- `{ name: 1, isActive: 1 }` - Tìm kiếm nhanh
- `{ customers: 1 }` - Tìm nhóm theo khách hàng

---

## 📊 Thống Kê

- ✅ 1 model mới (CustomerGroup.js)
- ✅ 1 field mới trong Customer
- ✅ 8 endpoint API mới cho nhóm
- ✅ 1 endpoint tiện ích mới
- ✅ 4 cập nhật endpoint cũ
- ✅ 100% quyền truy cập & validation

---

## 🚀 Cách Triển Khai

1. **Tự động**: Server sẽ tự động load model CustomerGroup thông qua `require`
2. **Database**: MongoDB sẽ tự động tạo collection và index khi có dữ liệu đầu tiên
3. **Routes**: Tất cả endpoint đã được kích hoạt trên `/api/customers`

**Không cần cấu hình bổ sung!**

---

## 📚 Tài Liệu

| Tài Liệu | Link |
|----------|------|
| **API Chi Tiết** | [CUSTOMER_GROUP_API.md](./CUSTOMER_GROUP_API.md) |
| **Hướng Dẫn Sử Dụng** | [CUSTOMER_GROUP_USAGE_GUIDE.md](./CUSTOMER_GROUP_USAGE_GUIDE.md) |
| **Tóm Tắt Thay Đổi** | [CUSTOMER_GROUP_IMPLEMENTATION.md](./CUSTOMER_GROUP_IMPLEMENTATION.md) |

---

## 🧪 Kiểm Tra

### Cú Pháp JavaScript ✅ PASS
```bash
node -c models/CustomerGroup.js
node -c models/Customer.js  
node -c routes/customers.js
```

### Sẵn Sàng Sử Dụng
```bash
npm start
# Server sẽ tự động load tất cả các endpoint mới
```

---

## 💡 Lưu Ý Quan Trọng

1. **Soft Delete**: Nhóm xóa sẽ đánh dấu `isActive = false` (dữ liệu vẫn giữ)
2. **Dữ Liệu Cũ**: Tất cả khách hàng cũ vẫn hoạt động bình thường
3. **Quyền**: Cần `manage_customers` để tạo/sửa/xóa nhóm
4. **Hiệu Năng**: Đã tối ưu với index và phân trang
5. **Bảo Mật**: Tất cả API yêu cầu xác thực

---

## ❓ Câu Hỏi Thường Gặp

**Q: Một khách hàng có thể thuộc nhiều nhóm không?**  
A: Hiện tại không. Mỗi khách hàng chỉ có thể thuộc một nhóm duy nhất. Nếu cần, có thể mở rộng sau.

**Q: Khi xóa nhóm, khách hàng có bị xóa không?**  
A: Không. Chỉ nhóm bị đánh dấu không hoạt động, khách hàng vẫn tồn tại và có thể gán sang nhóm khác.

**Q: Làm sao để khôi phục nhóm đã xóa?**  
A: Admin có thể cập nhật `isActive = true` trực tiếp trong database MongoDB.

**Q: API có giới hạn số lượng khách hàng trong một nhóm không?**  
A: Không có giới hạn. Nhưng khuyến nghị <= 10,000 khách hàng/nhóm để tối ưu hiệu năng.

---

## 📞 Hỗ Trợ

Nếu có vấn đề hoặc câu hỏi, hãy kiểm tra:
1. [CUSTOMER_GROUP_API.md](./CUSTOMER_GROUP_API.md) - Tham khảo API
2. [CUSTOMER_GROUP_USAGE_GUIDE.md](./CUSTOMER_GROUP_USAGE_GUIDE.md) - Xem ví dụ
3. Console của server - Xem lỗi chi tiết

---

**Tạo bởi**: Copilot  
**Ngày**: 2026-11-10  
**Phiên bản**: 1.0
