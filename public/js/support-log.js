let isSavingSupportLog = false;

async function saveSupportLog(assignTask = false) {
  if (isSavingSupportLog) return;
  const panel = document.getElementById('mstQuickSupportPanel');
  const mst = panel?.dataset.mst;
  const company = panel?.dataset.company || '';
  const customerName = document.getElementById('supportLogCustomerName').value.trim();
  const customerPhone = document.getElementById('supportLogCustomerPhone').value.trim();
  const assignee = document.getElementById('supportLogAssignee').value;
  const request = document.getElementById('supportLogRequest').value.trim();
  const resolution = document.getElementById('supportLogResolution').value.trim();
  const deadline = document.getElementById('supportLogDeadline').value;
  if (!mst) return alert('Không xác định được MST hỗ trợ.');
  if (!request) return alert('Vui lòng nhập nội dung khách hàng cần hỗ trợ.');
  if (assignTask && !assignee) return alert('Vui lòng chọn người phụ trách xử lý yêu cầu này.');

  const buttons = [...panel.querySelectorAll('[data-support-save]')];
  const activeButton = panel.querySelector(`[data-support-save="${assignTask ? 'assign' : 'only'}"]`);
  isSavingSupportLog = true;
  buttons.forEach(button => { button.disabled = true; });
  if (activeButton) {
    activeButton.dataset.originalHtml = activeButton.innerHTML;
    activeButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

  try {
    const response = await fetch(`${API_URL.replace('/api/orders', '')}/api/support-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mst,
        company,
        customerName,
        customerPhone,
        channel: document.getElementById('supportLogChannel').value,
        type: document.getElementById('supportLogType').value,
        assignee: assignTask ? assignee : '',
        request,
        resolution,
        status: document.getElementById('supportLogStatus').value,
        deadline,
        followUp: document.getElementById('supportLogFollowUp').value.trim()
      })
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      throw new Error(responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')
        ? 'Server chưa nhận route hỗ trợ mới. Vui lòng khởi động lại server.js rồi thử lại.'
        : `Server trả về phản hồi không hợp lệ (HTTP ${response.status}).`);
    }
    if (!response.ok || !result.success) throw new Error(result.message || 'Không thể lưu hỗ trợ online.');

    closeSupportLog();
    if (assignTask) {
      const taskDue = deadline ? deadline.slice(0, 10) : '';
      const taskTitle = `Hỗ trợ khách hàng ${customerName || company || `MST ${mst}`}`;
      const taskDescription = `${document.getElementById('supportLogType').value}: ${request}. Hướng xử lý: ${resolution}`;
      const assignedBy = currentUser?.name || currentUser?.username || 'Hệ thống';
      allTasks.unshift({
        id: `task-support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: taskTitle,
        description: taskDescription,
        owner: assignee,
        assignedBy,
        due: taskDue,
        priority: 'Cao',
        progress: 0,
        status: 'Chưa bắt đầu',
        supportLogId: result.data?._id || '',
        supportCode: result.data?.supportCode || ''
      });
      persistTasks();
      await switchTab('tasks');
      showAppToast(result.duplicate
        ? `Yêu cầu hỗ trợ này đã được lưu trước đó (Mã: ${result.data?.supportCode || '--'}). Đã giao việc cho ${assignee}.`
        : `Mã hỗ trợ: ${result.data?.supportCode || 'đang cập nhật'}. Đã giao việc cho ${assignee}.`);
    } else {
      showAppToast(result.duplicate
        ? `Yêu cầu hỗ trợ này đã được lưu trước đó (Mã: ${result.data?.supportCode || '--'}). Chưa phân công công việc.`
        : `Đã lưu hỗ trợ (Mã: ${result.data?.supportCode || 'đang cập nhật'}). Chưa phân công công việc.`);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    isSavingSupportLog = false;
    buttons.forEach(button => {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    });
  }
}
