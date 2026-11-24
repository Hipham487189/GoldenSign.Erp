# Hướng Dẫn Sử Dụng - Kết Nối Khách Hàng Thành Group

## Tổng Quan
Tính năng này cho phép bạn nhóm các khách hàng lại với nhau. Ví dụ: nhóm khách hàng từ cùng một khu vực, hoặc khách hàng có chung một đối tác kinh doanh.

## Kịch Bản Sử Dụng

### Kịch Bản 1: Tạo Nhóm Khách Hàng Mới
Bạn muốn tạo một nhóm gọi là "Khách Hàng Hà Nội" chứa 3 khách hàng.

**Bước 1: Tạo nhóm**
```javascript
// Request
POST /api/customers/groups/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Khách Hàng Hà Nội",
  "description": "Các khách hàng khu vực Hà Nội",
  "customers": ["65a1b2c3d4e5f6g7h8i9j0k1", "65a1b2c3d4e5f6g7h8i9j0k2"]
}

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Hà Nội",
    "description": "Các khách hàng khu vực Hà Nội",
    "customers": [
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k1", "name": "Công Ty ABC", "code": "ABC001" },
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k2", "name": "Công Ty XYZ", "code": "XYZ001" }
    ],
    "createdBy": "65a1b2c3d4e5f6g7h8i9j0k9",
    "isActive": true,
    "createdAt": "2026-11-10T10:30:00Z",
    "updatedAt": "2026-11-10T10:30:00Z"
  }
}
```

### Kịch Bản 2: Thêm Khách Hàng Vào Nhóm Hiện Có
Bạn muốn thêm một khách hàng mới vào nhóm "Khách Hàng Hà Nội".

```javascript
// Request
POST /api/customers/groups/65a1b2c3d4e5f6g7h8i9j0k0/add-customer
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "65a1b2c3d4e5f6g7h8i9j0k3"
}

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Hà Nội",
    "description": "Các khách hàng khu vực Hà Nội",
    "customers": [
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k1", "name": "Công Ty ABC", "code": "ABC001" },
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k2", "name": "Công Ty XYZ", "code": "XYZ001" },
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k3", "name": "Công Ty DEF", "code": "DEF001" }
    ],
    ...
  }
}
```

### Kịch Bản 3: Xóa Khách Hàng Khỏi Nhóm
Bạn muốn xóa một khách hàng khỏi nhóm.

```javascript
// Request
POST /api/customers/groups/65a1b2c3d4e5f6g7h8i9j0k0/remove-customer
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "65a1b2c3d4e5f6g7h8i9j0k2"
}

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Hà Nội",
    "customers": [
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k1", "name": "Công Ty ABC", "code": "ABC001" },
      { "_id": "65a1b2c3d4e5f6g7h8i9j0k3", "name": "Công Ty DEF", "code": "DEF001" }
    ],
    ...
  }
}
```

### Kịch Bản 4: Lấy Danh Sách Nhóm Khách Hàng
Bạn muốn xem danh sách tất cả các nhóm khách hàng.

```javascript
// Request
GET /api/customers/groups/list?page=1&limit=50&q=Hà%20Nội
Authorization: Bearer <token>

// Response
{
  "success": true,
  "data": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
      "name": "Khách Hàng Hà Nội",
      "description": "Các khách hàng khu vực Hà Nội",
      "customers": [
        { "_id": "65a1b2c3d4e5f6g7h8i9j0k1", "name": "Công Ty ABC", "code": "ABC001" },
        { "_id": "65a1b2c3d4e5f6g7h8i9j0k3", "name": "Công Ty DEF", "code": "DEF001" }
      ],
      "createdBy": { "_id": "65a1b2c3d4e5f6g7h8i9j0k9", "name": "Admin User" },
      "isActive": true,
      "createdAt": "2026-11-10T10:30:00Z",
      "updatedAt": "2026-11-10T10:30:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### Kịch Bản 5: Lấy Chi Tiết Nhóm
Bạn muốn xem thông tin chi tiết của một nhóm.

```javascript
// Request
GET /api/customers/groups/65a1b2c3d4e5f6g7h8i9j0k0
Authorization: Bearer <token>

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Hà Nội",
    "description": "Các khách hàng khu vực Hà Nội",
    "customers": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "code": "ABC001",
        "name": "Công Ty ABC",
        "phone": "0243123456",
        "email": "contact@abc.com",
        "mst": "0101234567",
        "company": "Công Ty TNHH ABC",
        "deliveryAddress": "Hà Nội"
      },
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
        "code": "DEF001",
        "name": "Công Ty DEF",
        "phone": "0243654321",
        "email": "contact@def.com",
        "mst": "0101234568",
        "company": "Công Ty TNHH DEF",
        "deliveryAddress": "Hà Nội"
      }
    ],
    "createdBy": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k9",
      "name": "Admin User",
      "email": "admin@company.com"
    },
    "isActive": true,
    "createdAt": "2026-11-10T10:30:00Z",
    "updatedAt": "2026-11-10T10:30:00Z"
  }
}
```

### Kịch Bản 6: Cập Nhật Thông Tin Nhóm
Bạn muốn thay đổi tên hoặc mô tả của nhóm, hoặc thay đổi hoàn toàn danh sách khách hàng.

```javascript
// Request
PUT /api/customers/groups/65a1b2c3d4e5f6g7h8i9j0k0
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Khách Hàng Khu Vực Hà Nội",
  "description": "Các khách hàng tiềm năng khu vực Hà Nội",
  "customers": ["65a1b2c3d4e5f6g7h8i9j0k1", "65a1b2c3d4e5f6g7h8i9j0k3"]
}

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Khu Vực Hà Nội",
    "description": "Các khách hàng tiềm năng khu vực Hà Nội",
    "customers": [...],
    ...
  }
}
```

### Kịch Bản 7: Lấy Nhóm Của Một Khách Hàng
Bạn muốn biết khách hàng này thuộc nhóm nào.

```javascript
// Request
GET /api/customers/65a1b2c3d4e5f6g7h8i9j0k1/groups
Authorization: Bearer <token>

