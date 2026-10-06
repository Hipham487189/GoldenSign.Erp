// Đồng bộ công việc lên server để mọi tài khoản (admin, nhân viên) cùng thấy.
(function () {
  const POLL_MS = 15000;
  const TASKS_URL = () => API_BASE_URL + '/api/tasks';
  let synced = new Map();
  let pending = 0;

  const snapshot = list => new Map((list || []).map(task => [String(task.id), JSON.stringify(task)]));

  async function send(url, options) {
    pending++;
    try {
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
      if (!response.ok) throw new Error('HTTP ' + response.status);
    } catch (error) {
      console.warn('Không thể đồng bộ công việc:', error);
      return false;
    } finally { pending--; }
    return true;
  }

  async function pushChanges() {
    const current = snapshot(allTasks);
    const jobs = [];
    allTasks.forEach(task => {
      const id = String(task.id);
      if (synced.get(id) === current.get(id)) return;
      synced.set(id, current.get(id));
      jobs.push(send(TASKS_URL() + '/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(task) }));
    });
    [...synced.keys()].filter(id => !current.has(id)).forEach(id => {
      synced.delete(id);
      jobs.push(send(TASKS_URL() + '/' + encodeURIComponent(id), { method: 'DELETE' }));
    });
    await Promise.all(jobs);
  }

  window.persistTasks = function () {
    if (currentTab === 'overview') renderOverviewDashboard();
    pushChanges();
  };

  async function pullTasks() {
    if (!authToken || pending || document.hidden) return;
    try {
      const response = await fetch(TASKS_URL() + '/all');
      if (!response.ok) return;
      const result = await response.json();
      if (!result.success || pending) return;
      const next = snapshot(result.data);
      const changed = next.size !== synced.size || [...next].some(([id, json]) => synced.get(id) !== json);
      if (!changed) return;
      allTasks = result.data;
      synced = next;
      if (currentTab === 'overview') renderOverviewDashboard();
      else if (currentTab === 'tasks') renderTaskListOnly();
      if (document.getElementById('taskListPopup')?.classList.contains('active')) renderTaskListPopup();
    } catch (error) { console.warn('Không thể tải công việc:', error); }
  }

  window.refreshTasksFromServer = pullTasks;
  allTasks = [];
  pullTasks();
  setInterval(pullTasks, POLL_MS);
})();