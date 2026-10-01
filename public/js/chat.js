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
  const chatLastSeenKey = () => `datags_chat_last_seen_${currentUser?.username || 'guest'}`;

  function chatStyleKey() { return `datags_chat_colors_${currentUser?.username || 'guest'}`; }

  function applyChatStyle(colors) {
    const saved = colors || JSON.parse(localStorage.getItem(chatStyleKey()) || 'null') || { text: '#f8fafc', border: '#1e3a5f', outer: '#1e3a5f' };
    const popup = document.getElementById('chatPopup');
    if (popup) {
      popup.style.setProperty('--chat-text-color', saved.text);
      popup.style.setProperty('--chat-border-color', saved.border);
      popup.style.setProperty('--chat-outer-color', saved.outer || saved.border);
    }
    const textInput = document.getElementById('chatTextColor');
    const borderInput = document.getElementById('chatBorderColor');
    const outerInput = document.getElementById('chatOuterColor');
    if (textInput) textInput.value = saved.text;
    if (borderInput) borderInput.value = saved.border;
    if (outerInput) outerInput.value = saved.outer || saved.border;
  }

  function escape(value) {
    return escapeHtml(String(value || ''));
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatMessageText(value) {
    return escape(value).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;font-weight:700;">$1</a>');
  }

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
    if (chatHasSnapshot && count > lastNotifiedUnread && !document.getElementById('chatPopup')?.classList.contains('active')) {
      window.showAppToast?.(`${count} tin nhắn mới trong Chat Nhóm.`, 'Chat Nhóm');
    }
    lastNotifiedUnread = count;
    chatHasSnapshot = true;
  }

  function markChatAsRead(messages) {
    const newest = messages.reduce((latest, message) => Math.max(latest, new Date(message.createdAt || 0).getTime()), 0);
    if (newest) localStorage.setItem(chatLastSeenKey(), String(newest));
    updateUnreadBadge(0);
  }

  function updatePresence(messages) {
    const presence = document.getElementById('chatPresence');
    if (!presence) return;
    const members = new Set(messages.map(message => message.senderUsername).filter(Boolean));
    presence.textContent = members.size ? `${members.size} thành viên đã tham gia` : 'Kênh trao đổi nội bộ';
  }

  function renderMessages(messages) {
    const body = document.getElementById('chatBody');
    if (!body) return;
    if (!messages.length) {
      body.innerHTML = '<div class="chat-empty">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</div>';
      return;
    }
    body.innerHTML = messages.map(message => {
      const mine = message.senderUsername === currentUser?.username;
      const attachment = message.attachmentData
        ? `<a class="chat-message-attachment" href="${escape(message.attachmentData)}" download="${escape(message.attachmentName || 'tep-dinh-kem')}"><i class="fa-solid fa-paperclip"></i><span>${escape(message.attachmentName || 'Tệp đính kèm')}<small>${formatFileSize(message.attachmentSize)}</small></span></a>`
        : '';
      const recall = mine ? `<button class="chat-delete-btn" onclick="recallChatMessage('${escape(message._id)}')" title="Thu hồi tin nhắn"><i class="fa-solid fa-trash-can"></i></button>` : '';
      return `<div class="chat-message ${mine ? 'outgoing' : 'incoming'}" data-chat-search="${escape(`${message.senderUsername || ''} ${message.text || ''} ${message.attachmentName || ''}`)}">${recall}<span class="sender">${escape(mine ? 'Bạn' : message.senderUsername || 'Thành viên')}</span>${message.text ? formatMessageText(message.text) : ''}${attachment}<span class="chat-message-time">${formatTime(message.createdAt)}${mine ? '<span class="chat-message-status">Đã gửi</span>' : ''}</span></div>`;
    }).join('');
    filterChatMessages();
  }

  async function loadHistory(forceReload) {
    if (chatLoading || (chatLoaded && !forceReload)) return;
    chatLoading = true;
    try {
      const response = await fetch(`${API_CHAT_URL}/all`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể tải lịch sử chat');
      const messages = result.data || [];
      const popup = document.getElementById('chatPopup');
      const lastSeen = Number(localStorage.getItem(chatLastSeenKey()) || 0);
      if (!popup?.classList.contains('active')) {
        const unread = messages.filter(message => message.senderUsername !== currentUser?.username && new Date(message.createdAt || 0).getTime() > lastSeen).length;
        updateUnreadBadge(unread);
      } else {
        markChatAsRead(messages);
      }
      chatMessages = messages;
      renderMessages(messages);
      updatePresence(messages);
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

  window.toggleChatPopup = function () {
    const popup = document.getElementById('chatPopup');
    if (!popup) return;
    popup.classList.toggle('active');
    if (popup.classList.contains('active')) {
      applyChatStyle();
      loadHistory(false);
      clearInterval(chatRefreshTimer);
      chatRefreshTimer = setInterval(() => loadHistory(true), 10000);
      document.getElementById('chatInput')?.focus();
    } else {
      clearInterval(chatRefreshTimer);
      chatRefreshTimer = null;
    }
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
    applyChatStyle({ text: document.getElementById('chatTextColor').value, border: document.getElementById('chatBorderColor').value, outer: document.getElementById('chatOuterColor').value });
  };

  window.saveChatStyle = function () {
    const colors = { text: document.getElementById('chatTextColor').value, border: document.getElementById('chatBorderColor').value, outer: document.getElementById('chatOuterColor').value };
    localStorage.setItem(chatStyleKey(), JSON.stringify(colors));
    applyChatStyle(colors);
    document.getElementById('chatStylePanel')?.classList.remove('active');
  };

  window.resetChatStyle = function () {
    localStorage.removeItem(chatStyleKey());
    applyChatStyle({ text: '#f8fafc', border: '#1e3a5f', outer: '#1e3a5f' });
  };

  window.loadChatHistory = loadHistory;
  window.handleChatKeyPress = function (event) { if (event.key === 'Enter') window.sendChatMessage(); };
  window.showChatFileName = function (event) {
    const file = event.target.files[0];
    droppedChatFile = file || null;
    document.getElementById('chatFileName').textContent = file ? `Đã chọn: ${file.name}` : '';
  };

  window.toggleChatEmojiPicker = function () {
    document.getElementById('chatEmojiPicker')?.classList.toggle('active');
  };

  window.insertChatEmoji = function (emoji) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.value += emoji;
    input.focus();
    document.getElementById('chatEmojiPicker')?.classList.remove('active');
  };

  window.handleChatDragOver = function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    document.getElementById('chatBody')?.classList.add('chat-drop-active');
  };

  window.handleChatDragLeave = function (event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    document.getElementById('chatBody')?.classList.remove('chat-drop-active');
  };

  window.handleChatDrop = function (event) {
    event.preventDefault();
    document.getElementById('chatBody')?.classList.remove('chat-drop-active');
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
    if (!text && !file) return;
    if (file && file.size > 5 * 1024 * 1024) return alert('Tệp đính kèm không được vượt quá 5MB.');
    chatSending = true;
    const sendButton = document.querySelector('.chat-send-btn');
    if (sendButton) { sendButton.disabled = true; sendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    const reader = file ? new FileReader() : null;
    try {
      const attachmentData = file ? await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : '';
      const response = await fetch(`${API_CHAT_URL}/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, attachmentName: file?.name || '', attachmentSize: file?.size || 0, attachmentType: file?.type || '', attachmentData }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể gửi tin nhắn');
      input.value = '';
      fileInput.value = '';
      droppedChatFile = null;
      document.getElementById('chatFileName').textContent = '';
      chatLoaded = false;
      await loadHistory(true);
    } catch (error) {
      alert(`Không thể gửi tin nhắn: ${error.message}`);
    } finally {
      chatSending = false;
      if (sendButton) { sendButton.disabled = false; sendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; }
    }
  };

  window.recallChatMessage = async function (messageId) {
    if (!confirm('Thu hồi tin nhắn này?')) return;
    try {
      const response = await fetch(`${API_CHAT_URL}/${messageId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không thể thu hồi tin nhắn');
      await loadHistory(true);
    } catch (error) {
      alert(`Không thể thu hồi tin nhắn: ${error.message}`);
    }
  };

  chatWatcherTimer = window.setInterval(() => {
    if (currentUser) loadHistory(true);
  }, 10000);
}());
