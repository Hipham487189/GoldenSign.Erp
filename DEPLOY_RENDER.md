# Deploy DATAGS on Render Free

1. Push this project to a private GitHub repository. Keep `.env` and `credentials.json` out of Git.
2. In Render, choose **New + > Blueprint** and select the repository. Render will read `render.yaml`.
3. Set these secret environment variables when prompted:
   - `MONGO_URI`: MongoDB Atlas connection string. Allow `0.0.0.0/0` in Atlas Network Access for Render.
   - `MONGO_DB_NAME`: MongoDB database name. Defaults to `DATAGS`.
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_CREDENTIALS_JSON`: the complete JSON contents of the Google service-account key.
   - `UNSPLASH_ACCESS_KEY`: Optional; only needed for direct use of the public Unsplash image API. The login page uses curated local images so each caption matches its background.
4. Share the Google spreadsheet with the service-account email as Viewer if Sheet sync is needed. It must contain both the `DONHANG` and `GS-DONHANG` tabs. `GOOGLE_SHEET_DONHANG_NAME` can override the `DONHANG` tab name.
5. Deploy. The public URL will be similar to `https://datags-orders.onrender.com`.

The free service sleeps after inactivity, so the first request after idle may take several seconds. MongoDB Atlas remains the persistent database.

Đồng bộ đơn hàng chỉ đọc từ hai tab `DONHANG` và `GS-DONHANG` vào MongoDB, không ghi dữ liệu từ web hoặc MongoDB lên Sheets. Hệ thống đối chiếu bản ghi theo `STT` duy nhất; mã đơn chỉ dùng đối chiếu phụ cho bản ghi Mongo thiếu `STT`. Nếu cùng `STT` xuất hiện ở cả hai tab, `GS-DONHANG` được áp dụng sau cùng. Đồng bộ chỉ thêm/cập nhật, không xóa đơn Mongo khi thiếu dòng trên Sheet; đơn tạo mới trên web tiếp tục được bảo vệ. Thay đổi này chỉ có hiệu lực sau khi triển khai lại ứng dụng.

Ba biến `DON_NHIEU_SAN_PHAM_ENABLED`, `TAO_DON_NHIEU_SAN_PHAM_ENABLED` và `UNC_NHIEU_SAN_PHAM_ENABLED` mặc định bật và được đặt `true` trong Blueprint. Có thể đặt từng biến thành `false` để tắt; tắt `DON_NHIEU_SAN_PHAM_ENABLED` cũng tắt tạo đơn và UNC nhiều sản phẩm. Nếu môi trường triển khai hiện đặt biến `false`, cần cập nhật biến và khởi động lại ứng dụng. Các luồng mới chưa được kiểm thử với MongoDB thật; việc đẩy mã lên GitHub không xác nhận website đã triển khai.
