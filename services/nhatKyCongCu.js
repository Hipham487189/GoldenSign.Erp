const AuditLog = require('../models/AuditLog');

const congCu = {
  'nhap-ho-so': { ten: 'Nhập Hồ Sơ', quyen: ['manage_orders'] },
  'kiem-tra-cong-no': { ten: 'Kiểm Tra Công Nợ', quyen: ['view_debts'] },
  'thiet-lap-luong': { ten: 'Thiết Lập Lương', admin: true },
  'nhap-so-lieu': { ten: 'Nhập Số liệu', admin: true },
  'cap-nhat-khach-hang': { ten: 'Cập Nhật TT Khách hàng', quyen: ['view_orders', 'view_customers', 'manage_customers'] }
};

function congCuDuocPhep(vaiTro) {
  if (!vaiTro) return [];
  if (vaiTro.name === 'Admin') return Object.keys(congCu);
  return Object.keys(congCu).filter(ma => !congCu[ma].admin
    && congCu[ma].quyen.every(quyen => (vaiTro.permissions || []).includes(quyen)));
}

async function ghiNhatKy(req, ma, hanhDong, doiTuong = '', soLuong = null) {
  if (!congCu[ma]) throw new Error('Công cụ không hợp lệ.');
  await AuditLog.create({
    actorUserId: req.auth.userId,
    actorUsername: req.auth.username,
    module: `cong-cu:${ma}`,
    action: hanhDong,
    recordId: doiTuong,
    after: soLuong == null ? null : { soLuong }
  });
}

async function ghiSauCapNhat(req, res, ma, hanhDong, doiTuong = '', soLuong = null) {
  try {
    await ghiNhatKy(req, ma, hanhDong, doiTuong, soLuong);
  } catch (loi) {
    console.error('Không thể ghi nhật ký công cụ:', loi.message);
    res.set('X-Canh-Bao-Nhat-Ky', '1');
    res.append('Access-Control-Expose-Headers', 'X-Canh-Bao-Nhat-Ky');
  }
}

module.exports = { congCu, congCuDuocPhep, ghiNhatKy, ghiSauCapNhat };
