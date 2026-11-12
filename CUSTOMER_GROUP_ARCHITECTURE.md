# 🏗️ KIẾN TRÚC HỆ THỐNG - CHỨC NĂNG NHÓM KHÁCH HÀNG

## 📊 Sơ Đồ Kiến Trúc

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (HTML/JS)                     │
│                                                             │
│  Quản Lý Nhóm    │  Danh Sách Nhóm  │  Chi Tiết Nhóm       │
│  - Tạo nhóm     │  - Phân trang    │  - Thêm KH           │
│  - Sửa nhóm     │  - Tìm kiếm      │  - Xóa KH            │
│  - Xóa nhóm     │  - Sort          │  - Cập nhật          │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    ┌────────────────────┐
                    │   AUTHORIZATION    │
                    │  (middleware/auth) │
                    └────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      API ROUTES                             │
│                  (routes/customers.js)                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Quản Lý Nhóm:                                        │  │
│  │  GET    /groups/list/all                            │  │
│  │  GET    /groups/list                                │  │
│  │  GET    /groups/:groupId                            │  │
│  │  POST   /groups/create                              │  │
│  │  PUT    /groups/:groupId                            │  │
│  │  DELETE /groups/:groupId                            │  │
│  │                                                      │  │
│  │ Quản Lý Thành Viên:                                │  │
│  │  POST   /groups/:groupId/add-customer               │  │
│  │  POST   /groups/:groupId/remove-customer            │  │
│  │                                                      │  │
│  │ Tiện Ích:                                           │  │
│  │  GET    /:customerId/groups                         │  │
│  │                                                      │  │
│  │ Cập Nhật Endpoint Cũ (Populate Group):              │  │
│  │  GET    /all                                        │  │
│  │  GET    /                                           │  │
│  │  POST   /create                                     │  │
│  │  PUT    /update/:id                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    ┌────────────────────┐
                    │  CONTROLLERS       │
                    │  (Validation)      │
                    │  (Business Logic)  │
                    └────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                     MODELS (MongoDB)                        │
│                                                             │
│  ┌──────────────────────────────┐                          │
│  │    CustomerGroup (NEW)       │                          │
│  ├──────────────────────────────┤                          │
│  │ _id: ObjectId                │                          │
│  │ name: String (required)      │                          │
│  │ description: String          │                          │
│  │ customers: [ObjectId]────┐   │                          │
│  │ createdBy: ObjectId      │   │                          │
│  │ isActive: Boolean        │   │                          │
│  │ createdAt: Date          │   │                          │
│  │ updatedAt: Date          │   │                          │
│  │                          │   │                          │
│  │ Indexes:                 │   │                          │
│  │  - name + isActive       │   │                          │
│  │  - customers             │   │                          │
│  └──────────────────────────┘   │                          │
│                                  │                          │
│  ┌──────────────────────────────┐│                          │
│  │    Customer (UPDATED)        ││                          │
│  ├──────────────────────────────┤│                          │
│  │ _id: ObjectId                ││                          │
│  │ code: String                 ││                          │
│  │ name: String                 ││                          │
│  │ phone: String                ││                          │
│  │ ... (các trường khác)        ││                          │
│  │ customerGroup: ObjectId ◄────┤│ (NEW FIELD)             │
│  │ isActive: Boolean            ││                          │
│  │ createdAt: Date              ││                          │
│  │ updatedAt: Date              ││                          │
│  │                              ││                          │
│  │ Indexes:                     ││                          │
│  │  - name + isActive           ││                          │
│  │  - customerGroup (NEW)       ││                          │
│  └──────────────────────────────┘│                          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              MONGODB (COLLECTIONS)                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ CUSTOMERS (exists, updated)                         │  │
│  │  - Added index on customerGroup                     │  │
│  │  - Added field customerGroup                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ CUSTOMER_GROUPS (new)                               │  │
│  │  - Stores group information                         │  │
│  │  - References multiple customers                    │  │
│  │  - Created indexes for performance                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ USERS (unchanged)                                   │  │
│  │  - Referenced by createdBy in CustomerGroup        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Quy Trình Luồng Dữ Liệu

