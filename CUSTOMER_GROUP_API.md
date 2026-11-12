# API Quản Lý Nhóm Khách Hàng

## Tổng Quan
Chức năng cho phép kết nối các khách hàng vào một group chung. Mỗi khách hàng có thể thuộc một nhóm và một nhóm có thể chứa nhiều khách hàng.

## Models Được Thêm

### 1. CustomerGroup (models/CustomerGroup.js)
```javascript
{
  _id: ObjectId,
  name: String (required),           // Tên nhóm
  description: String,               // Mô tả nhóm
  customers: [ObjectId],             // Danh sách ID khách hàng trong nhóm
  createdBy: ObjectId (User),        // Người tạo nhóm
  isActive: Boolean (default: true), // Trạng thái hoạt động
  timestamps: true                   // createdAt, updatedAt
}
```

### 2. Customer (models/Customer.js)
Thêm trường:
```javascript
customerGroup: ObjectId (ref: 'CustomerGroup')  // Reference đến nhóm khách hàng
```

## API Endpoints

### 1. Lấy Tất Cả Nhóm (không phân trang)
```
GET /api/customers/groups/list/all
Header: Authorization: Bearer <token>
Permission: view_customers

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "Nhóm A",
      "description": "Mô tả",
      "customers": [
        { "_id": "...", "name": "KH A", "code": "KHA001" },
        { "_id": "...", "name": "KH B", "code": "KHB001" }
      ],
      "createdBy": { "_id": "...", "name": "Admin" },
      "isActive": true,
      "createdAt": "2026-11-10T...",
      "updatedAt": "2026-11-10T..."
    }
  ]
}
```

### 2. Lấy Nhóm với Phân Trang
```
GET /api/customers/groups/list?page=1&limit=50&q=Nhóm
Header: Authorization: Bearer <token>
Permission: view_customers

Query Parameters:
- page: int (default: 1) - Trang hiện tại
- limit: int (default: 50, max: 200) - Số bản ghi/trang
- q: string - Tìm kiếm theo tên hoặc mô tả

Response:
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 3. Lấy Chi Tiết Nhóm
```
GET /api/customers/groups/:groupId
Header: Authorization: Bearer <token>
Permission: view_customers

URL Parameters:
- groupId: ObjectId - ID của nhóm

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Nhóm A",
    "description": "Mô tả",
    "customers": [
      { "_id": "...", "name": "KH A", "code": "KHA001", ... }
    ],
    "createdBy": { "_id": "...", "name": "Admin", "email": "admin@..." },
    "isActive": true,
    "createdAt": "2026-11-10T...",
    "updatedAt": "2026-11-10T..."
  }
}
```

### 4. Tạo Nhóm Khách Hàng
```
POST /api/customers/groups/create
Header: Authorization: Bearer <token>
Permission: manage_customers

Body:
{
  "name": "Nhóm Khách Hàng A",
  "description": "Các khách hàng khu vực Hà Nội",
  "customers": ["id_kh_1", "id_kh_2", "id_kh_3"]  // Optional
}

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Nhóm Khách Hàng A",
    "description": "Các khách hàng khu vực Hà Nội",
    "customers": [...],
    "createdBy": "...",
    "isActive": true,
    "createdAt": "2026-11-10T...",
    "updatedAt": "2026-11-10T..."
  }
}
```

### 5. Cập Nhật Nhóm Khách Hàng
```
PUT /api/customers/groups/:groupId
Header: Authorization: Bearer <token>
Permission: manage_customers

URL Parameters:
- groupId: ObjectId - ID của nhóm

Body (tất cả trường optional):
{
  "name": "Tên Mới",
  "description": "Mô tả mới",
  "customers": ["id_kh_1", "id_kh_2"]
}

Response:
{
  "success": true,
  "data": { ... }
}
```

### 6. Thêm Khách Hàng Vào Nhóm
```
POST /api/customers/groups/:groupId/add-customer
Header: Authorization: Bearer <token>
Permission: manage_customers

URL Parameters:
- groupId: ObjectId - ID của nhóm

Body:
{
  "customerId": "id_khach_hang"
}

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "...",
    "customers": [
      { "_id": "...", "name": "KH A", "code": "KHA001" },
      { "_id": "...", "name": "KH B", "code": "KHB001" },
      { "_id": "...", "name": "KH Mới", "code": "KHMOI" }
    ],
    ...
  }
}
```

### 7. Xóa Khách Hàng Khỏi Nhóm
```
POST /api/customers/groups/:groupId/remove-customer
Header: Authorization: Bearer <token>
Permission: manage_customers

URL Parameters:
- groupId: ObjectId - ID của nhóm