// Response
{
  "success": true,
  "data": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
      "name": "Khách Hàng Khu Vực Hà Nội",
      "description": "Các khách hàng tiềm năng khu vực Hà Nội",
      "customers": [...],
      "createdBy": { "_id": "...", "name": "Admin User" },
      "isActive": true,
      "createdAt": "2026-11-10T10:30:00Z",
      "updatedAt": "2026-11-10T10:30:00Z"
    }
  ]
}
```

### Kịch Bản 8: Xóa Nhóm Khách Hàng
Bạn muốn xóa một nhóm (soft delete - dữ liệu vẫn được lưu giữ).

```javascript
// Request
DELETE /api/customers/groups/65a1b2c3d4e5f6g7h8i9j0k0
Authorization: Bearer <token>

// Response
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Khu Vực Hà Nội",
    "isActive": false,
    ...
  }
}
```

## Lưu Ý Quan Trọng

1. **Soft Delete**: Khi xóa nhóm, dữ liệu không bị xóa vĩnh viễn mà chỉ đánh dấu là không hoạt động. Nếu cần, admin có thể khôi phục.

2. **Quyền Truy Cập**:
   - Xem nhóm: Cần quyền `view_customers`
   - Quản lý nhóm: Cần quyền `manage_customers`

3. **Validate Dữ Liệu**:
   - Tên nhóm phải không rỗng
   - Khách hàng thêm vào phải tồn tại và đang hoạt động
   - Nhóm phải đang hoạt động

4. **Populate Tự Động**:
   - Khi lấy danh sách khách hàng, nhóm của họ sẽ được trả về kèm theo
   - Thông tin khách hàng trong nhóm sẽ bao gồm tên, mã khách hàng và đầy đủ thông tin khi chi tiết

## Cách Tích Hợp Vào Giao Diện

### Hiển Thị Nhóm Trên Danh Sách Khách Hàng
Khi lấy danh sách khách hàng thông qua `GET /api/customers/`, mỗi khách hàng sẽ có trường `customerGroup`:

```javascript
{
  "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
  "code": "ABC001",
  "name": "Công Ty ABC",
  "phone": "0243123456",
  "email": "contact@abc.com",
  "customerGroup": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k0",
    "name": "Khách Hàng Khu Vực Hà Nội"
  },
  ...
}
```

### Chọn Nhóm Khi Tạo/Sửa Khách Hàng
Khi tạo hoặc sửa khách hàng, bạn có thể truyền `customerGroup`:

```javascript
// Tạo khách hàng và gán vào nhóm
POST /api/customers/create
{
  "code": "ABC001",
  "name": "Công Ty ABC",
  "phone": "0243123456",
  "customerGroup": "65a1b2c3d4e5f6g7h8i9j0k0",  // ID của nhóm
  ...
}

// Cập nhật khách hàng - thay đổi nhóm
PUT /api/customers/update/65a1b2c3d4e5f6g7h8i9j0k1
{
  "customerGroup": "65a1b2c3d4e5f6g7h8i9j0k5"  // Gán sang nhóm khác
}
```

## Thường Gặp

### Lỗi: "Nhóm khách hàng không tồn tại"
- Kiểm tra ID nhóm có đúng không
- Kiểm tra nhóm có bị xóa không (isActive = false)

### Lỗi: "ID khách hàng không hợp lệ"
- Kiểm tra ID khách hàng có đúng định dạng ObjectId không
- Kiểm tra khách hàng có tồn tại không

### Lỗi: "Tên nhóm không được để trống"
- Tên nhóm phải có ít nhất 1 ký tự (không phải khoảng trắng)

## Ví Dụ Code JavaScript/cURL

### cURL - Tạo Nhóm
```bash
curl -X POST http://localhost:5000/api/customers/groups/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nhóm Test",
    "description": "Nhóm test API",
    "customers": []
  }'
```

### JavaScript/Fetch - Thêm Khách Hàng Vào Nhóm
```javascript
const groupId = "65a1b2c3d4e5f6g7h8i9j0k0";
const customerId = "65a1b2c3d4e5f6g7h8i9j0k3";

fetch(`/api/customers/groups/${groupId}/add-customer`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ customerId })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      console.log('Khách hàng đã được thêm vào nhóm');
      console.log(data.data);
    } else {
      console.error('Lỗi:', data.message);
    }
  });
```

### JavaScript/Fetch - Lấy Danh Sách Nhóm
```javascript
fetch('/api/customers/groups/list?page=1&limit=50', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
  .then(res => res.json())
  .then(data => {
    console.log('Danh sách nhóm:', data.data);
    console.log('Tổng cộng:', data.meta.total, 'nhóm');
  });
```
