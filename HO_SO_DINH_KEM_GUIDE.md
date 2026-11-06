# 🎯 Hộ Số Định Kèm (HoSoDinhKem Component)

Một module JavaScript độc lập, tái sử dụng để quản lý upload nhiều file.

## ✨ Tính Năng

- ✅ **Nhanh** - Khởi tạo trong 3 dòng code
- ✅ **Dễ chỉnh sửa** - Cấu hình trường file qua config object
- ✅ **Module** - Có thể nhúng vào bất kỳ page nào
- ✅ **Responsive** - Tự động điều chỉnh layout (5 cột → 3 → 2 → 1)
- ✅ **Kiểm soát** - Kích thước file, định dạng, error handling
- ✅ **Dark/Light mode** - Tự động theo theme hiện tại

## 🚀 Sử Dụng Cơ Bản

### 1. Import script
```html
<script src="public/js/hoSoDinhKem.js"></script>
```

### 2. Tạo container
```html
<div id="hoSoDinhKemContainer"></div>
```

### 3. Khởi tạo
```javascript
const hoSo = new HoSoDinhKem('hoSoDinhKemContainer');
```

## ⚙️ Cấu Hình Nâng Cao

### Thêm/Sửa/Xóa trường file

```javascript
const config = {
  maxSize: 5 * 1024 * 1024, // Kích thước tối đa (byte)
  fields: [
    { 
      id: 'hopDong', 
      label: 'Hợp Đồng / GDK', 
      accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx' 
    },
    { 
      id: 'xacNhan', 
      label: 'Xác Nhận / BBBG', 
      accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx' 
    },
    { 
      id: 'gpkd', 
      label: 'GPKD', 
      accept: '.pdf,.jpg,.jpeg,.png' 
    },
    { 
      id: 'cccd', 
      label: 'CCCD', 
      accept: '.pdf,.jpg,.jpeg,.png' 
    },
    { 
      id: 'fileTong', 
      label: 'File tổng', 
      accept: '.rar,.zip' 
    }
  ],
  onFileChange: (fieldId, file) => console.log(`File ${fieldId}:`, file),
  onValidationError: (msg) => console.error('Lỗi:', msg)
};

const hoSo = new HoSoDinhKem('hoSoDinhKemContainer', config);
```

### Ví dụ: Thêm trường mới
```javascript
hoSo.addField({
  id: 'bienBan',
  label: 'Biên Bản Kiểm Kê',
  accept: '.pdf,.xlsx'
});
```

### Ví dụ: Xóa trường
```javascript
hoSo.removeField('fileTong');
```

## 📋 API Methods

### `getFiles()`
Lấy tất cả file đã chọn (object)
```javascript
const files = hoSo.getFiles();
// { hopDong: File, xacNhan: File, ... }
```

### `clear()`
Xóa tất cả file đã chọn
```javascript
hoSo.clear();
```

### `submit()`
Submit tất cả file lên API `/api/orders/upload-attachments`
```javascript
await hoSo.submit();
```

### `addField(field)`
Thêm trường file mới
```javascript
hoSo.addField({
  id: 'bangLuong',
  label: 'Bảng Lương',
  accept: '.xlsx,.pdf'
});
```

### `removeField(fieldId)`
Xóa trường file
```javascript
hoSo.removeField('bangLuong');
```

## 🎨 Tùy Biến Style

Component tự động thêm `<style id="hos-styles">` vào `<head>`. 

Để override CSS, dùng selector `.hos-*`:

```css
/* Thay đổi màu nút upload */
.hos-file-btn {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
}

/* Thay đổi layout (4 cột thay vì 5) */
.hos-grid {
  grid-template-columns: repeat(4, 1fr);
}

/* Responsive tùy chỉnh */
@media (max-width: 900px) {
  .hos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

## 🔄 Các Sự Kiện

### onFileChange callback
Gọi mỗi khi chọn file
```javascript
onFileChange: (fieldId, file) => {
  console.log(`Đã chọn file cho ${fieldId}`);
  console.log(`Tên: ${file.name}, Kích thước: ${file.size} bytes`);
}
```

### onValidationError callback
Gọi khi có lỗi validate
```javascript
onValidationError: (message) => {
  console.error('Lỗi:', message);
  // Hiển thị thông báo cho user
  showNotification(message, 'error');
}
```

## 📝 Ví Dụ Thực Tế

### Nhúng vào form tạo đơn hàng
```html
<div class="section-card">
  <div class="section-card-title">
    <i class="fa-solid fa-paperclip"></i> Hồ Sơ Đính Kèm
  </div>
  <div id="hoSoDinhKemContainer"></div>
</div>

<script src="public/js/hoSoDinhKem.js"></script>
<script>
  const hoSo = new HoSoDinhKem('hoSoDinhKemContainer', {
    onValidationError: (msg) => alert(`Lỗi: ${msg}`),
    onFileChange: (fieldId, file) => {
      console.log(`${fieldId}: ${file.name}`);
    }
  });

  // Sau khi form submit
  document.getElementById('submitBtn').addEventListener('click', async () => {
    const files = hoSo.getFiles();
    if (Object.values(files).some(f => f !== null)) {
      await hoSo.submit();
    }
  });
</script>
```

### Tích hợp với form lớn
```javascript
// Lấy tất cả file
const attachmentFiles = hoSo.getFiles();

// Tạo FormData
const formData = new FormData();
Object.entries(attachmentFiles).forEach(([key, file]) => {
  if (file) formData.append(key, file);
});

// Gửi cùng dữ liệu form khác
formData.append('maDon', orderCode);
formData.append('tenKH', customerName);

// POST lên API
const response = await fetch('/api/orders/create', {
  method: 'POST',
  body: formData,
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 🛠️ Troubleshooting

### Component không hiển thị
- Kiểm tra `id="hoSoDinhKemContainer"` có tồn tại trong HTML
- Kiểm tra `public/js/hoSoDinhKem.js` được tải đúng (F12 → Network)

### File input không nhận file
- Kiểm tra attribute `accept` trong trường cấu hình
- Kiểm tra kích thước file có vượt 5MB không

### Style không match
- Kiểm tra CSS variables (--text-main, --input-bg, etc.) được định nghĩa
- Kiểm tra không có CSS conflict với class `.hos-*`

### Error "Container not found"
```javascript
// Sai
new HoSoDinhKem('hoSoDinhKemContainer');
// HTML không có id này

// Đúng
// HTML: <div id="hoSoDinhKemContainer"></div>
new HoSoDinhKem('hoSoDinhKemContainer');
```

## 📦 Kích Thước File

- Minified: ~10KB
- Không phụ thuộc thư viện (vanilla JS)
- Hỗ trợ mọi trình duyệt hiện đại

## 🔐 Bảo Mật

- File được validate phía client trước upload
- Authorization header tự động từ localStorage
- CSRF protection phải xử lý ở backend

## 📄 License

Dự án nội bộ

---

**Được tạo bởi:** AI Assistant  
**Phiên bản:** 1.0.0  
**Cập nhật:** 2026-11-07