Body:
{
  "customerId": "id_khach_hang"
}

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "...",
    "customers": [
      { "_id": "...", "name": "KH A", "code": "KHA001" }
    ],
    ...
  }
}
```

### 8. Xóa Nhóm Khách Hàng (Soft Delete)
```
DELETE /api/customers/groups/:groupId
Header: Authorization: Bearer <token>
Permission: manage_customers

URL Parameters:
- groupId: ObjectId - ID của nhóm

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "...",
    "isActive": false,
    ...
  }
}
```

### 9. Lấy Nhóm Của Một Khách Hàng
```
GET /api/customers/:customerId/groups
Header: Authorization: Bearer <token>
Permission: view_customers

URL Parameters:
- customerId: ObjectId - ID của khách hàng

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "Nhóm A",
      "description": "Mô tả",
      "customers": [
        { "_id": "...", "name": "KH A", "code": "KHA001" },
        { "_id": "...", "name": "KH B", "code": "KHB001" }
      ],
      "createdBy": { "_id": "...", "name": "Admin" },
      "isActive": true,
      "createdAt": "2026-11-10T...",
      "updatedAt": "2026-11-10T..."
    }
  ]
}
```

## Các Lỗi Thường Gặp

| HTTP Code | Lỗi | Nguyên Nhân |
|-----------|-----|-----------|
| 400 | ID nhóm không hợp lệ | groupId không phải ObjectId hợp lệ |
| 400 | ID khách hàng không hợp lệ | customerId không phải ObjectId hợp lệ |
| 400 | Tên nhóm không được để trống | name trống hoặc chỉ có khoảng trắng |
| 401 | Unauthorized | Token không hợp lệ hoặc hết hạn |
| 403 | Forbidden | Không có quyền manage_customers |
| 404 | Không tìm thấy nhóm khách hàng | Nhóm đã bị xóa hoặc ID sai |
| 404 | Không tìm thấy khách hàng | Khách hàng không tồn tại |
| 500 | Internal Server Error | Lỗi máy chủ |

## Quy Trình Sử Dụng

### 1. Tạo Nhóm và Thêm Khách Hàng
```javascript
// Bước 1: Tạo nhóm
POST /api/customers/groups/create
{
  "name": "Nhóm Khách Hàng Hà Nội",
  "description": "Khách hàng khu vực Hà Nội",
  "customers": ["id_kh1", "id_kh2"]
}

// Bước 2: Thêm khách hàng mới vào nhóm (tùy chọn)
POST /api/customers/groups/{groupId}/add-customer
{
  "customerId": "id_kh3"
}
```

### 2. Quản Lý Thành Viên Nhóm
```javascript
// Lấy danh sách nhóm
GET /api/customers/groups/list?page=1&limit=50

// Chi tiết nhóm
GET /api/customers/groups/{groupId}

// Xóa khách hàng khỏi nhóm
POST /api/customers/groups/{groupId}/remove-customer
{
  "customerId": "id_kh"
}

// Cập nhật toàn bộ danh sách khách hàng trong nhóm
PUT /api/customers/groups/{groupId}
{
  "customers": ["id_kh1", "id_kh2", "id_kh3"]
}
```

### 3. Xóa Nhóm
```javascript
// Soft delete - giữ lại dữ liệu, chỉ đánh dấu isActive = false
DELETE /api/customers/groups/{groupId}
```

## Lưu Ý Kỹ Thuật

1. **Index MongoDB**: Đã tạo index trên các trường:
   - `name` + `isActive` - Hỗ trợ tìm kiếm nhóm
   - `customers` - Hỗ trợ tìm nhóm theo khách hàng

2. **Validation**:
   - Tất cả ID đầu vào phải là ObjectId hợp lệ
   - Tên nhóm bắt buộc và không được rỗng
   - Khách hàng phải tồn tại và active
   - Nhóm phải active

3. **Soft Delete**:
   - Khi xóa nhóm, chỉ đặt `isActive = false`
   - Dữ liệu vẫn được lưu giữ

4. **Populate Fields**:
   - Khi lấy nhóm: customers trả về `_id`, `name`, `code`
   - Khi chi tiết nhóm: customers trả về toàn bộ thông tin

## Kiểm Tra

Chạy test cơ bản:
```bash
# 1. Tạo nhóm
curl -X POST http://localhost:5000/api/customers/groups/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Group","customers":[]}'

# 2. Lấy danh sách
curl -X GET http://localhost:5000/api/customers/groups/list \
  -H "Authorization: Bearer <token>"

# 3. Thêm khách hàng
curl -X POST http://localhost:5000/api/customers/groups/<groupId>/add-customer \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"<customerId>"}'
```
