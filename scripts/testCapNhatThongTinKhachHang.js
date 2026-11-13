const assert = require('assert');
const express = require('express');
const Customer = require('../models/Customer');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');
const router = require('../routes/giao-nhan');

const maPhieu = '111111111111111111111111';
const maPhieuNgoai = '222222222222222222222222';
const maPhieuKhac = '333333333333333333333333';
const maKhach = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const maKhachKhac = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const phieu = { _id: maPhieu, tenNhanVienTimKiem: 'an', 'TÊN KHÁCH HÀNG': 'Khách khác', 'SỐ ĐIỆN THOẠI': '0901234567', 'ĐỊA CHỈ NGƯỜI NHẬN': 'Địa chỉ thử' };
const phieuKhac = { _id: maPhieuKhac, tenNhanVienTimKiem: 'an', 'TÊN KHÁCH HÀNG': 'Khách khác', 'SỐ ĐIỆN THOẠI': '0912345678', 'ĐỊA CHỈ NGƯỜI NHẬN': 'Địa chỉ khác' };
const duLieuKhach = [
  { _id: maKhach, code: 'KH01', name: 'Khách thử', phone: '', deliveryAddress: 'Địa chỉ cũ', isActive: true },
  { _id: maKhachKhac, code: 'KH02', name: 'Khách khác', phone: '', deliveryAddress: '', isActive: true }
];
let quyen = ['view_orders', 'view_customers', 'manage_customers'];
let soLanGhi = 0;
let giaLapXungDot = false;
let giaLapDoiTen = false;
let nhieuKhachTrungTen = false;
let nhomDaThayDoi = false;
let tenNhanVien = 'An';
let phamViTatCa = false;
const goc = { customerFind: Customer.find, customerUpdate: Customer.updateOne, customerAggregate: Customer.aggregate, phieuFind: ChuyenPhatNhanh.find, phieuAggregate: ChuyenPhatNhanh.aggregate, userFind: User.findById, roleFind: Role.findById, auditCreate: AuditLog.create };
const chuoi = duLieu => ({
  select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, populate() { return this; },
  async lean() { return duLieu; }
});

