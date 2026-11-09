// Test script để chạy trong browser console
// 1. Kiểm tra current tab
console.log('=== Test Tab Persistence ===');
console.log('Current tab:', currentTab);
console.log('Saved tab in localStorage:', localStorage.getItem('datags_current_tab'));

// 2. Switch to 'orders' tab
console.log('\n--- Switching to orders tab ---');
switchTab('orders');

// 3. Wait and check if saved
setTimeout(() => {
    console.log('Current tab after switch:', currentTab);
    console.log('Saved in localStorage:', localStorage.getItem('datags_current_tab'));
    console.log('\nNow press F5 to refresh and see if tab persists!');
}, 1000);
