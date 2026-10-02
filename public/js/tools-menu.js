(function () {
  function createToolButton({ title, icon, enabled, onClick }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${enabled ? 'btn-primary' : 'btn-secondary'}`;
    button.disabled = !enabled;
    button.title = enabled ? title : 'Bạn không có quyền sử dụng chức năng này';
    button.innerHTML = `<i class="${icon}" aria-hidden="true"></i> ${title}`;
    if (enabled) button.addEventListener('click', onClick);
    return button;
  }

  window.renderToolsMenu = function (container, options) {
    const heading = document.createElement('h2');
    heading.className = 'overview-card-title';
    heading.innerHTML = '<i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> Công Cụ';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem;';
    actions.append(
      createToolButton({
        title: 'Nhập Hồ Sơ',
        icon: 'fa-solid fa-file-circle-plus',
        enabled: Boolean(options.canImportRegistration),
        onClick: options.onImportRegistration
      }),
      createToolButton({
        title: 'Kiểm Tra Công Nợ',
        icon: 'fa-solid fa-magnifying-glass-dollar',
        enabled: Boolean(options.canCheckDebt),
        onClick: options.onCheckDebt
      })
    );

    container.replaceChildren(heading, actions);
  };
})();