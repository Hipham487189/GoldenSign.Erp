(function () {
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Không thể đọc tệp ${file?.name || ''}.`));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không thể giải mã ảnh để nén.'));
      };
      img.src = url;
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return dataUrl.length;
    const base64 = dataUrl.slice(commaIdx + 1);
    return Math.floor((base64.length * 3) / 4);
  }

  window.nenTepTruocKhiTaiLen = async function (file, options = {}) {
    if (!file) return '';
    const maxDimension = Number(options.maxDimension || 1920);
    const quality = Number(options.quality || 0.78);
    const minCompressBytes = Number(options.minCompressBytes || 150 * 1024);
    const mime = String(file.type || '').toLowerCase();
    const isCompressibleImage = /^image\/(jpeg|jpg|png|webp)$/i.test(mime);

    if (!isCompressibleImage || file.size <= minCompressBytes || typeof document === 'undefined') {
      return readFileAsDataUrl(file);
    }

    try {
      let source;
      let width;
      let height;
      if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file);
        width = source.width;
        height = source.height;
      } else {
        source = await loadImageFromFile(file);
        width = source.naturalWidth || source.width;
        height = source.naturalHeight || source.height;
      }

      const scale = Math.min(1, maxDimension / Math.max(width || 1, height || 1));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (typeof source.close === 'function') source.close();
        return readFileAsDataUrl(file);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
      if (typeof source.close === 'function') source.close();

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (compressedDataUrl && estimateDataUrlBytes(compressedDataUrl) < file.size) {
        return compressedDataUrl;
      }
    } catch (_) {
      // Fallback sang đọc nguyên bản nếu trình duyệt không hỗ trợ canvas/bitmap
    }
    return readFileAsDataUrl(file);
  };
})();