```
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │
       │ POST /api/customers/groups/create
       │ { name, description, customers }
       ↓
┌─────────────────────────┐
│ Authorization Check     │
│ - Token valid?          │
│ - Has manage_customers? │
└──────┬──────────────────┘
       │
       ↓
┌─────────────────────────┐
│ Validation              │
│ - Name not empty?       │
│ - Customer IDs valid?   │
│ - Customers exist?      │
│ - Customers active?     │
└──────┬──────────────────┘
       │
       ↓
┌─────────────────────────┐
│ Create Group            │
│ CustomerGroup.create()  │
└──────┬──────────────────┘
       │
       ↓
┌─────────────────────────┐
│ Save to MongoDB         │
│ CUSTOMER_GROUPS         │
└──────┬──────────────────┘
       │
       ↓
┌─────────────────────────┐
│ Populate & Return       │
│ - customers info        │
│ - createdBy info        │
└──────┬──────────────────┘
       │
       ↓
┌─────────────┐
│  Response   │
│  JSON data  │
└─────────────┘
```

## 📋 Quy Trình Kết Nối Khách Hàng Thành Group

```
Step 1: Tạo Group
┌──────────────────────┐
│ POST /groups/create  │
│ Body: { name, ... }  │
└──────────┬───────────┘
           ↓
    Create in DB
           ↓
    Return groupId
     (e.g., "65a1b2c3...")

Step 2: Thêm Khách Hàng Vào Group
┌────────────────────────────────────┐
│ POST /groups/{groupId}/add-customer │
│ Body: { customerId: "..." }         │
└──────────┬───────────────────────────┘
           ↓
    Get Group từ DB
           ↓
    Validate Customer exists
           ↓
    $addToSet customer vào array
    (không trùng)
           ↓
    Save to DB
           ↓
    Return updated Group

Step 3: Xem Thành Viên Group
┌─────────────────────────┐
│ GET /groups/{groupId}   │
└──────────┬──────────────┘
           ↓
    Get Group từ DB
           ↓
    Populate customers
    (lấy thông tin đầy đủ)
           ↓
    Return Group with members

Step 4: Xóa Khách Hàng Khỏi Group
┌────────────────────────────────────┐
│ POST /groups/{groupId}/remove-customer │
│ Body: { customerId: "..." }         │
└──────────┬───────────────────────────┘
           ↓
    Get Group từ DB
           ↓
    $pull customer từ array
           ↓
    Save to DB
           ↓
    Return updated Group
```

## 🔐 Quy Trình Bảo Mật & Phân Quyền

```
Request đến API
        ↓
   ┌────────────────────────────┐
   │ requireAuth Middleware     │
   │ - Check token hợp lệ?      │
   │ - Decode user info?        │
   │ - Store req.user           │
   └────────┬───────────────────┘
            ↓
       Token hợp lệ?
        /          \
      Yes          No → Error 401
       │             Unauthorized
       ↓
   ┌────────────────────────────┐
   │ requirePermission           │
   │ Middleware                  │
   │ - Check 'view_customers'    │
   │  hoặc 'manage_customers'    │
   │ - User có quyền?            │
   └────────┬───────────────────┘
            ↓
       Có quyền?
        /      \
      Yes      No → Error 403
       │        Forbidden
       ↓
   Execute Handler
       ↓
   Return Response
```

## 📦 Dependencies

```
✅ mongoose          - MongoDB ODM (đã có)
✅ express          - Framework (đã có)
✅ middleware/auth  - Xác thực (đã có)
```

**Không cần cài thêm package nào!**

## 🎯 Giá Trị Thêm

```
Customer A ──┐
             ├─→ Group "Hà Nội"
Customer B ──┘

Customer C ──┐
             ├─→ Group "TP.HCM"
Customer D ──┘
```

**Lợi Ích:**
- ✅ Quản lý khách hàng liên quan
- ✅ Tạo chiến dịch theo group
- ✅ Phân tích dữ liệu theo nhóm
- ✅ Dễ phối hợp xử lý các KH trong 1 group

---

**Hình ảnh này giúp hiểu rõ kiến trúc hệ thống!** 📊
