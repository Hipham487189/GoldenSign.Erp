const { default: mongoose } = require('mongoose');
const { google } = require('googleapis');
// Import model DonHang của bạn ở đây (ví dụ: const DonHang = require('./models/DonHang');)

const MONGO_URI = "mongodb+srv://..."; // URI MongoDB của bạn
const SPREADSHEET_ID = "1-Xn6eGSTqD6yiCEsCcNIDiJ5L6_EzQIUF6HCw5v9y7c";
const SHEET_NAME = "GS-DONHANG"; // Tên tab sheet chứa dữ liệu AppSheet

async function syncAllHistoricalData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Đã kết nối MongoDB để đồng bộ lịch sử...');

    // Khởi tạo Google Sheets API (hoặc dùng hàm đọc sẵn có của bạn)
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json', // File service account của bạn (nếu có) hoặc dùng cách đọc trực tiếp
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.log('Không có dữ liệu trên Google Sheet.');
      return;
    }

    const headers = rows[0];
    let countUpdated = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let rowData = {};
      for (let j = 0; j < headers.length; j++) {
        rowData[headers[j]] = row[j] !== undefined ? row[j] : '';
      }

      // Kiểm tra nếu có trường thời gian hoặc mã đơn hàng để update
      if (rowData.maDonHang) {
        await DonHang.findOneAndUpdate(
          { maDonHang: rowData.maDonHang },
          { $set: rowData },
          { upsert: true, new: true }
        );
        countUpdated++;
      }
    }

    console.log(`🎉 Đã đồng bộ thành công ${countUpdated} dòng từ Google Sheets lên MongoDB!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi đồng bộ lịch sử:', error);
    process.exit(1);
  }
}

syncAllHistoricalData();
