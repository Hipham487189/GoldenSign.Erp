// Redirect to full page add order form
function openAddModal() {
  sessionStorage.setItem('addOrderReturnTab', typeof currentTab === 'string' ? currentTab : 'overview');
  window.location.href = '/add-order';
}

// Alternative: Keep modal option with keyboard shortcut
// Press Shift+A to open modal instead
document.addEventListener('keydown', (e) => {
  if (e.shiftKey && e.key === 'A') {
    openAddModalLegacy();
  }
});

// Legacy modal function - if needed
function openAddModalLegacy() {
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}
