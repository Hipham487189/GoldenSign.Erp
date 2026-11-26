const assert = require('node:assert/strict');
const { google } = require('googleapis');
const Order = require('../models/Order');
const SupplierPayment = require('../models/SupplierPayment');
const EmployeePayment = require('../models/EmployeePayment');
const ChuyenPhatNhanh = require('../models/ChuyenPhatNhanh');
const HoSo = require('../models/HoSo');

const {
  tinhThoiGianChoDen20Gio,
  dongBoTatCaLenGoogleSheet
} = require('../services/dongBoLenGoogleSheet');
const { syncBidirectional, pushOrderToSheet, isSheetToMongoEnabled } = require('../services/googleSheetSync');
const { syncThanhToan } = require('../services/thanhToanSheetSync');

async function kiemTraLich20Gio() {
  assert.equal(tinhThoiGianChoDen20Gio(new Date('2026-11-26T12:59:59.000Z')), 1000);
  assert.equal(tinhThoiGianChoDen20Gio(new Date('2026-11-26T13:00:00.000Z')), 86400000);
  assert.equal(tinhThoiGianChoDen20Gio(new Date('2026-11-26T13:00:01.000Z')), 86399000);
}

function taoMockQuery(duLieu) {
  return {
    select() { return this; },
    lean: async () => duLieu
  };
}

