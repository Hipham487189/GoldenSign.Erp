(function () {
  var STORAGE_KEY = 'theme';
  var root = document.documentElement;

  function readTheme() {
    try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; } catch (error) { return 'light'; }
  }

  function syncControls(theme) {
    var nextLabel = theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
    document.querySelectorAll('.top-sidebar-theme-button, .login-theme-btn').forEach(function (button) {
      button.title = nextLabel;
      button.setAttribute('aria-label', nextLabel);
      var icon = button.querySelector('i');
      if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    if (document.body) document.body.classList.toggle('light-mode', theme === 'light');
    syncControls(theme);
  }

  window.applyTheme = applyTheme;
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.classList.add('theme-transition');
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (error) { /* storage unavailable */ }
    setTimeout(function () { root.classList.remove('theme-transition'); }, 220);
  };

  applyTheme(readTheme());
  document.addEventListener('DOMContentLoaded', function () { applyTheme(readTheme()); });
})();
