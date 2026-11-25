/* DATAGS persistent group chat module */
(function () {
  let chatLoaded = false;
  let chatLoading = false;
  let chatRefreshTimer = null;
  let droppedChatFile = null;
  let chatMessages = [];
  let chatSending = false;
  let chatHasSnapshot = false;
  let lastNotifiedUnread = 0;
  let chatWatcherTimer = null;
  let noiDungChatDangSoan = '';
  let tinNhanTraLoi = null;
  let tenOnline = [];
  let boLocChat = 'all';
  let henGioDangNhap = null;
  let lanGuiDangNhapCuoi = 0;
  let henGioTimDonChat = null;
  const boNhoTepChat = new Map();
  let kenhChatDangChon = 'datags-group';
  let danhSachKenhChat = [];
  let thanhVienHeThong = [];
  let nguonNghiepVuDangGan = null;
  let nhomEmojiChat = 'all';
  let tuKhoaEmojiChat = '';
  const danhSachEmojiChat = [
    ['😀','feel','cuoi vui'],['😃','feel','cuoi'],['😄','feel','cuoi'],['😁','feel','cuoi rang'],['😂','feel','cuoi'],['🤣','feel','cuoi nga'],['😊','feel','vui'],['🙂','feel','vui'],['😍','feel','tim'],['🥰','feel','thuong'],['😘','feel','hon'],['😎','feel','de thuong'],
    ['🤩','feel','ngo ngang'],['😢','feel','buon'],['😭','feel','khoc'],['😡','feel','gian'],['😱','feel','so'],['😴','feel','ngu'],['🤔','feel','suy nghi'],['😅','feel','lo lang'],['🙃','feel','nguoc'],['😇','feel','thien than'],['🤗','feel','om'],['🥳','feel','tiec'],
    ['👍','gesture','dong y'],['👎','gesture','khong'],['👏','gesture','vo tay'],['🙏','gesture','cam on'],['👌','gesture','ok'],['🤝','gesture','bat tay'],['✌️','gesture','hai'],['🤞','gesture','may man'],['💪','gesture','manh me'],['👋','gesture','chao'],['🙌','gesture','mung'],['🫡','gesture','chao'],
    ['❤️','gesture','yeu tim'],['💙','gesture','tim xanh'],['💚','gesture','tim xanh la'],['💛','gesture','tim vang'],['💜','gesture','tim tim'],['🔥','gesture','lua'],['✨','gesture','lap lanh'],['💯','gesture','100'],['✅','work','hoan tat'],['❌','work','xoa'],['⚠️','work','canh bao'],['⏰','work','dong ho'],
    ['📄','work','tai lieu'],['📁','work','thu muc'],['📎','work','dinh kem'],['📌','work','ghim'],['📊','work','bao cao'],['📈','work','tang'],['📉','work','giam'],['📅','work','lich'],['💼','work','cong viec'],['🏢','work','cong ty'],['🧾','work','hoa don'],['📝','work','ghi chu'],
    ['🔍','work','tim kiem'],['🔗','work','lien ket'],['⚙️','work','cai dat'],['💻','work','may tinh'],['📱','work','dien thoai'],['☎️','work','goi'],['📧','work','email'],['📦','work','don hang'],['🚚','work','giao nhan'],['🏷️','work','nhan'],['💰','work','tien'],['🎯','work','muc tieu']
  ];
  const chatLastSeenKey = (maKenh = 'all') => `datags_chat_last_seen_${currentUser?.username || 'guest'}_${encodeURIComponent(maKenh)}`;
  let soChuaDocTheoKenh = new Map();
  const mocDocTheoKenh = () => {
    const keys = danhSachKenhChat.length ? danhSachKenhChat.map(kenh => kenh.maKenh) : ['datags-group'];
    return Object.fromEntries(keys.map(key => [key, Number(localStorage.getItem(chatLastSeenKey(key)) || 0)]));
  };

  function chatStyleKey() { return `datags_chat_colors_${currentUser?.username || 'guest'}`; }

  const macDinhMauChat = () => document.body.classList.contains('light-mode')
    ? { outgoing: '#147c65', incoming: '#ffffff', text: '#ffffff' }
    : { outgoing: '#147c65', incoming: '#14293a', text: '#ffffff' };
  const mauChatNhanh = {
    green: { outgoing: '#147c65', incoming: '#ffffff', text: '#ffffff' },
    blue: { outgoing: '#2563eb', incoming: '#eff6ff', text: '#ffffff' },
    purple: { outgoing: '#7c3aed', incoming: '#faf5ff', text: '#ffffff' }
  };

  function applyChatStyle(colors) {
    let saved = colors;
    if (!saved) {
      try { saved = JSON.parse(localStorage.getItem(chatStyleKey()) || 'null'); }
      catch (error) { console.warn('Màu chat đã lưu không hợp lệ:', error.message); saved = null; }
    }
    saved = { ...macDinhMauChat(), ...(saved || {}) };
    const popup = document.getElementById('chatPopup');
    if (popup) {
      popup.style.setProperty('--chat-text-color', saved.text);
      popup.style.setProperty('--chat-outgoing-color', saved.outgoing);
      popup.style.setProperty('--chat-incoming-color', saved.incoming);
    }
    const outgoingInput = document.getElementById('chatOutgoingColor');
    const incomingInput = document.getElementById('chatIncomingColor');
    const textInput = document.getElementById('chatTextColor');
    if (outgoingInput) outgoingInput.value = saved.outgoing;
    if (incomingInput) incomingInput.value = saved.incoming;
    if (textInput) textInput.value = saved.text;
  }

  function escape(value) {
    return escapeHtml(String(value || ''));
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatMessageText(value) {
    return escape(value)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/(^|\n)-\s/g, '$1• ')
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;font-weight:700;">$1</a>')
      .replace(/(^|[\s>])@([a-zA-Z0-9_.-]+)/g, (match, prefix, username) => `${prefix}<span class="chat-mention" style="--mention-bg:${mauNhanVien(username).nen};--mention-color:${mauNhanVien(username).chu}">@${username}</span>`);
  }

  function mauNhanVien(username) {
    const mauSac = [
      { nen: '#e0f2fe', chu: '#0369a1' }, { nen: '#ede9fe', chu: '#6d28d9' },
      { nen: '#dcfce7', chu: '#15803d' }, { nen: '#ffedd5', chu: '#c2410c' },
      { nen: '#fce7f3', chu: '#be185d' }, { nen: '#fef3c7', chu: '#a16207' },
      { nen: '#ccfbf1', chu: '#0f766e' }, { nen: '#e0e7ff', chu: '#4338ca' },
      { nen: '#ffe4e6', chu: '#be123c' }, { nen: '#ecfccb', chu: '#4d7c0f' },
      { nen: '#f3e8ff', chu: '#7e22ce' }, { nen: '#cffafe', chu: '#0e7490' }
    ];
    const normalized = String(username || '').toLowerCase();
    const memberIndex = thanhVienHeThong.findIndex(thanhVien => thanhVien.username === normalized);
    if (memberIndex >= 0) return mauSac[memberIndex % mauSac.length];
    const hash = normalized.split('').reduce((tong, kyTu) => ((tong * 31) + kyTu.charCodeAt(0)) >>> 0, 0);
    return mauSac[hash % mauSac.length];
  }

  function iconTep(tenTep, loaiTep) {
    const text = `${tenTep || ''} ${loaiTep || ''}`.toLowerCase();
    if (/\.pdf|pdf/.test(text)) return 'fa-file-pdf';
    if (/\.xlsx?|\.csv|excel|spreadsheet/.test(text)) return 'fa-file-excel';
    if (/\.docx?|word/.test(text)) return 'fa-file-word';
    if (/image|\.png|\.jpg|\.jpeg|\.webp/.test(text)) return 'fa-file-image';
    return 'fa-file-lines';
  }

  function loaiTepChat(tenTep, loaiTep) {
    const text = `${tenTep || ''} ${loaiTep || ''}`.toLowerCase();
    if (/\.pdf|application\/pdf/.test(text)) return 'pdf';
    if (/\.docx?|word/.test(text)) return 'word';
    if (/\.xlsx?|\.csv|excel|spreadsheet/.test(text)) return 'excel';
    if (/image|\.png|\.jpe?g|\.webp|\.gif/.test(text)) return 'image';
    if (/\.zip|\.rar|\.7z|compressed/.test(text)) return 'archive';
    return 'other';
  }

  function cardNguonNghiepVu(source) {
    if (!source?.nhan) return '';
    if (source.loai === 'donhang') {
      const trangThai = source.trangThai || 'Chưa cập nhật';
      const chuan = trangThai.toLowerCase();
      const lopTrangThai = /hoàn|hoan|kích hoạt|kich hoat/.test(chuan) ? 'hoan-thanh'
        : /thiếu|thieu|hủy|huy|từ chối|tu choi/.test(chuan) ? 'can-xu-ly'
          : /đang|soạn|dang|chờ/.test(chuan) ? 'dang-xu-ly' : '';
      return `<div class="chat-order-card">
        <div class="chat-order-card-head"><strong><i class="fa-solid fa-file-invoice-dollar"></i> Đơn hàng #${escape(source.ma || '—')}</strong><span class="chat-order-head-actions"><span class="chat-order-status ${lopTrangThai}"><i class="fa-solid fa-circle"></i>${escape(trangThai)}</span><button type="button" class="chat-order-open" onclick="moDonHangTuChat(decodeURIComponent('${encodeURIComponent(source.maDoiTuong || '')}'),decodeURIComponent('${encodeURIComponent(source.ma || '')}'))"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở đơn</button></span></div>
        <div class="chat-order-grid">
          <span class="chat-order-company"><b title="${escape(source.tenCongTy || '')}">${escape(source.tenCongTy || 'Chưa có thông tin công ty')}</b></span>
          <span><b>${escape(source.mst || '—')}</b></span>
          <span class="chat-order-package"><b title="${escape(source.tenGoi || '')}">${escape(source.tenGoi || '—')}</b></span>
        </div>
      </div>`;
    }
    if (source.loai === 'hoso') {
      const trangThai = source.trangThai || 'Chưa cập nhật';
      const chuan = trangThai.toLowerCase();
      const lopTrangThai = /hoàn|hoan|đầy đủ|day du|đã nhận|da nhan/.test(chuan) ? 'hoan-thanh'
        : /thiếu|thieu|chưa|chua/.test(chuan) ? 'can-xu-ly'
          : /đang|dang|chờ|cho/.test(chuan) ? 'dang-xu-ly' : '';
      return `<div class="chat-order-card chat-dossier-card">
        <div class="chat-order-card-head"><strong><i class="fa-solid fa-folder-open"></i> Hồ sơ #${escape(source.ma || '—')}</strong><span class="chat-order-head-actions"><span class="chat-order-status ${lopTrangThai}"><i class="fa-solid fa-circle"></i>${escape(trangThai)}</span><button type="button" class="chat-order-open" onclick="moHoSoTuChat(decodeURIComponent('${encodeURIComponent(source.ma || '')}'),decodeURIComponent('${encodeURIComponent(source.mst || '')}'))"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở hồ sơ</button></span></div>
        <div class="chat-order-grid">
          <span class="chat-order-company"><b title="${escape(source.tenCongTy || '')}">${escape(source.tenCongTy || 'Chưa có thông tin công ty')}</b></span>
          <span><b>${escape(source.mst || '—')}</b></span>
          <span class="chat-order-package"><b>${escape(source.loaiHoSo || '—')}</b></span>
        </div>
      </div>`;
    }
    const icons = { hoso: 'fa-folder-open', donhang: 'fa-file-invoice-dollar', giaonhan: 'fa-truck-fast' };
    const trangThai = source.trangThai || 'Đang theo dõi';
    return `<span class="chat-source-card"><span class="chat-source-card-main"><span class="chat-source-card-icon"><i class="fa-solid ${icons[source.loai] || 'fa-link'}"></i></span><span class="chat-source-card-copy"><strong>${escape(source.nhan)}</strong><small>${source.ma ? `${escape(source.ma)} · ` : ''}${source.mst ? `MST ${escape(source.mst)}` : ''}</small></span></span><span class="chat-source-status ${/(thiếu|chưa)/i.test(trangThai) ? 'thieu' : ''}">${escape(trangThai)}</span></span>`;
  }

  function coTepChat(message) {
    return Boolean(message && (message.coTepDinhKem || message.attachmentData || message.attachmentSize > 0 || message.attachmentName));
  }

  function kichHoatTaiTep(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName || 'tep-dinh-kem';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.taiTepChat = async function (messageId, encodedFileName = '') {
    const id = String(messageId || '');
    const fallbackName = encodedFileName ? decodeURIComponent(encodedFileName) : 'tep-dinh-kem';
    if (!id) return;
    const cached = boNhoTepChat.get(id);
    if (cached?.attachmentData) {
      kichHoatTaiTep(cached.attachmentData, cached.attachmentName || fallbackName);
      return;
    }
    const localMsg = chatMessages.find(item => String(item._id) === id);
    if (localMsg?.attachmentData) {
      kichHoatTaiTep(localMsg.attachmentData, localMsg.attachmentName || fallbackName);
      return;
    }
    try {
      const response = await fetch(`${API_CHAT_URL}/${encodeURIComponent(id)}/attachment`);
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.attachmentData) {
        throw new Error(result.message || 'Không thể tải tệp đính kèm');
      }
      if (boNhoTepChat.size >= 20) boNhoTepChat.delete(boNhoTepChat.keys().next().value);
      boNhoTepChat.set(id, result.data);
      kichHoatTaiTep(result.data.attachmentData, result.data.attachmentName || fallbackName);
    } catch (error) {
      showAppToast?.(error.message, 'Tải tệp đính kèm');
    }
  };

  function formatFileSize(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateUnreadBadge(count) {
    const text = count > 99 ? '99+' : String(count);
    document.querySelectorAll('#chatUnreadBadge, #chatSidebarUnreadBadge').forEach(badge => {
      badge.textContent = count > 0 ? text : '';
      badge.classList.toggle('active', count > 0);
    });
    if (chatHasSnapshot && count > lastNotifiedUnread && currentTab !== 'chat') {
      window.showAppToast?.(`${count} tin nhắn mới trong Chat Nhóm.`, 'Chat Nhóm');
    }
    lastNotifiedUnread = count;
    chatHasSnapshot = true;
  }

  function markChatAsRead(messages) {
    const newest = messages.reduce((latest, message) => Math.max(latest, new Date(message.createdAt || 0).getTime()), 0);
    if (newest) localStorage.setItem(chatLastSeenKey(kenhChatDangChon), String(newest));
    soChuaDocTheoKenh.set(kenhChatDangChon, 0);
    updateUnreadBadge([...soChuaDocTheoKenh.values()].reduce((sum, count) => sum + count, 0));
    renderChatChannelList();
  }

  function updatePresence(users, typingUsers = []) {
    const onlineNames = (Array.isArray(users) ? users : [])
      .map(user => typeof user === 'string' ? user : user?.username || user?.name || '')
      .filter(Boolean);
    tenOnline = onlineNames;
    const presenceLabel = onlineNames.length
      ? `Đang online (${onlineNames.length}): ${onlineNames.join(', ')}`
      : 'Không có thành viên online';
    document.querySelectorAll('[id="chatPresence"]').forEach(presence => {
      presence.textContent = presenceLabel;
    });
    const danhSach = document.getElementById('chatThanhVienOnline');
    if (danhSach) {
      danhSach.innerHTML = onlineNames.length
        ? onlineNames.map(ten => `<div class="chat-member"><span class="chat-avatar">${escape(ten.slice(0, 2).toUpperCase())}</span><span class="chat-member-copy"><strong>${escape(ten)}</strong></span><span class="chat-online-dot"></span></div>`).join('')
        : '<div class="chat-empty">Không có thành viên online.</div>';
    }
    const soThanhVien = document.getElementById('chatSoThanhVien');
    if (soThanhVien) soThanhVien.textContent = `Thành viên online (${onlineNames.length})`;
    renderChatPrivateList();
    renderThanhVienChat();
    const typing = document.getElementById('chatDangNhap');
    if (typing) {
      typing.textContent = typingUsers.length
        ? `${typingUsers.join(', ')} đang nhập...`
        : '';
    }
  }

  async function refreshOnlinePresence() {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_CHAT_URL}/presence`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) return;
      const presence = result.data || {};
      updatePresence(Array.isArray(presence) ? presence : presence.users, Array.isArray(presence.typing) ? presence.typing : []);
    } catch (error) {
      console.warn('Không thể cập nhật trạng thái chat online:', error.message);
    }
  }

  function renderMessages(messages) {
    const body = document.getElementById('chatBody');
    if (!body) return;
    if (!messages.length) {
      body.innerHTML = '<div class="chat-empty">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</div>';
      return;
    }
    let ngayTruoc = '';
    const tinGhim = messages.filter(message => message.daGhim).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const thanhTinGhim = tinGhim.length
      ? `<section class="chat-pinned-panel"><div class="chat-pinned-title"><span><i class="fa-solid fa-thumbtack"></i> Tin ghim</span><b>${tinGhim.length}</b></div><div class="chat-pinned-list">${tinGhim.map(message => `<button type="button" class="chat-pinned-banner" onclick="cuonDenTinNhanChat('${escape(message._id)}')" title="Xem tin ghim"><span class="chat-pinned-person">${escape((message.senderUsername || 'T').slice(0, 2).toUpperCase())}</span><span class="chat-pinned-content"><strong>${escape(message.senderUsername || 'Thành viên')}</strong><small>${escape(message.text || message.attachmentName || 'Tin nhắn')}</small></span><i class="fa-solid fa-arrow-right"></i></button>`).join('')}</div></section>`
      : '';
    body.innerHTML = thanhTinGhim + messages.map(message => {
      const mine = message.senderUsername === currentUser?.username;
      const ngay = new Date(message.createdAt || 0).toLocaleDateString('vi-VN');
      const divider = ngay !== ngayTruoc ? `<div class="chat-day">${escape(ngay)}</div>` : '';
      ngayTruoc = ngay;
      const attachment = coTepChat(message)
        ? `<button type="button" class="chat-file-card chat-file-${loaiTepChat(message.attachmentName, message.attachmentType)}" onclick="taiTepChat('${escape(message._id)}','${encodeURIComponent(message.attachmentName || 'tep-dinh-kem')}')" style="width:100%;text-align:left;cursor:pointer;"><span class="chat-file-card-icon"><i class="fa-solid ${iconTep(message.attachmentName, message.attachmentType)}"></i></span><span class="chat-file-card-copy"><strong>${escape(message.attachmentName || 'Tệp đính kèm')}</strong><small>${escape(message.attachmentType || 'Tài liệu')} · ${formatFileSize(message.attachmentSize)}</small></span><i class="fa-solid fa-download"></i></button>`
        : '';
      const recall = mine ? `<button class="chat-delete-btn" onclick="recallChatMessage('${escape(message._id)}')" title="Thu hồi tin nhắn"><i class="fa-solid fa-trash-can"></i></button>` : '';
      const reply = message.traLoi?.messageId
        ? `<span class="chat-reply-quote"><strong>${escape(message.traLoi.senderUsername)}</strong><br>${escape(message.traLoi.text)}</span>`
        : '';
      const reactions = (message.phanUng || []).filter(item => item.users?.length).map(item => `<button class="chat-reaction" onclick="phanUngChat('${escape(message._id)}','${escape(item.emoji)}')">${escape(item.emoji)} ${item.users.length}</button>`).join('');
      const daThich = (message.phanUng || []).some(item => item.emoji === '👍' && item.users?.includes(currentUser?.username));
      const actions = `<span class="chat-message-actions"><button class="chat-message-action" onclick="danhDauXemChat('${escape(message._id)}')"><i class="fa-regular fa-eye"></i> Xem ${(message.luotXem || []).length || ''}</button><button class="chat-message-action ${daThich ? 'active' : ''}" onclick="phanUngChat('${escape(message._id)}','👍')"><i class="fa-${daThich ? 'solid' : 'regular'} fa-thumbs-up"></i> Thích</button><button class="chat-message-action" onclick="traLoiChat('${escape(message._id)}')"><i class="fa-solid fa-reply"></i> Trả lời</button><button class="chat-message-action ${message.daGhim ? 'active' : ''}" onclick="ghimTinChat('${escape(message._id)}')" title="${message.daGhim ? 'Bỏ ghim' : 'Ghim tin'}"><i class="fa-solid ${message.daGhim ? 'fa-thumbtack-slash' : 'fa-thumbtack'}"></i></button></span>`;
      const chipNguon = cardNguonNghiepVu(message.nguonNghiepVu);
      const noiDungHienThi = message.nguonNghiepVu?.nhan && /^(📦|📁|🚚)\s/.test(message.text || '')
        ? ''
        : message.text || '';
      const senderName = message.senderUsername || 'Thành viên';
      const avatar = senderName.slice(0, 2).toUpperCase();
      const heading = `<div class="chat-message-heading"><strong>${escape(mine ? 'Bạn' : senderName)}</strong>${message.daGhim ? '<i class="fa-solid fa-thumbtack chat-pinned-icon" title="Đã ghim"></i>' : ''}<span>${formatTime(message.createdAt)}</span></div>`;
      return `${divider}<div class="chat-message-row ${mine ? 'outgoing' : 'incoming'}">${mine ? '' : `<span class="chat-row-avatar" style="background:${mauNhanVien(senderName).nen};color:${mauNhanVien(senderName).chu}">${escape(avatar)}</span>`}<div class="chat-message-wrap">${heading}<div class="chat-message ${mine ? 'outgoing' : 'incoming'}" data-chat-id="${escape(message._id)}" data-chat-search="${escape(`${senderName} ${noiDungHienThi} ${message.attachmentName || ''} ${message.nguonNghiepVu?.mst || ''}`)}">${recall}${reply}${noiDungHienThi ? `<div class="chat-message-text">${formatMessageText(noiDungHienThi)}</div>` : ''}${chipNguon}${attachment}${reactions ? `<div class="chat-reactions">${reactions}</div>` : ''}${actions}</div></div></div>`;
    }).join('');
    filterChatMessages();
    renderChatSideData();
  }

  function renderChatSideData() {
    const files = document.getElementById('chatTepDaGui');
    const pins = document.getElementById('chatTinGhim');
    const latest = chatMessages[chatMessages.length - 1];
    const latestText = document.getElementById('chatTinMoiNhat');
    const latestTime = document.getElementById('chatGioTinMoi');
    if (latestText && latest) latestText.textContent = `${latest.senderUsername}: ${latest.text || latest.attachmentName || 'Tệp đính kèm'}`;
    if (latestTime && latest) latestTime.textContent = new Date(latest.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (files) {
      const messagesWithFiles = chatMessages.filter(message => coTepChat(message));
      const businessItems = chatMessages.filter(message => message.nguonNghiepVu?.nhan);
      files.innerHTML = `<div class="chat-files-section">
        <div class="chat-files-heading"><strong>Tệp đính kèm</strong><span>${messagesWithFiles.length}</span></div>
        <div class="chat-files-list">${messagesWithFiles.length
          ? messagesWithFiles.slice().reverse().map(message => `<div class="chat-side-file chat-file-${loaiTepChat(message.attachmentName, message.attachmentType)}"><span class="chat-side-file-icon"><i class="fa-solid ${iconTep(message.attachmentName, message.attachmentType)}"></i></span><span class="chat-side-file-copy"><strong title="${escape(message.attachmentName)}">${escape(message.attachmentName || 'Tệp đính kèm')}</strong><small>${formatFileSize(message.attachmentSize)} · ${escape(message.senderUsername)}</small></span><button type="button" class="chat-side-file-download" onclick="taiTepChat('${escape(message._id)}','${encodeURIComponent(message.attachmentName || 'tep-dinh-kem')}')" title="Tải xuống"><i class="fa-solid fa-download"></i></button></div>`).join('')
          : '<div class="chat-right-empty">Chưa có tệp đính kèm.</div>'}</div>
      </div>
      <div class="chat-files-section">
        <div class="chat-files-heading"><strong>Hồ sơ & đơn hàng</strong><span>${businessItems.length}</span></div>
        <div class="chat-files-list">${businessItems.length
          ? businessItems.slice().reverse().map(message => `<button type="button" class="chat-side-business" onclick="${message.nguonNghiepVu.loai === 'donhang' ? `moDonHangTuChat(decodeURIComponent('${encodeURIComponent(message.nguonNghiepVu.maDoiTuong || '')}'),decodeURIComponent('${encodeURIComponent(message.nguonNghiepVu.ma || '')}'))` : `moHoSoTuChat(decodeURIComponent('${encodeURIComponent(message.nguonNghiepVu.ma || '')}'),decodeURIComponent('${encodeURIComponent(message.nguonNghiepVu.mst || '')}'))`}"><span class="chat-side-business-icon"><i class="fa-solid ${message.nguonNghiepVu.loai === 'donhang' ? 'fa-file-invoice-dollar' : 'fa-folder-open'}"></i></span><span class="chat-side-business-copy"><strong>${escape(message.nguonNghiepVu.nhan)}</strong><small>${escape(message.nguonNghiepVu.mst || '')}${message.nguonNghiepVu.trangThai ? ` · ${escape(message.nguonNghiepVu.trangThai)}` : ''}</small></span><i class="fa-solid fa-arrow-right"></i></button>`).join('')
          : '<div class="chat-right-empty">Chưa có hồ sơ hoặc đơn hàng được chia sẻ.</div>'}</div>
      </div>`;
    }
    if (pins) {
      const pinned = chatMessages.filter(message => message.daGhim);
      pins.innerHTML = pinned.length
        ? pinned.slice().reverse().map(message => `<div class="chat-pin-item"><button type="button" class="chat-pin-item-main" onclick="cuonDenTinNhanChat('${escape(message._id)}')" title="Đi tới tin nhắn"><strong><i class="fa-solid fa-thumbtack"></i> ${escape(message.senderUsername)}</strong><small>${escape(message.text || message.attachmentName || 'Tin nhắn')}</small></button><button type="button" class="chat-pin-remove" onclick="boGhimTinChat('${escape(message._id)}')" title="Bỏ ghim tin nhắn" aria-label="Bỏ ghim tin nhắn"><i class="fa-solid fa-xmark"></i><span>Bỏ ghim</span></button></div>`).join('')
        : '<div class="chat-right-empty">Chưa có tin nhắn nào được ghim.</div>';
    }
  }

  function renderChatPrivateList() {
    const target = document.getElementById('chatDanhSachRieng');
    if (!target) return;
    const kenhRieng = danhSachKenhChat.filter(kenh => kenh.loaiKenh === 'direct');
    const daCo = new Set(kenhRieng.flatMap(kenh => kenh.tenThanhVien));
    const goiY = thanhVienHeThong.filter(thanhVien => thanhVien.username !== currentUser?.username && !daCo.has(thanhVien.username));
    target.innerHTML = [
      ...kenhRieng.map(kenh => `<div class="chat-group-item ${kenh.maKenh === kenhChatDangChon ? 'active' : ''}" data-chat-kind="private" onclick="moKenhChat('${encodeURIComponent(kenh.maKenh)}')"><span class="chat-avatar">${escape(kenh.tenKenh.slice(0, 2).toUpperCase())}</span><span class="chat-group-copy"><strong>${escape(kenh.tenKenh)}</strong><span>Nhắn tin riêng</span></span><span class="chat-channel-unread ${kenh.soChuaDoc ? 'active' : ''}">${kenh.soChuaDoc > 99 ? '99+' : kenh.soChuaDoc || ''}</span></div>`),
      ...goiY.map(thanhVien => `<div class="chat-group-item" data-chat-kind="private" onclick="moTinRiengChat('${encodeURIComponent(thanhVien.username)}')"><span class="chat-avatar">${escape((thanhVien.name || thanhVien.username).slice(0, 2).toUpperCase())}</span><span class="chat-group-copy"><strong>${escape(thanhVien.name || thanhVien.username)}</strong><span>${tenOnline.includes(thanhVien.username) ? 'Đang online' : 'Bắt đầu trò chuyện'}</span></span>${tenOnline.includes(thanhVien.username) ? '<span class="chat-online-dot"></span>' : ''}</div>`)
    ].join('') || '<div class="chat-right-empty">Chưa có thành viên online khác.</div>';
    locDanhSachChat();
  }

  function renderChatMentionMenu() {
    const menu = document.getElementById('chatMentionMenu');
    if (!menu) return;
    const keyword = String(menu.dataset.keyword || '').toLowerCase();
    menu.innerHTML = thanhVienHeThong
      .filter(thanhVien => thanhVien.username !== currentUser?.username)
      .filter(thanhVien => !keyword || thanhVien.username.toLowerCase().includes(keyword) || String(thanhVien.name || '').toLowerCase().includes(keyword))
      .map(thanhVien => `<button class="chat-mention-option" onclick="chenNhacTenChat('${encodeURIComponent(thanhVien.username)}', true)"><strong>@${escape(thanhVien.username)}</strong><small>${escape(thanhVien.name || '')}</small></button>`).join('');
  }

  function renderThanhVienChat() {
    const danhSach = document.getElementById('chatThanhVienOnline');
    if (danhSach) {
      danhSach.innerHTML = thanhVienHeThong.map(thanhVien => `<div class="chat-member"><span class="chat-avatar">${escape((thanhVien.name || thanhVien.username).slice(0, 2).toUpperCase())}</span><span class="chat-member-copy"><strong>${escape(thanhVien.name || thanhVien.username)}</strong><span>@${escape(thanhVien.username)}${thanhVien.department ? ` · ${escape(thanhVien.department)}` : ''}</span></span>${tenOnline.includes(thanhVien.username) ? '<span class="chat-online-dot"></span>' : ''}</div>`).join('') || '<div class="chat-empty">Chưa có tài khoản hoạt động.</div>';
    }
    renderChatPrivateList();
    renderChatMentionMenu();
    const oTaoNhom = document.getElementById('chatCreateGroupMembers');
    if (oTaoNhom) {
      oTaoNhom.innerHTML = thanhVienHeThong.filter(thanhVien => thanhVien.username !== currentUser?.username).map(thanhVien => `<label class="chat-create-member"><input type="checkbox" value="${escape(thanhVien.username)}"><span>${escape(thanhVien.name || thanhVien.username)} <small>@${escape(thanhVien.username)}</small></span></label>`).join('');
    }
  }

  function renderChatChannelList() {
    const target = document.getElementById('chatDanhSachNhom');
    if (!target) return;
    const groups = danhSachKenhChat.filter(kenh => kenh.loaiKenh === 'group');
    target.innerHTML = `<div class="chat-group-section">Kênh nhóm (${groups.length})</div>${groups.map(kenh => `<div class="chat-group-item ${kenh.maKenh === kenhChatDangChon ? 'active' : ''}" data-chat-kind="groups" onclick="moKenhChat('${encodeURIComponent(kenh.maKenh)}')"><span class="chat-group-icon"><i class="fa-solid fa-users"></i></span><span class="chat-group-copy"><strong>${escape(kenh.tenKenh)}</strong><span>${kenh.maKenh === 'datags-group' ? 'Trao đổi nội bộ' : `${kenh.tenThanhVien.length} thành viên`}</span></span><span class="chat-channel-unread ${kenh.soChuaDoc ? 'active' : ''}">${kenh.soChuaDoc > 99 ? '99+' : kenh.soChuaDoc || ''}</span></div>`).join('')}`;
    const channel = danhSachKenhChat.find(item => item.maKenh === kenhChatDangChon);
    const title = document.querySelector('#chatPopup .chat-header h4');
    if (title) title.innerHTML = `<i class="fa-solid ${channel?.loaiKenh === 'direct' ? 'fa-user' : 'fa-users'}"></i> ${escape(channel?.tenKenh || 'Thảo Luận Nhóm DATAGS')} <span class="chat-unread-badge" id="chatUnreadBadge">${kenhChatDangChon === 'datags-group' ? lastNotifiedUnread || '' : ''}</span>`;
    renderChatPrivateList();
    locDanhSachChat();
  }

  window.taiDanhSachKenhChat = async function () {
    try {
      const response = await fetch(`${API_CHAT_URL}/channels?${new URLSearchParams({ seen: JSON.stringify(mocDocTheoKenh()) })}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải danh sách kênh');
      danhSachKenhChat = result.data || [];
      soChuaDocTheoKenh = new Map(danhSachKenhChat.map(kenh => [kenh.maKenh, Number(kenh.soChuaDoc || 0)]));
      if (currentTab === 'chat') soChuaDocTheoKenh.set(kenhChatDangChon, 0);
      updateUnreadBadge([...soChuaDocTheoKenh.values()].reduce((sum, count) => sum + count, 0));
      renderChatChannelList();
    } catch (error) {
      console.error('Lỗi tải danh sách kênh chat:', error);
    }
  };

  window.taiThanhVienChat = async function () {
    try {
      const response = await fetch(`${API_CHAT_URL}/members`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải thành viên');
      thanhVienHeThong = result.data || [];
      renderThanhVienChat();
    } catch (error) {
      console.error('Lỗi tải thành viên chat:', error);
    }
  };

  window.moKenhChat = function (encodedKey) {
    const key = decodeURIComponent(encodedKey);
    if (!danhSachKenhChat.some(kenh => kenh.maKenh === key)) return;
    kenhChatDangChon = key;
    chatLoaded = false;
    chatMessages = [];
    renderChatChannelList();
    document.getElementById('chatBody')?.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat-empty', textContent: 'Đang tải cuộc trò chuyện...' }));
    loadHistory(true);
  };

  window.moTinRiengChat = async function (encodedUsername) {
    const memberUsername = decodeURIComponent(encodedUsername);
    try {
      const response = await fetch(`${API_CHAT_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'direct', memberUsernames: [memberUsername] })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể mở tin nhắn riêng');
      danhSachKenhChat = [...danhSachKenhChat.filter(kenh => kenh.maKenh !== result.data.maKenh), result.data];
      moKenhChat(encodeURIComponent(result.data.maKenh));
    } catch (error) {
      showAppToast?.(error.message, 'Tin nhắn riêng');
    }
  };

  async function loadHistory(forceReload) {
    if (chatLoading || (chatLoaded && !forceReload)) return;
    chatLoading = true;
    try {
      const params = new URLSearchParams({ channelKey: kenhChatDangChon, limit: '100' });
      const response = await fetch(`${API_CHAT_URL}/messages?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải lịch sử chat');
      const messages = result.data || [];
      const lastSeen = Number(localStorage.getItem(chatLastSeenKey(kenhChatDangChon)) || 0);
      if (currentTab !== 'chat' || !document.getElementById('chatPopup')) {
        const unread = messages.filter(message => message.senderUsername !== currentUser?.username && new Date(message.createdAt || 0).getTime() > lastSeen).length;
        soChuaDocTheoKenh.set(kenhChatDangChon, unread);
        updateUnreadBadge([...soChuaDocTheoKenh.values()].reduce((sum, count) => sum + count, 0));
      } else {
        markChatAsRead(messages);
      }
      chatMessages = messages;
      const unread = messages.filter(message => message.senderUsername !== currentUser?.username && new Date(message.createdAt || 0).getTime() > lastSeen).length;
      if (currentTab === 'chat' && kenhChatDangChon === messages[0]?.maKenh) soChuaDocTheoKenh.set(kenhChatDangChon, 0);
      else if (currentTab !== 'chat') soChuaDocTheoKenh.set(kenhChatDangChon, unread);
      renderMessages(messages);
      chatLoaded = true;
      const body = document.getElementById('chatBody');
      if (body) body.scrollTop = body.scrollHeight;
    } catch (error) {
      console.error('Lỗi tải lịch sử chat:', error);
      const body = document.getElementById('chatBody');
      if (body) body.innerHTML = '<div class="chat-empty">Không thể tải lịch sử. Vui lòng thử lại.</div>';
    } finally {
      chatLoading = false;
    }
  }

  window.renderChatPage = function () {
    const container = document.getElementById('mainContainerBox');
    const mauTrang = document.getElementById('mauTrangChat');
    if (!container || !mauTrang) {
      console.error('Không tìm thấy mẫu hoặc vùng hiển thị trang chat.');
      return;
    }
    container.replaceChildren(mauTrang.content.cloneNode(true));
    document.getElementById('chatInput').value = noiDungChatDangSoan;
    document.getElementById('chatFileName').textContent = droppedChatFile ? `Đã chọn: ${droppedChatFile.name}` : '';
    renderTheNguonChat();
    applyChatStyle();
    refreshOnlinePresence();
    if (chatLoaded) {
      renderMessages(chatMessages);
      markChatAsRead(chatMessages);
    }
    taiDanhSachKenhChat();
    taiThanhVienChat();
    loadHistory(true);
    clearInterval(chatRefreshTimer);
    chatRefreshTimer = setInterval(() => { loadHistory(true); taiDanhSachKenhChat(); }, 10000);
    document.getElementById('chatInput')?.focus();
  };

  window.restoreChatPage = function () {
    const oNhap = document.getElementById('chatInput');
    if (oNhap) noiDungChatDangSoan = oNhap.value;
    clearInterval(chatRefreshTimer);
    chatRefreshTimer = null;
  };

  window.chuyenDuLieuVaoChat = async function (noiDung, nguon = null) {
    nguonNghiepVuDangGan = nguon;
    noiDungChatDangSoan = '';
    if (currentTab !== 'chat') await switchTab('chat');
    const input = document.getElementById('chatInput');
    if (input) {
      input.value = noiDungChatDangSoan;
      input.focus();
      input.scrollIntoView({ block: 'nearest' });
      renderTheNguonChat();
    }
  };

  function renderTheNguonChat() {
    const container = document.getElementById('chatSourceChips');
    if (!container) return;
    container.innerHTML = nguonNghiepVuDangGan?.nhan
      ? `<span class="chat-source-chip"><i class="fa-solid fa-link"></i><span>${escape(nguonNghiepVuDangGan.nhan)}${nguonNghiepVuDangGan.mst ? ` · MST ${escape(nguonNghiepVuDangGan.mst)}` : ''}</span><button class="chat-source-remove" onclick="xoaNguonChat()" title="Bỏ đính kèm"><i class="fa-solid fa-xmark"></i></button></span>`
      : '';
  }

  window.xoaNguonChat = function () {
    nguonNghiepVuDangGan = null;
    renderTheNguonChat();
  };

  window.toggleChatPopup = function () {
    switchTab('chat');
  };

  window.toggleChatSearch = function () {
    const search = document.getElementById('chatSearch');
    if (!search) return;
    search.classList.toggle('active');
    if (search.classList.contains('active')) document.getElementById('chatSearchInput')?.focus();
    else window.clearChatSearch();
  };

  window.filterChatMessages = function () {
    const query = (document.getElementById('chatSearchInput')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#chatBody .chat-message').forEach(message => {
      const haystack = (message.dataset.chatSearch || '').toLowerCase();
      message.classList.toggle('filtered-out', Boolean(query) && !haystack.includes(query));
    });
  };

  window.clearChatSearch = function () {
    const input = document.getElementById('chatSearchInput');
    if (input) input.value = '';
    window.filterChatMessages();
  };

  window.toggleChatStylePanel = function () {
    applyChatStyle();
    document.getElementById('chatStylePanel')?.classList.toggle('active');
  };

  window.previewChatStyle = function () {
    applyChatStyle({
      outgoing: document.getElementById('chatOutgoingColor').value,
      incoming: document.getElementById('chatIncomingColor').value,
      text: document.getElementById('chatTextColor').value
    });
  };

  window.saveChatStyle = function () {
    const colors = { outgoing: document.getElementById('chatOutgoingColor').value, incoming: document.getElementById('chatIncomingColor').value, text: document.getElementById('chatTextColor').value };
    localStorage.setItem(chatStyleKey(), JSON.stringify(colors));
    applyChatStyle(colors);
    document.getElementById('chatStylePanel')?.classList.remove('active');
  };

  window.resetChatStyle = function () {
    localStorage.removeItem(chatStyleKey());
    applyChatStyle(macDinhMauChat());
  };

  window.chonMauChat = function (ten) {
    applyChatStyle(mauChatNhanh[ten] || macDinhMauChat());
  };

  window.loadChatHistory = loadHistory;
  window.handleChatKeyPress = function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      window.sendChatMessage();
    }
  };
  window.showChatFileName = function (event) {
    const file = event.target.files[0];
    droppedChatFile = file || null;
    document.getElementById('chatFileName').textContent = file ? `Đã chọn: ${file.name}` : '';
  };

  window.toggleChatEmojiPicker = function () {
    const picker = document.getElementById('chatEmojiPicker');
    picker?.classList.toggle('active');
    if (picker?.classList.contains('active')) {
      renderEmojiChat();
      setTimeout(() => document.getElementById('chatEmojiSearch')?.focus(), 0);
    }
  };

  function renderEmojiChat() {
    const grid = document.getElementById('chatEmojiGrid');
    if (!grid) return;
    const items = danhSachEmojiChat.filter(([emoji, nhom, keyword]) =>
      (nhomEmojiChat === 'all' || nhomEmojiChat === nhom) &&
      (!tuKhoaEmojiChat || `${emoji} ${keyword}`.toLowerCase().includes(tuKhoaEmojiChat))
    );
    grid.innerHTML = items.map(([emoji, , keyword]) => `<button type="button" onclick="insertChatEmoji('${emoji}')" title="${escape(keyword)}">${emoji}</button>`).join('');
  }

  window.locEmojiChat = function (value) {
    tuKhoaEmojiChat = String(value || '').toLowerCase();
    renderEmojiChat();
  };

  window.doiNhomEmojiChat = function (nhom) {
    nhomEmojiChat = nhom;
    document.querySelectorAll('.chat-emoji-tab').forEach(button => button.classList.toggle('active', button.dataset.emojiGroup === nhom));
    renderEmojiChat();
  };

  window.insertChatEmoji = function (emoji) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.value += emoji;
    input.focus();
    document.getElementById('chatEmojiPicker')?.classList.remove('active');
  };

  window.doiBoLocChat = function (filter) {
    boLocChat = filter;
    document.querySelectorAll('.chat-left-tab').forEach(button => button.classList.toggle('active', button.dataset.chatFilter === filter));
    locDanhSachChat();
  };

  window.locDanhSachChat = function () {
    const query = (document.getElementById('chatLeftSearch')?.value || '').trim().toLowerCase();
    const unread = Number(document.getElementById('chatUnreadBadge')?.textContent || 0) > 0;
    document.querySelectorAll('[data-chat-kind]').forEach(item => {
      const matchText = item.textContent.toLowerCase().includes(query);
      const matchFilter = boLocChat === 'all'
        || (boLocChat === 'groups' && item.dataset.chatKind === 'groups')
        || (boLocChat === 'private' && item.dataset.chatKind === 'private')
        || (boLocChat === 'unread' && item.dataset.chatKind === 'groups' && unread);
      item.hidden = !matchText || !matchFilter;
    });
  };

  window.doiBangChatPhai = function (panel) {
    ['members', 'files', 'pins'].forEach(name => {
      const element = document.getElementById(`chatPanel${name[0].toUpperCase()}${name.slice(1)}`);
      if (element) element.hidden = name !== panel;
    });
    document.querySelectorAll('.chat-right-tab').forEach(button => button.classList.toggle('active', button.dataset.chatPanel === panel));
  };

  window.chenDinhDangChat = function (kyTu) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.slice(start, end);
    const inserted = kyTu === '**' || kyTu === '*' ? `${kyTu}${selected || 'nội dung'}${kyTu}` : `${kyTu}${selected}`;
    input.value = `${input.value.slice(0, start)}${inserted}${input.value.slice(end)}`;
    input.focus();
  };

  window.moNhacTenChat = function (tenCoSan = '') {
    const menu = document.getElementById('chatMentionMenu');
    if (!menu) return;
    if (!tenCoSan && !thanhVienHeThong.length) return showAppToast?.('Chưa tải được danh sách thành viên.', 'Nhắc tên');
    if (tenCoSan) return chenNhacTenChat(encodeURIComponent(tenCoSan));
    menu.classList.toggle('active');
  };

  window.moGanHoSoChat = function () {
    document.getElementById('chatAttachDialog')?.showModal();
    document.getElementById('chatAttachSearch')?.focus();
  };

  window.dongGanHoSoChat = function () {
    document.getElementById('chatAttachDialog')?.close();
  };

  window.timHoSoGanChat = async function () {
    const query = document.getElementById('chatAttachSearch')?.value.trim() || '';
    const resultBox = document.getElementById('chatAttachResults');
    if (!resultBox) return;
    resultBox.classList.add('active');
    resultBox.innerHTML = '<div class="chat-right-empty">Đang tìm hồ sơ...</div>';
    try {
      const response = await fetch(`${API_HOSO_URL}?${new URLSearchParams({ q: query, page: '1', limit: '20' })}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tìm hồ sơ');
      const items = result.data?.items || result.items || result.data || [];
      resultBox.innerHTML = items.length
        ? items.map((item, index) => `<button type="button" class="chat-attach-result" onclick="ganHoSoChat(${index})"><span><strong>${escape(item['TÊN CÔNG TY'] || '--')}</strong><small>MST ${escape(item.MST || '--')} · ${escape(item.ID || item.STT || 'Hồ sơ')}</small></span><i class="fa-solid fa-plus"></i></button>`).join('')
        : '<div class="chat-right-empty">Không tìm thấy hồ sơ phù hợp.</div>';
      window.ketQuaHoSoGanChat = items;
    } catch (error) {
      resultBox.innerHTML = `<div class="chat-right-empty" style="color:#dc2626">${escape(error.message)}</div>`;
    }
  };

  window.ganHoSoChat = async function (index) {
    const hoSo = window.ketQuaHoSoGanChat?.[index];
    if (!hoSo) return;
    const noiDung = `📁 Hồ sơ: ${hoSo['TÊN CÔNG TY'] || '--'}\nMST: ${hoSo.MST || '--'}\nMã hồ sơ: ${hoSo.ID || hoSo.STT || '--'}\nTình trạng: ${hoSo['TÌNH TRẠNG HỒ SƠ'] || 'Chưa cập nhật'}`;
    await chuyenDuLieuVaoChat(noiDung, { loai: 'hoso', nhan: `Hồ sơ ${hoSo.ID || hoSo.STT || hoSo['TÊN CÔNG TY'] || ''}`, ma: hoSo.ID || hoSo.STT || '', mst: hoSo.MST || '', trangThai: hoSo['TÌNH TRẠNG HỒ SƠ'] || '', tenCongTy: hoSo['TÊN CÔNG TY'] || '', loaiHoSo: hoSo['LOẠI'] || hoSo.NCC || '' });
    dongGanHoSoChat();
  };

  window.moHoSoTuChat = async function (maHoSo, mst) {
    const tuKhoa = maHoSo || mst;
    if (!tuKhoa) return;
    await switchTab('hoso');
    hoSoQuanLy.q = tuKhoa;
    hoSoQuanLy.page = 1;
    await taiDuLieuHoSo(1);
    const index = hoSoQuanLy.items.findIndex(hoSo => String(hoSo.ID || hoSo.STT || '') === String(maHoSo) || String(hoSo.MST || '') === String(mst));
    if (index >= 0) moChiTietHoSo(index);
    else showAppToast?.('Không tìm thấy hồ sơ hoặc bạn không có quyền xem.', 'Mở hồ sơ');
  };

  window.moGanDonHangChat = function () {
    document.getElementById('chatOrderDialog')?.showModal();
    document.getElementById('chatOrderSearch')?.focus();
  };

  window.dongGanDonHangChat = function () {
    document.getElementById('chatOrderDialog')?.close();
  };

  window.timDonHangGanChat = async function () {
    const query = document.getElementById('chatOrderSearch')?.value.trim() || '';
    const resultBox = document.getElementById('chatOrderResults');
    if (!resultBox) return;
    resultBox.classList.add('active');
    resultBox.innerHTML = '<div class="chat-right-empty">Đang tìm đơn hàng...</div>';
    try {
      const response = await fetch(`${API_URL}?${new URLSearchParams({ q: query, page: '1', limit: '20', includeCount: '0' })}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tìm đơn hàng');
      const items = result.data?.items || [];
      resultBox.innerHTML = items.length
        ? items.map((item, index) => `<button type="button" class="chat-attach-result" onclick="ganDonHangChat(${index})"><span><strong>#${escape(item['Mã Đơn Hàng'] || '--')} · ${escape(item['Tên Công Ty '] || item['Tên Khách Hàng'] || '--')}</strong><small>MST ${escape(item.MST || '--')} · ${escape(item['TÌNH TRẠNG'] || 'Chưa cập nhật')}</small></span><i class="fa-solid fa-plus"></i></button>`).join('')
        : '<div class="chat-right-empty">Không tìm thấy đơn hàng phù hợp.</div>';
      window.ketQuaDonHangGanChat = items;
    } catch (error) {
      resultBox.innerHTML = `<div class="chat-right-empty" style="color:#dc2626">${escape(error.message)}</div>`;
    }
  };

  window.ganDonHangChat = async function (index) {
    const donHang = window.ketQuaDonHangGanChat?.[index];
    if (!donHang) return;
    const maDon = donHang['Mã Đơn Hàng'] || '--';
    const mst = donHang.MST || '';
    const trangThai = donHang['TÌNH TRẠNG'] || 'Chưa cập nhật';
    const tenCongTy = donHang['Tên Công Ty '] || donHang['Tên Khách Hàng'] || '';
    const tenGoi = donHang['Gói '] || donHang['Tên Sản Phẩm'] || donHang.NCC || '';
    await chuyenDuLieuVaoChat(
      `📦 Đơn hàng #${maDon}\nMST: ${mst || '--'}\nCông ty: ${donHang['Tên Công Ty '] || donHang['Tên Khách Hàng'] || '--'}\nTình trạng: ${trangThai}`,
      { loai: 'donhang', nhan: `Đơn #${maDon}`, ma: maDon, mst, trangThai, tenCongTy, tenGoi, maDoiTuong: String(donHang._id || '') }
    );
    dongGanDonHangChat();
  };

  window.moDonHangTuChat = async function (maDoiTuong, maDon) {
    try {
      let orderId = maDoiTuong;
      if (!orderId && maDon) {
        const response = await fetch(`${API_URL}?${new URLSearchParams({ q: maDon, page: '1', limit: '20', includeCount: '0' })}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tìm đơn hàng');
        orderId = result.data?.items?.find(item => String(item['Mã Đơn Hàng'] || '') === String(maDon))?._id;
      }
      if (!orderId) throw new Error('Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn này.');
      await switchTab('orders');
      await showDetail(orderId);
    } catch (error) {
      showAppToast?.(error.message, 'Mở đơn hàng');
    }
  };

  window.moThamDoChat = function () {
    document.getElementById('chatPollDialog')?.showModal();
    document.getElementById('chatPollQuestion')?.focus();
  };

  window.dongThamDoChat = function () {
    document.getElementById('chatPollDialog')?.close();
  };

  window.chenThamDoChat = function () {
    const question = document.getElementById('chatPollQuestion')?.value.trim();
    const options = [...document.querySelectorAll('.chat-poll-option')].map(input => input.value.trim()).filter(Boolean);
    if (!question || options.length < 2) return showAppToast?.('Nhập câu hỏi và ít nhất hai phương án.', 'Thăm dò ý kiến');
    const input = document.getElementById('chatInput');
    const poll = `📊 ${question}\n${options.map((option, index) => `${index + 1}. ☐ ${option}`).join('\n')}`;
    input.value = `${input.value.trim() ? `${input.value.trim()}\n\n` : ''}${poll}`;
    noiDungChatDangSoan = input.value;
    dongThamDoChat();
    input.focus();
  };

  window.chenNhacTenChat = function (tenMaHoa, thayTheTuKhoa = false) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const ten = decodeURIComponent(tenMaHoa);
    if (thayTheTuKhoa) {
      const beforeCursor = input.value.slice(0, input.selectionStart);
      const match = beforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
      if (match) input.value = input.value.slice(0, match.index) + `@${ten} ` + input.value.slice(input.selectionStart);
      else input.value += `@${ten} `;
    } else {
      input.value += `${input.value.endsWith(' ') || !input.value ? '' : ' '}@${ten} `;
    }
    document.getElementById('chatMentionMenu')?.classList.remove('active');
    input.focus();
  };

  window.capNhatDangNhapChat = function () {
    capNhatGoiYNhanVienChat();
    capNhatGoiYDonHangChat();
    const now = Date.now();
    if (now - lanGuiDangNhapCuoi >= 2500) {
      lanGuiDangNhapCuoi = now;
      fetch(`${API_CHAT_URL}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: true }) }).catch(() => {});
    }
    clearTimeout(henGioDangNhap);
    henGioDangNhap = setTimeout(() => {
      lanGuiDangNhapCuoi = 0;
      fetch(`${API_CHAT_URL}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: false }) }).catch(() => {});
    }, 2200);
  };

  function capNhatGoiYNhanVienChat() {
    const input = document.getElementById('chatInput');
    const menu = document.getElementById('chatMentionMenu');
    if (!input || !menu) return;
    const beforeCursor = input.value.slice(0, input.selectionStart);
    const match = beforeCursor.match(/(^|\\s)@([a-zA-Z0-9_.-]*)$/);
    if (!match) {
      menu.classList.remove('active');
      return;
    }
    menu.dataset.keyword = match[2];
    renderChatMentionMenu();
    menu.classList.toggle('active', Boolean(menu.querySelector('.chat-mention-option')));
  }

  async function capNhatGoiYDonHangChat() {
    const input = document.getElementById('chatInput');
    const menu = document.getElementById('chatOrderSuggestionMenu');
    if (!input || !menu) return;
    const beforeCursor = input.value.slice(0, input.selectionStart);
    const match = beforeCursor.match(/(^|\\s)#([^\\s#]*)$/);
    clearTimeout(henGioTimDonChat);
    if (!match) {
      menu.classList.remove('active');
      return;
    }
    const tuKhoa = match[2];
    menu.classList.add('active');
    menu.innerHTML = '<div class="chat-right-empty">Đang tìm đơn hàng...</div>';
    henGioTimDonChat = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}?${new URLSearchParams({ q: tuKhoa, page: '1', limit: '12', includeCount: '0' })}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tìm đơn hàng');
        const items = result.data?.items || [];
        menu.innerHTML = items.length
          ? items.map((item, index) => `<button type="button" class="chat-order-suggestion" onclick="chonGoiYDonChat(${index})"><span><strong>#${escape(item['Mã Đơn Hàng'] || '--')}</strong><small>${escape(item['Tên Công Ty '] || item['Tên Khách Hàng'] || '--')} · MST ${escape(item.MST || '--')}</small></span><i class="fa-solid fa-plus"></i></button>`).join('')
          : '<div class="chat-right-empty">Không tìm thấy đơn hàng.</div>';
        window.ketQuaGoiYDonChat = items;
      } catch (error) {
        menu.innerHTML = `<div class="chat-right-empty" style="color:#dc2626">${escape(error.message)}</div>`;
      }
    }, 300);
  }

  window.chonGoiYDonChat = async function (index) {
    const donHang = window.ketQuaGoiYDonChat?.[index];
    const input = document.getElementById('chatInput');
    if (!donHang || !input) return;
    const beforeCursor = input.value.slice(0, input.selectionStart);
    const match = beforeCursor.match(/(^|\\s)#([^\\s#]*)$/);
    if (match) input.value = input.value.slice(0, match.index + match[1].length) + input.value.slice(input.selectionStart);
    const maDon = donHang['Mã Đơn Hàng'] || '';
    await chuyenDuLieuVaoChat('', {
      loai: 'donhang', nhan: `Đơn #${maDon}`, ma: maDon, mst: donHang.MST || '',
      trangThai: donHang['TÌNH TRẠNG'] || '', tenCongTy: donHang['Tên Công Ty '] || donHang['Tên Khách Hàng'] || '',
      tenGoi: donHang['Gói '] || donHang['Tên Sản Phẩm'] || donHang.NCC || '', maDoiTuong: String(donHang._id || '')
    });
    input.value = input.value.trimStart();
    document.getElementById('chatOrderSuggestionMenu')?.classList.remove('active');
    input.focus();
  };

  window.traLoiChat = function (messageId) {
    const message = chatMessages.find(item => String(item._id) === String(messageId));
    if (!message) return;
    tinNhanTraLoi = {
      messageId,
      senderUsername: message.senderUsername,
      text: (message.text || message.attachmentName || '').slice(0, 300)
    };
    const preview = document.getElementById('chatReplyPreview');
    if (preview) preview.classList.add('active');
    const text = document.getElementById('chatReplyPreviewText');
    if (text) text.textContent = `Trả lời ${tinNhanTraLoi.senderUsername}: ${tinNhanTraLoi.text}`;
    document.getElementById('chatInput')?.focus();
  };

  window.huyTraLoiChat = function () {
    tinNhanTraLoi = null;
    document.getElementById('chatReplyPreview')?.classList.remove('active');
  };

  window.phanUngChat = async function (messageId, emoji) {
    try {
      const response = await fetch(`${API_CHAT_URL}/${encodeURIComponent(messageId)}/reaction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể cập nhật phản ứng');
      const idx = chatMessages.findIndex(item => String(item._id) === String(messageId));
      if (idx >= 0 && result.data) {
        chatMessages[idx] = result.data;
        renderMessages(chatMessages);
      }
    } catch (error) {
      showAppToast?.(error.message, 'Phản ứng tin nhắn');
    }
  };

  window.danhDauXemChat = async function (messageId) {
    try {
      const response = await fetch(`${API_CHAT_URL}/${encodeURIComponent(messageId)}/view`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể đánh dấu đã xem');
      const messageIndex = chatMessages.findIndex(message => String(message._id) === String(messageId));
      if (messageIndex >= 0) chatMessages[messageIndex] = result.data;
      renderMessages(chatMessages);
    } catch (error) {
      showAppToast?.(error.message, 'Xem tin nhắn');
    }
  };

  window.cuonDenTinNhanChat = function (messageId) {
    const message = document.querySelector(`[data-chat-id="${messageId}"]`);
    message?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.danhDauXemChat(messageId);
  };

  window.moPhanUngChat = function (messageId) {
    phanUngChat(messageId, '👍');
  };

  window.ghimTinChat = async function (messageId) {
    try {
      const response = await fetch(`${API_CHAT_URL}/${encodeURIComponent(messageId)}/pin`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể ghim tin nhắn');
      const idx = chatMessages.findIndex(item => String(item._id) === String(messageId));
      if (idx >= 0 && result.data) {
        chatMessages[idx] = result.data;
        renderMessages(chatMessages);
      }
    } catch (error) {
      showAppToast?.(error.message, 'Ghim tin nhắn');
    }
  };

  window.boGhimTinChat = async function (messageId) {
    const message = chatMessages.find(item => String(item._id) === String(messageId));
    if (!message?.daGhim) return;
    await ghimTinChat(messageId);
  };

  window.cheDoChatToanManHinh = function () {
    document.querySelector('.chat-workspace')?.requestFullscreen?.();
  };

  window.taoNhomChat = async function () {
    renderThanhVienChat();
    document.getElementById('chatCreateGroupDialog')?.showModal();
    document.getElementById('chatGroupName')?.focus();
  };

  window.dongTaoNhomChat = function () {
    document.getElementById('chatCreateGroupDialog')?.close();
  };

  window.xacNhanTaoNhomChat = async function () {
    const name = document.getElementById('chatGroupName')?.value.trim();
    const memberUsernames = [...document.querySelectorAll('#chatCreateGroupMembers input:checked')].map(input => input.value);
    if (!name) return showAppToast?.('Vui lòng nhập tên nhóm.', 'Tạo nhóm chat');
    if (!memberUsernames.length) return showAppToast?.('Chọn ít nhất một thành viên.', 'Tạo nhóm chat');
    try {
      const response = await fetch(`${API_CHAT_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'group', name: name.trim(), memberUsernames })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tạo nhóm');
      await taiDanhSachKenhChat();
      moKenhChat(encodeURIComponent(result.data.maKenh));
      dongTaoNhomChat();
      document.getElementById('chatGroupName').value = '';
    } catch (error) {
      showAppToast?.(error.message, 'Tạo nhóm chat');
    }
  };

  window.handleChatDragOver = function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    document.getElementById('chatPopup')?.classList.add('chat-drop-active');
  };

  window.handleChatDragLeave = function (event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    document.getElementById('chatPopup')?.classList.remove('chat-drop-active');
  };

  window.handleChatDrop = function (event) {
    event.preventDefault();
    document.getElementById('chatPopup')?.classList.remove('chat-drop-active');
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('Tệp đính kèm không được vượt quá 5MB.');
    droppedChatFile = file;
    document.getElementById('chatFileName').textContent = `Đã chọn: ${file.name}`;
  };

  window.sendChatMessage = async function () {
    if (chatSending) return;
    const input = document.getElementById('chatInput');
    const fileInput = document.getElementById('chatFileInput');
    const text = input.value.trim();
    const file = droppedChatFile || fileInput.files[0];
    if (!text && !file && !nguonNghiepVuDangGan) return;
    if (file && file.size > 5 * 1024 * 1024) return alert('Tệp đính kèm không được vượt quá 5MB.');
    chatSending = true;
    const kenhGui = kenhChatDangChon;
    const traLoiGui = tinNhanTraLoi;
    const nguonGui = nguonNghiepVuDangGan;
    const sendButton = document.querySelector('.chat-send-btn');
    if (sendButton) { sendButton.disabled = true; sendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    clearTimeout(henGioDangNhap);
    lanGuiDangNhapCuoi = 0;

    // Hiển thị tức thì tin nhắn tạm khi gửi tin nhắn văn bản
    const tempId = !file ? `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : '';
    if (tempId) {
      chatMessages.push({
        _id: tempId,
        senderUsername: currentUser?.username || 'Thành viên',
        maKenh: kenhGui,
        text,
        attachmentName: '',
        attachmentSize: 0,
        attachmentType: '',
        coTepDinhKem: false,
        traLoi: traLoiGui || {},
        nguonNghiepVu: nguonGui || {},
        phanUng: [],
        luotXem: [],
        daGhim: false,
        createdAt: new Date().toISOString()
      });
      input.value = '';
      noiDungChatDangSoan = '';
      nguonNghiepVuDangGan = null;
      renderTheNguonChat();
      huyTraLoiChat();
      renderMessages(chatMessages);
      const bodyEl = document.getElementById('chatBody');
      if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    const reader = file ? new FileReader() : null;
    try {
      const attachmentData = file ? await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : '';
      const response = await fetch(`${API_CHAT_URL}/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelKey: kenhGui, text, attachmentName: file?.name || '', attachmentSize: file?.size || 0, attachmentType: file?.type || '', attachmentData, replyTo: traLoiGui, nguonNghiepVu: nguonGui }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể gửi tin nhắn');

      if (!tempId) {
        input.value = '';
        noiDungChatDangSoan = '';
        fileInput.value = '';
        droppedChatFile = null;
        nguonNghiepVuDangGan = null;
        renderTheNguonChat();
        huyTraLoiChat();
        document.getElementById('chatFileName').textContent = '';
      }

      if (kenhChatDangChon === kenhGui && result.data) {
        if (tempId) {
          const tempIdx = chatMessages.findIndex(item => String(item._id) === tempId);
          if (tempIdx >= 0) chatMessages[tempIdx] = result.data;
          else if (!chatMessages.some(item => String(item._id) === String(result.data._id))) chatMessages.push(result.data);
        } else if (!chatMessages.some(item => String(item._id) === String(result.data._id))) {
          chatMessages.push(result.data);
        }
        if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
        if (attachmentData && result.data._id) {
          if (boNhoTepChat.size >= 20) boNhoTepChat.delete(boNhoTepChat.keys().next().value);
          boNhoTepChat.set(String(result.data._id), {
            attachmentName: result.data.attachmentName,
            attachmentType: result.data.attachmentType,
            attachmentSize: result.data.attachmentSize,
            attachmentData
          });
        }
        chatLoaded = true;
        markChatAsRead(chatMessages);
        renderMessages(chatMessages);
        const bodyEl = document.getElementById('chatBody');
        if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
      }
      fetch(`${API_CHAT_URL}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing: false }) }).catch(() => {});
    } catch (error) {
      if (tempId) {
        chatMessages = chatMessages.filter(item => String(item._id) !== tempId);
        input.value = text;
        noiDungChatDangSoan = text;
        nguonNghiepVuDangGan = nguonGui;
        renderTheNguonChat();
        renderMessages(chatMessages);
      }
      alert(`Không thể gửi tin nhắn: ${error.message}`);
    } finally {
      chatSending = false;
      if (sendButton) { sendButton.disabled = false; sendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; }
      input?.focus();
    }
  };

  window.recallChatMessage = async function (messageId) {
    if (!confirm('Thu hồi tin nhắn này?')) return;
    try {
      const response = await fetch(`${API_CHAT_URL}/${messageId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể thu hồi tin nhắn');
      chatMessages = chatMessages.filter(item => String(item._id) !== String(messageId));
      boNhoTepChat.delete(String(messageId));
      renderMessages(chatMessages);
    } catch (error) {
      alert(`Không thể thu hồi tin nhắn: ${error.message}`);
    }
  };

  chatWatcherTimer = window.setInterval(() => {
    if (!currentUser) return;
    if (currentTab !== 'chat') {
      taiDanhSachKenhChat();
    }
    refreshOnlinePresence();
  }, 15000);
}());