async function kiemTraDayCa4Bang() {
  const xacThucCu = google.auth.GoogleAuth;
  const sheetsCu = google.sheets;
  const orderFindCu = Order.find;
  const spFindCu = SupplierPayment.find;
  const epFindCu = EmployeePayment.find;
  const cpnFindCu = ChuyenPhatNhanh.find;
  const hoSoFindCu = HoSo.find;

  const orderBulkCu = Order.collection.bulkWrite;
  const spInsertCu = SupplierPayment.insertMany;
  const cpnBulkCu = ChuyenPhatNhanh.bulkWrite;

  let soLanGhiMongo = 0;
  Order.collection.bulkWrite = async () => { soLanGhiMongo++; };
  SupplierPayment.insertMany = async () => { soLanGhiMongo++; };
  ChuyenPhatNhanh.bulkWrite = async () => { soLanGhiMongo++; };

  const duLieuSheet = {
    'GS-DONHANG!1:1': [['STT', 'Mã Đơn Hàng', 'MST', 'Tên Khách Hàng', 'FILE ĐÍNH KÈM', 'Thực Đóng Cuối Cùng']],
    'GS-DONHANG!A:ZZ': [
      ['STT', 'Mã Đơn Hàng', 'MST', 'Tên Khách Hàng', 'FILE ĐÍNH KÈM', 'Thực Đóng Cuối Cùng'],
      ['1', 'DH01', '0123456789', 'Khách Cũ', 'giu-nguyen.pdf', '100000'],
      ['2', 'DH02', '0987654321', 'Không Đổi', '', '200000']
    ],
    'TTNCC!A:ZZ': [
      ['ID', 'NCC', 'Tháng Thanh Toán', 'Năm Thanh Toán', 'Số Tiền Thanh Toán', 'Ngày', 'Hình Thức Thanh Toán', 'Người Nhập', 'Ghi Chú', 'Hình Ảnh'],
      ['ncc-1', 'VNPT', '11', '2026', '500000', '11/26/2026', 'CK', 'Admin', 'Khớp ngày không ghi lại', 'img1.jpg']
    ],
    'TTNhanVien!A:ZZ': [
      ['ID', 'Tên Nhân Viên', 'Tháng', 'Năm Thanh Toán', 'Số Tiền Thanh Toán', 'Ngày', 'Hình Thức Thanh Toán', 'Người Nhập', 'Ghi Chú', 'Hình Ảnh']
    ],
    'ChuyenPhatNhanh!A:ZZ': [
      ['ID', 'TÊN CÔNG TY', 'SỐ ĐIỆN THOẠI'],
      ['GN001', 'Công ty A', '0901234567']
    ],
    'Hoso!A:ZZ': [
      ['ID', 'TÊN CÔNG TY', 'SDT NGƯỜI GỪI']
    ]
  };

  const ghiBatch = [];
  const moRongDong = [];

  try {
    Order.find = () => taoMockQuery([
      { _id: 'o1', STT: '1', 'Mã Đơn Hàng': 'DH01', MST: '123456789', 'Tên Khách Hàng': 'Khách Mới', 'FILE ĐÍNH KÈM': 'data:image/png;base64,AAA', 'THỰC CÔNG NỢ CTY': 150000 },
      { _id: 'o2', STT: '2', 'Mã Đơn Hàng': 'DH02', MST: '0987654321', 'Tên Khách Hàng': 'Không Đổi', 'THỰC CÔNG NỢ CTY': 200000 },
      { _id: 'o3', STT: '3', 'Mã Đơn Hàng': 'DH03', MST: '0111222333', 'Tên Khách Hàng': 'Đơn Web Mới', 'FILE ĐÍNH KÈM': 'x'.repeat(46000), 'THỰC CÔNG NỢ CTY': 300000 },
      { _id: 'o4', STT: '4', 'Mã Đơn Hàng': 'KL01', MST: '0111222333', 'Tên Khách Hàng': 'Đơn KL bỏ qua' }
    ]);
    SupplierPayment.find = () => taoMockQuery([
      { _id: 'sp1', maGoogleSheet: 'TTNCC:ncc-1', supplier: 'VNPT', paymentPeriod: '2026-11', amount: 500000, paymentDate: '2026-11-26', paymentMethod: 'CK', enteredBy: 'Admin', note: 'Khớp ngày không ghi lại', imageName: 'img1.jpg' },
      { _id: 'sp2', supplier: 'VIETTEL', paymentPeriod: '2026-11', amount: 250000, paymentDate: '2026-11-26', paymentMethod: 'TM', createdBy: 'WebUser', note: 'Phiếu web mới', imageName: 'data:image/png;base64,BBB' }
    ]);
    EmployeePayment.find = () => taoMockQuery([
      { _id: 'ep1', employee: 'Nguyễn Văn A', paymentPeriod: '2026-11', amount: 1200000, paymentDate: '2026-11-26', paymentMethod: 'CK', enteredBy: 'Admin', note: 'Lương' }
    ]);
    ChuyenPhatNhanh.find = () => taoMockQuery([
      { _id: 'gn1', maSheet: 'GN001', 'TÊN CÔNG TY': 'Công ty A (Sửa)', 'SỐ ĐIỆN THOẠI': '0901234567' }
    ]);
    HoSo.find = () => taoMockQuery([
      { _id: 'hs1', ID: 'HS001', 'TÊN CÔNG TY': 'Công ty Hồ Sơ', 'SDT NGƯỜI GỪI': '0912345678' }
    ]);

    google.auth.GoogleAuth = class { async getClient() { return {}; } };
    google.sheets = () => ({
      spreadsheets: {
        get: async ({ spreadsheetId }) => ({
          data: {
            sheets: [
              { properties: { sheetId: 1, title: 'GS-DONHANG', gridProperties: { rowCount: 3 } } },
              { properties: { sheetId: 2, title: 'TTNCC', gridProperties: { rowCount: 2 } } },
              { properties: { sheetId: 3, title: 'TTNhanVien', gridProperties: { rowCount: 1 } } },
              { properties: { sheetId: 4, title: 'ChuyenPhatNhanh', gridProperties: { rowCount: 2 } } },
              { properties: { sheetId: 5, title: 'Hoso', gridProperties: { rowCount: 1 } } }
            ]
          }
        }),
        batchUpdate: async ({ spreadsheetId, requestBody }) => {
          moRongDong.push({ spreadsheetId, requests: requestBody.requests });
        },
        values: {
          get: async ({ range }) => ({ data: { values: duLieuSheet[range] || [] } }),
          batchUpdate: async ({ spreadsheetId, requestBody }) => {
            ghiBatch.push({ spreadsheetId, data: requestBody.data });
          }
        }
      }
    });

    const ketQua = await dongBoTatCaLenGoogleSheet();
    assert.equal(ketQua.status, 'success');
    assert.equal(ketQua.direction, 'mongo-to-sheet');
    assert.equal(ketQua.tables.donHang.updated, 1);
    assert.equal(ketQua.tables.donHang.appended, 1);
    assert.equal(ketQua.tables.donHang.skippedUnchanged, 1);
    assert.equal(ketQua.tables.donHang.total, 3); // KL01 bị bỏ qua
    assert.equal(ketQua.tables.thanhToan.updated, 0);
    assert.equal(ketQua.tables.thanhToan.appended, 2);
    assert.equal(ketQua.tables.thanhToan.skippedUnchanged, 1);
    assert.equal(ketQua.tables.giaoNhan.updated, 1);
    assert.equal(ketQua.tables.hoSo.appended, 1);
    assert.ok(moRongDong.length >= 3, 'Phải tự mở rộng dòng khi vượt rowCount');

    const tatCaDongGhi = ghiBatch.flatMap(b => b.data);
    const dongDh01 = tatCaDongGhi.find(d => d.range === 'GS-DONHANG!A2:F2');
    assert.ok(dongDh01, 'Phải cập nhật dòng DH01');
    assert.equal(dongDh01.values[0][2], "'0123456789");
    assert.equal(dongDh01.values[0][4], 'giu-nguyen.pdf', 'Không ghi đè cột file bằng base64');
    assert.equal(dongDh01.values[0][5], '150000');

    const dongDh03 = tatCaDongGhi.find(d => d.range === 'GS-DONHANG!A4:F4');
    assert.ok(dongDh03, 'Phải thêm dòng mới DH03');
    assert.equal(dongDh03.values[0][4], '', 'Không đẩy chuỗi > 45.000 ký tự');

    const dongSp2 = tatCaDongGhi.find(d => d.range === 'TTNCC!A3:J3');
    assert.ok(dongSp2, 'Phải thêm phiếu thanh toán web mới dùng _id làm ID');
    assert.equal(dongSp2.values[0][0], 'sp2');
    assert.equal(dongSp2.values[0][9], '', 'Không đẩy chuỗi ảnh base64');

    const dongHs1 = tatCaDongGhi.find(d => d.range === 'Hoso!A2:C2');
    assert.ok(dongHs1, 'Phải thêm dòng hồ sơ mới');
    assert.equal(dongHs1.values[0][2], "'0912345678");

    // Kiểm tra ngắt chiều Sheet -> MongoDB
    assert.equal(isSheetToMongoEnabled(), false);
    assert.equal((await pushOrderToSheet('o1')).reason, 'scheduled-daily-20h-only');
    assert.equal((await syncThanhToan()).reason, 'sheet-to-mongo-disabled');
    const kqDon = await syncBidirectional();
    assert.equal(kqDon.pulled.reason, 'sheet-to-mongo-disabled');
    assert.equal(soLanGhiMongo, 0, 'Tuyệt đối không được ghi ngược từ Sheet vào MongoDB');
  } finally {
    google.auth.GoogleAuth = xacThucCu;
    google.sheets = sheetsCu;
    Order.find = orderFindCu;
    SupplierPayment.find = spFindCu;
    EmployeePayment.find = epFindCu;
    ChuyenPhatNhanh.find = cpnFindCu;
    HoSo.find = hoSoFindCu;
    Order.collection.bulkWrite = orderBulkCu;
    SupplierPayment.insertMany = spInsertCu;
    ChuyenPhatNhanh.bulkWrite = cpnBulkCu;
  }
}

