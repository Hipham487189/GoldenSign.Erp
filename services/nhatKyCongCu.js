const AuditLog = require('../models/AuditLog');
const { CONG_CU: congCu, duocDungCongCu } = require('./permissionRegistry');

function congCuDuocPhep(vaiTro) {
  return Object.keys(congCu).filter(ma => duocDungCongCu(vaiTro, ma));
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
