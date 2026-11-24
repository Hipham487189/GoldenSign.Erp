# Tóm Tắt Thay Đổi - Chức Năng Kết Nối Khách Hàng Thành Group

## Mục Tiêu
Thêm chức năng cho phép kết nối các khách hàng vào một nhóm (group) chung. Ví dụ: Khách hàng A có thể chọn kết nối khách hàng B cùng 1 Group.

## Các File Được Thay Đổi

### 1. **models/CustomerGroup.js** (TẠO MỚI)
- File mới để quản lý nhóm khách hàng
- Schema:
  - `name`: Tên nhóm (bắt buộc)
  - `description`: Mô tả nhóm
  - `customers`: Danh sách ID khách hàng trong nhóm
  - `createdBy`: Người tạo nhóm (reference đến User)
  - `isActive`: Trạng thái hoạt động (soft delete)
  - `timestamps`: Ngày tạo/cập nhật
- Index:
  - `{ name: 1, isActive: 1 }` - Hỗ trợ tìm kiếm
  - `{ customers: 1 }` - Hỗ trợ tìm nhóm theo khách hàng

### 2. **models/Customer.js** (CẬP NHẬT)
- Thêm trường: `customerGroup` (reference đến CustomerGroup)
- Thêm index: `{ customerGroup: 1 }`

### 3. **routes/customers.js** (CẬP NHẬT)
#### Imports
- Thêm: `const CustomerGroup = require('../models/CustomerGroup');`

#### Cập Nhật Endpoint Cũ
- `GET /api/customers/all` - Thêm `.populate('customerGroup', 'name')`
- `GET /api/customers/` - Thêm `.populate('customerGroup', 'name')`
- `POST /api/customers/create` - Validate và thêm `customerGroup`
- `PUT /api/customers/update/:id` - Validate và cập nhật `customerGroup`

#### Endpoint Mới - Quản Lý Nhóm Khách Hàng
1. **GET** `/api/customers/groups/list/all` - Lấy tất cả nhóm (không phân trang)
2. **GET** `/api/customers/groups/list` - Lấy nhóm với phân trang & tìm kiếm
3. **GET** `/api/customers/groups/:groupId` - Chi tiết nhóm
4. **POST** `/api/customers/groups/create` - Tạo nhóm
5. **PUT** `/api/customers/groups/:groupId` - Cập nhật nhóm
6. **POST** `/api/customers/groups/:groupId/add-customer` - Thêm khách hàng vào nhóm
7. **POST** `/api/customers/groups/:groupId/remove-customer` - Xóa khách hàng khỏi nhóm
8. **DELETE** `/api/customers/groups/:groupId` - Xóa nhóm (soft delete)

## Quyền Yêu Cầu
- Xem nhóm: `view_customers`
- Quản lý nhóm: `manage_customers`

## Validation
- ✅ ID ObjectId hợp lệ
- ✅ Tên nhóm bắt buộc, không rỗng
- ✅ Khách hàng phải tồn tại & active
- ✅ Nhóm phải active

## Cách Sử Dụng

### Tạo Nhóm Khách Hàng
```javascript
POST /api/customers/groups/create
{
  "name": "Nhóm Khách Hàng Hà Nội",
  "description": "Các khách hàng khu vực Hà Nội",
  "customers": ["id_kh1", "id_kh2"]
}
```

### Thêm Khách Hàng Vào Nhóm
```javascript
POST /api/customers/groups/{groupId}/add-customer
{
  "customerId": "id_khach_hang"
}
```

### Xóa Khách Hàng Khỏi Nhóm
```javascript
POST /api/customers/groups/{groupId}/remove-customer
{
  "customerId": "id_khach_hang"
}
```

### Lấy Danh Sách Nhóm
```javascript
GET /api/customers/groups/list?page=1&limit=50&q=Nhóm
```

### Lấy Chi Tiết Nhóm
```javascript
GET /api/customers/groups/{groupId}
```

### Cập Nhật Nhóm
```javascript
PUT /api/customers/groups/{groupId}
{
  "name": "Tên Mới",
  "description": "Mô tả mới",
  "customers": ["id_kh1", "id_kh2", "id_kh3"]
}
```

### Xóa Nhóm
```javascript
DELETE /api/customers/groups/{groupId}
```

## Tài Liệu Chi Tiết
Xem file: **CUSTOMER_GROUP_API.md**

## Kiểm Tra
✅ Cú pháp JavaScript - PASS
✅ Model CustomerGroup - PASS
✅ Model Customer (cập nhật) - PASS
✅ Route customers (cập nhật) - PASS

## Lưu Ý
- Soft delete được áp dụng (không xóa dữ liệu thực sự)
- Dữ liệu cũ vẫn được bảo toàn
- Index đã được tạo để hỗ trợ truy vấn nhanh
- Tất cả endpoint đều yêu cầu xác thực (requireAuth)