async function kiemTraCoLapLoi() {
  const xacThucCu = google.auth.GoogleAuth;
  const sheetsCu = google.sheets;
  const orderFindCu = Order.find;
  const spFindCu = SupplierPayment.find;
  const epFindCu = EmployeePayment.find;
  const cpnFindCu = ChuyenPhatNhanh.find;
  const hoSoFindCu = HoSo.find;

  try {
    Order.find = () => taoMockQuery([]);
    SupplierPayment.find = () => taoMockQuery([]);
    EmployeePayment.find = () => taoMockQuery([]);
    ChuyenPhatNhanh.find = () => taoMockQuery([]);
    HoSo.find = () => taoMockQuery([]);

    google.auth.GoogleAuth = class { async getClient() { return {}; } };
    google.sheets = () => ({
      spreadsheets: {
        values: {
          get: async ({ range }) => {
            if (range.startsWith('GS-DONHANG')) {
              throw new Error('403 The caller does not have permission');
            }
            if (range.startsWith('TTNCC')) return { data: { values: [['ID', 'NCC']] } };
            if (range.startsWith('TTNhanVien')) return { data: { values: [['ID', 'Tên Nhân Viên']] } };
            if (range.startsWith('ChuyenPhatNhanh')) return { data: { values: [['ID', 'TÊN CÔNG TY']] } };
            if (range.startsWith('Hoso')) return { data: { values: [['ID', 'TÊN CÔNG TY']] } };
            return { data: { values: [] } };
          }
        }
      }
    });

    const ketQua = await dongBoTatCaLenGoogleSheet();
    assert.equal(ketQua.status, 'partial-error');
    assert.equal(ketQua.tables.donHang.status, 'error');
    assert.match(ketQua.tables.donHang.error, /403/);
    assert.equal(ketQua.tables.thanhToan.status, 'success');
    assert.equal(ketQua.tables.giaoNhan.status, 'success');
    assert.equal(ketQua.tables.hoSo.status, 'success');
  } finally {
    google.auth.GoogleAuth = xacThucCu;
    google.sheets = sheetsCu;
    Order.find = orderFindCu;
    SupplierPayment.find = spFindCu;
    EmployeePayment.find = epFindCu;
    ChuyenPhatNhanh.find = cpnFindCu;
    HoSo.find = hoSoFindCu;
  }
}

kiemTraLich20Gio()
  .then(kiemTraDayCa4Bang)
  .then(kiemTraCoLapLoi)
  .then(() => {
    console.log('Đạt: đồng bộ 1 chiều MongoDB -> Google Sheet (4 bảng, lịch 20:00 VN, ngắt chiều Sheet -> MongoDB).');
  })
  .catch(loi => {
    console.error(loi);
    process.exitCode = 1;
  });
