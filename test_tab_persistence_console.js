/**
 * Test Tab Persistence Feature
 * 
 * Steps to verify:
 * 1. Open browser console (F12)
 * 2. Copy-paste the code below into console
 * 3. Follow the on-screen prompts
 */

(function() {
  console.clear();
  console.log('%c=== TAB PERSISTENCE TEST ===', 'font-size: 14px; font-weight: bold; color: #0284c7;');
  
  // Step 1: Check initial state
  console.log('%c1. Initial state:', 'font-weight: bold;');
  console.log(`   Current Tab: ${currentTab}`);
  console.log(`   Saved in localStorage: "${localStorage.getItem('datags_current_tab')}"`);
  
  // Step 2: Switch to orders tab
  console.log('\n%c2. Switching to "orders" tab...', 'font-weight: bold;');
  switchTab('orders');
  
  setTimeout(() => {
    console.log(`   Current Tab: ${currentTab}`);
    console.log(`   Saved in localStorage: "${localStorage.getItem('datags_current_tab')}"`);
    
    // Step 3: Instructions
    console.log('%c3. Next steps:', 'font-weight: bold; color: #10b981;');
    console.log('   ✓ You should now be on the "Danh Sách Đơn Hàng" (Orders) page');
    console.log('   ✓ Press F5 to refresh the page');
    console.log('   ✓ You should stay on the Orders page, not return to Overview');
    console.log('   ✓ Open console again and check localStorage value');
  }, 1000);
})();
