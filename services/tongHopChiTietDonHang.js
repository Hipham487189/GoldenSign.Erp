const { TRANG_THAI_KICH_HOAT } = require('./chiTietDonHang');

function dongDaKichHoat() {
  return {
    $filter: {
      input: { $cond: [{ $isArray: '$chiTietSanPham' }, '$chiTietSanPham', []] },
      as: 'dong',
      cond: {
        $regexMatch: {
          input: { $convert: { input: '$$dong.trangThai', to: 'string', onError: '', onNull: '' } },
          regex: TRANG_THAI_KICH_HOAT.source,
          options: 'i'
        }
      }
    }
  };
}

function tongDong(truong, nhanSoLuong = false) {
  const giaTri = `$$this.${truong}`;
  return {
    $reduce: {
      input: dongDaKichHoat(),
      initialValue: 0,
      in: { $add: ['$$value', nhanSoLuong ? { $multiply: [giaTri, '$$this.soLuong'] } : giaTri] }
    }
  };
}

function cacLanKhachThanhToan() {
  return {
    $reduce: {
      input: dongDaKichHoat(),
      initialValue: [],
      in: { $concatArrays: ['$$value', '$$this.thanhToanKhach'] }
    }
  };
}

function tongKhachDaThanhToan() {
  return {
    $reduce: {
      input: cacLanKhachThanhToan(),
      initialValue: 0,
      in: { $add: ['$$value', '$$this.soTien'] }
    }
  };
}

function tongHopDongKichHoat() {
  return {
    thanhTien: tongDong('giaBan', true),
    thucDongCongTy: tongDong('giaDongCongTy', true),
    congNoNcc: tongDong('giaNoNcc', true),
    phaiThuKhach: tongDong('phaiThuKhach'),
    khachDaThanhToan: tongKhachDaThanhToan(),
    thanhToanKhach: cacLanKhachThanhToan()
  };
}

module.exports = { dongDaKichHoat, tongHopDongKichHoat };