async function kiemTra() {
  const nhatKy = [];
  AuditLog.create = async item => { nhatKy.push(item); };
  assert.strictEqual(Customer.schema.path('capNhatTuGiaoNhan').options.select, false);
  Role.findById = () => chuoi({ permissions: quyen });
  User.findById = () => chuoi({
    roleId: { name: phamViTatCa ? 'Quản lý' : 'Nhân Viên', dataScopes: { orders: phamViTatCa ? 'all' : 'own' } },
    employeeId: { name: tenNhanVien }
  });
  ChuyenPhatNhanh.find = boLoc => {
    if (boLoc.$or) {
      assert.deepStrictEqual(boLoc, { $or: [{ tenNhanVienTimKiem: 'an' }, { nhanVienThucHienTimKiem: 'an' }] });
      return chuoi(Array.from({ length: 51 }, () => ({ ...phieu })));
    }
    assert.deepStrictEqual(boLoc.$and[0], { $or: [{ tenNhanVienTimKiem: 'an' }, { nhanVienThucHienTimKiem: 'an' }] });
    return chuoi([phieu, phieuKhac].filter(item => boLoc.$and[1]._id.$in.includes(item._id)).map(item => ({ ...item })));
  };
  ChuyenPhatNhanh.aggregate = quyTrinh => {
    assert.deepStrictEqual(quyTrinh[0].$match, phamViTatCa ? {} : { $or: [{ tenNhanVienTimKiem: 'an' }, { nhanVienThucHienTimKiem: 'an' }] });
    const laNhom = quyTrinh.some(buoc => buoc.$lookup);
    if (laNhom) {
      const lookup = quyTrinh.find(buoc => buoc.$lookup).$lookup;
      assert.strictEqual(lookup.pipeline[lookup.pipeline.length - 1].$limit, 2);
      assert.ok(quyTrinh.some(buoc => buoc.$group?.phoneMin && buoc.$group?.phoneMax));
      if (quyTrinh.some(buoc => buoc.$skip !== undefined)) {
        const viTriLoc = quyTrinh.findIndex(buoc => buoc.$match?.$or?.some(item => item['khachHang.1']));
        assert.ok(viTriLoc > 0 && viTriLoc < quyTrinh.findIndex(buoc => buoc.$skip !== undefined));
        if (phamViTatCa) assert.strictEqual(quyTrinh[viTriLoc].$match.$or.length, 2);
        else assert.deepStrictEqual(quyTrinh[viTriLoc].$match.$or[2]._phieuDaCapNhat.$not.$elemMatch,
          { $or: [{ tenNhanVienTimKiem: 'an' }, { nhanVienThucHienTimKiem: 'an' }] });
      }
    } else {
      assert.ok(quyTrinh.some(buoc => buoc.$limit === 21));
    }
    let duLieu = laNhom ? [{
      _id: 'Khách khác', soPhieu: 2,
      phoneMin: { giaTri: phieu['SỐ ĐIỆN THOẠI'], maPhieu },
      phoneMax: { giaTri: nhomDaThayDoi ? '0999999999' : phieuKhac['SỐ ĐIỆN THOẠI'], maPhieu: maPhieuKhac },
      deliveryAddressMin: { giaTri: phieuKhac['ĐỊA CHỈ NGƯỜI NHẬN'], maPhieu: maPhieuKhac },
      deliveryAddressMax: { giaTri: phieu['ĐỊA CHỈ NGƯỜI NHẬN'], maPhieu },
      khachHang: nhieuKhachTrungTen ? [{ ...duLieuKhach[1] }, { _id: maKhach, name: 'Khách khác' }] : [{ ...duLieuKhach[1] }]
    }] : [{ _id: phieu['SỐ ĐIỆN THOẠI'], maPhieu, soPhieu: 1 }, { _id: phieuKhac['SỐ ĐIỆN THOẠI'], maPhieu: maPhieuKhac, soPhieu: 1 }];
    if (laNhom && quyTrinh.some(buoc => buoc.$skip !== undefined) && duLieuKhach[1].capNhatTuGiaoNhan?.lucCapNhat && !nhieuKhachTrungTen) duLieu = [];
    return {
      collation(tuyChon) { assert.deepStrictEqual(tuyChon, { locale: 'simple' }); return this; },
      allowDiskUse(giaTri) { assert.strictEqual(giaTri, true); return this; },
      async option(tuyChon) { assert.strictEqual(tuyChon.maxTimeMS, 15000); return duLieu; }
    };
  };
  Customer.find = boLoc => chuoi(boLoc.$or ? duLieuKhach.map(item => ({ ...item })) :
    duLieuKhach.filter(item => boLoc._id.$in.includes(item._id)).map(item => ({ ...item })));
  Customer.aggregate = quyTrinh => {
    const buocPhamVi = quyTrinh.find(buoc => buoc.$match?._phieuDaCapNhat);
    const ten = tenNhanVien.toLowerCase();
    if (phamViTatCa) assert.strictEqual(buocPhamVi, undefined);
    else {
      assert.deepStrictEqual(buocPhamVi.$match._phieuDaCapNhat.$elemMatch, { $or: [{ tenNhanVienTimKiem: ten }, { nhanVienThucHienTimKiem: ten }] });
      assert.ok(quyTrinh.findIndex(buoc => buoc.$match?._phieuDaCapNhat) < quyTrinh.findIndex(buoc => buoc.$skip !== undefined));
    }
    const gioiHan = quyTrinh.find(buoc => buoc.$limit).$limit;
    const tuKhoa = quyTrinh[0].$match.$or?.[0]?.name;
    const duLieu = duLieuKhach.filter(item => {
      const danhDau = item.capNhatTuGiaoNhan;
      if (!danhDau?.lucCapNhat || (tuKhoa && !tuKhoa.test(item.name) && !tuKhoa.test(item.code))) return false;
      const cacMa = [danhDau.soDienThoai?.maPhieu, danhDau.diaChi?.maPhieu];
      return phamViTatCa || [phieu, phieuKhac].some(nguon => cacMa.includes(nguon._id) && nguon.tenNhanVienTimKiem === ten);
    }).map(item => ({
      _id: item._id, name: item.name, code: item.code, phone: item.phone,
      deliveryAddress: item.deliveryAddress, lucCapNhat: item.capNhatTuGiaoNhan.lucCapNhat
    })).slice(0, gioiHan);
    return { allowDiskUse() { return this; }, async option() { return duLieu; } };
  };
  Customer.updateOne = async (boLoc, capNhat) => {
    soLanGhi++;
    const khach = duLieuKhach.find(item => item._id === boLoc._id);
    if (giaLapXungDot) khach.phone = '0999999999';
    if (giaLapDoiTen) khach.name = 'Tên mới';
    const trung = khach && (!boLoc.name || khach.name === boLoc.name)
      && Object.keys(capNhat.$set).filter(cot => !cot.startsWith('capNhatTuGiaoNhan.'))
        .every(cot => (khach[cot] ?? null) === boLoc[cot]);
    if (!trung) return { matchedCount: 0 };
    Object.entries(capNhat.$set).forEach(([cot, giaTri]) => {
      const cacPhan = cot.split('.');
      let noiLuu = khach;
      cacPhan.slice(0, -1).forEach(phan => { if (!noiLuu[phan]) noiLuu[phan] = {}; noiLuu = noiLuu[phan]; });
      noiLuu[cacPhan[cacPhan.length - 1]] = giaTri;
    });
    return { matchedCount: 1 };
  };
  const app = express();
  app.use(express.json(), (req, res, next) => { req.auth = { userId: 'user', roleId: 'role' }; next(); });
  app.use('/api/giao-nhan', router);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const diaChi = `http://127.0.0.1:${server.address().port}/api/giao-nhan`;
  const goi = async (path, body) => {
    const res = await fetch(diaChi + path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };
  const muc = {
    maGiaoNhan: maPhieu, maKhachHang: maKhach, truong: ['phone'],
    daXem: { phone: { cu: '', nguon: phieu['SỐ ĐIỆN THOẠI'] }, deliveryAddress: { cu: 'Địa chỉ cũ', nguon: phieu['ĐỊA CHỈ NGƯỜI NHẬN'] } }
  };
  const capNhat = danhSach => goi('/cap-nhat-thong-tin-khach-hang', { xacNhan: true, danhSach });
  try {
    quyen = ['view_orders', 'view_customers'];
    assert.strictEqual((await capNhat([muc])).status, 403);
    assert.strictEqual((await goi('/khach-hang-goi-y?q=Kh')).status, 403);
    assert.strictEqual((await goi('/nhom-cap-nhat-khach-hang')).status, 403);
    assert.strictEqual((await goi('/khach-hang-da-cap-nhat')).status, 403);
    quyen = ['view_orders', 'view_customers', 'manage_customers'];
    assert.strictEqual((await goi('/khach-hang-goi-y?q=x')).status, 400);
    assert.strictEqual((await goi('/khach-hang-goi-y?q=Kh')).body.data.length, 2);
    const trang = (await goi('/phieu-cap-nhat-khach-hang?limit=999')).body;
    assert.strictEqual(trang.limit, 50);
    assert.strictEqual(trang.items.length, 50);
    assert.strictEqual(trang.hasMore, true);
    const goiY = await goi('/nhom-cap-nhat-khach-hang?limit=999');
    assert.strictEqual(goiY.body.limit, 50);
    assert.strictEqual(goiY.body.items[0].soPhieu, 2);
    assert.strictEqual(goiY.body.items[0].khachHang[0]._id, maKhachKhac);
    assert.strictEqual((await goi('/gia-tri-khach-hang?ten=Kh%C3%A1ch%20kh%C3%A1c&truong=mst')).status, 400);
    assert.strictEqual((await goi('/gia-tri-khach-hang?ten=Kh%C3%A1ch%20kh%C3%A1c&truong=phone')).body.items.length, 2);
    assert.strictEqual((await goi('/khach-hang-da-cap-nhat')).body.items.length, 0);
    assert.strictEqual((await goi('/cap-nhat-thong-tin-khach-hang', { danhSach: [muc] })).status, 400);
    assert.strictEqual((await capNhat([muc, muc])).status, 400);
    assert.strictEqual((await capNhat([{ ...muc, truong: ['mst'] }])).status, 400);
    assert.strictEqual((await capNhat([{ ...muc, maGiaoNhan: maPhieuNgoai }])).body.data[0].success, false);
    assert.strictEqual((await capNhat([{ ...muc, daXem: { ...muc.daXem, phone: { cu: '', nguon: 'cũ' } } }])).body.data[0].success, false);
    assert.strictEqual((await capNhat([{ ...muc, truong: ['deliveryAddress'] }])).body.data[0].success, false);
    assert.strictEqual(soLanGhi, 0);
    assert.strictEqual(duLieuKhach[0].capNhatTuGiaoNhan, undefined);
    giaLapXungDot = true;
    assert.strictEqual((await capNhat([muc])).body.data[0].success, false);
    assert.strictEqual(duLieuKhach[0].capNhatTuGiaoNhan, undefined);
    giaLapXungDot = false;
    duLieuKhach[0].phone = '';
    const mucKhac = {
      ...muc, maKhachHang: maKhachKhac, truong: ['deliveryAddress'],
      daXem: { ...muc.daXem, deliveryAddress: { cu: '', nguon: phieu['ĐỊA CHỈ NGƯỜI NHẬN'] } }
    };
    const hangLoat = await capNhat([muc, mucKhac]);
    assert.deepStrictEqual(hangLoat.body.data.map(item => item.success), [true, true]);
    assert.strictEqual(nhatKy.length, 1);
    assert.strictEqual(nhatKy[0].module, 'cong-cu:cap-nhat-khach-hang');
    assert.strictEqual(nhatKy[0].after.soLuong, 2);
    assert.strictEqual(duLieuKhach[1].deliveryAddress, phieu['ĐỊA CHỈ NGƯỜI NHẬN']);
    assert.strictEqual(duLieuKhach[0].capNhatTuGiaoNhan.soDienThoai.maPhieu, maPhieu);
    assert.strictEqual(duLieuKhach[0].capNhatTuGiaoNhan.diaChi, undefined);
    assert.strictEqual(duLieuKhach[1].capNhatTuGiaoNhan.diaChi.maPhieu, maPhieu);
    assert.ok(duLieuKhach[0].capNhatTuGiaoNhan.lucCapNhat instanceof Date);
    const daCapNhat = await goi('/khach-hang-da-cap-nhat?limit=999');
    assert.strictEqual(daCapNhat.body.limit, 50);
    assert.strictEqual(daCapNhat.body.items.length, 2);
    assert.strictEqual(daCapNhat.body.items[0].capNhatTuGiaoNhan, undefined);
    assert.strictEqual((await goi('/khach-hang-da-cap-nhat?q=KH02')).body.items.length, 1);
    assert.strictEqual((await goi('/nhom-cap-nhat-khach-hang')).body.items.length, 0);
    tenNhanVien = 'Binh';
    assert.strictEqual((await goi('/khach-hang-da-cap-nhat')).body.items.length, 0);
    tenNhanVien = 'An';
    phamViTatCa = true;
    assert.strictEqual((await goi('/khach-hang-da-cap-nhat')).body.items.length, 2);
    assert.strictEqual((await goi('/nhom-cap-nhat-khach-hang')).body.items.length, 0);
    phamViTatCa = false;
    duLieuKhach[0].phone = '';
    duLieuKhach[1].deliveryAddress = '';
    const mucTheoNhom = {
      maKhachHang: maKhachKhac, truong: ['phone', 'deliveryAddress'],
      maPhieuTheoTruong: { phone: maPhieu, deliveryAddress: maPhieuKhac },
      daXem: { phone: { cu: '', nguon: phieu['SỐ ĐIỆN THOẠI'] }, deliveryAddress: { cu: '', nguon: phieuKhac['ĐỊA CHỈ NGƯỜI NHẬN'] } },
      nhom: { ten: 'Khách khác',
        phone: { min: phieu['SỐ ĐIỆN THOẠI'], max: phieuKhac['SỐ ĐIỆN THOẠI'] },
        deliveryAddress: { min: phieuKhac['ĐỊA CHỈ NGƯỜI NHẬN'], max: phieu['ĐỊA CHỈ NGƯỜI NHẬN'] } }
    };
    nhieuKhachTrungTen = true;
    assert.strictEqual((await capNhat([mucTheoNhom])).body.data[0].success, false);
    nhieuKhachTrungTen = false;
    nhomDaThayDoi = true;
    assert.strictEqual((await capNhat([mucTheoNhom])).body.data[0].success, false);
    nhomDaThayDoi = false;
    const ngoaiPhamVi = { ...mucTheoNhom, maPhieuTheoTruong: { phone: maPhieuNgoai, deliveryAddress: maPhieuKhac } };
    assert.strictEqual((await capNhat([ngoaiPhamVi])).body.data[0].success, false);
    giaLapDoiTen = true;
    assert.strictEqual((await capNhat([mucTheoNhom])).body.data[0].success, false);
    giaLapDoiTen = false;
    duLieuKhach[1].name = 'Khách khác';
    assert.strictEqual((await capNhat([mucTheoNhom])).body.data[0].success, true);
    assert.strictEqual(duLieuKhach[1].phone, phieu['SỐ ĐIỆN THOẠI']);
    assert.strictEqual(duLieuKhach[1].deliveryAddress, phieuKhac['ĐỊA CHỈ NGƯỜI NHẬN']);
    duLieuKhach[1].phone = '';
    duLieuKhach[1].deliveryAddress = '';
    assert.strictEqual((await capNhat([muc])).body.data[0].success, true);
    assert.strictEqual(duLieuKhach[0].phone, phieu['SỐ ĐIỆN THOẠI']);
    assert.strictEqual(duLieuKhach[0].deliveryAddress, 'Địa chỉ cũ');
    duLieuKhach[0].phone = '';
    giaLapXungDot = true;
    assert.strictEqual((await capNhat([muc])).body.data[0].success, false);
    assert.strictEqual(duLieuKhach[0].phone, '0999999999');
    giaLapXungDot = false;
    phieu['SỐ ĐIỆN THOẠI'] = '';
    const nguonRong = { ...muc, maKhachHang: maKhachKhac, daXem: { ...muc.daXem, phone: { cu: '', nguon: '' } } };
    assert.strictEqual((await capNhat([nguonRong])).body.data[0].success, false);
    assert.strictEqual(duLieuKhach[1].phone, '');
    console.log('Kiểm tra quyền, phạm vi, xác nhận, ô trống và xung đột đạt.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    Customer.find = goc.customerFind;
    Customer.updateOne = goc.customerUpdate;
    Customer.aggregate = goc.customerAggregate;
    ChuyenPhatNhanh.find = goc.phieuFind;
    ChuyenPhatNhanh.aggregate = goc.phieuAggregate;
    User.findById = goc.userFind;
    Role.findById = goc.roleFind;
    AuditLog.create = goc.auditCreate;
  }
}

kiemTra().catch(loi => { console.error(loi); process.exitCode = 1; });
