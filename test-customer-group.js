#!/usr/bin/env node

/**
 * Test Script - Chức Năng Kết Nối Khách Hàng Thành Group
 * 
 * Hướng dẫn:
 * 1. Chỉnh sửa các biến HOST, TOKEN, các ID khách hàng
 * 2. Chạy: node test-customer-group.js
 * 3. Xem kết quả in ra console
 */

const http = require('http');

// Cấu hình
const HOST = 'localhost';
const PORT = 5000;
const TOKEN = 'YOUR_AUTH_TOKEN_HERE';  // Thay thế bằng token thực tế

// Hàm gửi request HTTP
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Tests
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Test Chức Năng Kết Nối Khách Hàng Thành Group        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Tạo nhóm
    console.log('📝 TEST 1: Tạo nhóm khách hàng mới');
    console.log('─'.repeat(50));
    const createGroupResponse = await makeRequest('POST', '/api/customers/groups/create', {
      name: 'Test Group - Hà Nội',
      description: 'Nhóm test khách hàng Hà Nội',
      customers: []
    });
    console.log('Status:', createGroupResponse.status);
    console.log('Response:', JSON.stringify(createGroupResponse.data, null, 2));
    
    if (!createGroupResponse.data.success) {
      console.log('❌ Không thể tạo nhóm. Kiểm tra token và server.');
      return;
    }

    const groupId = createGroupResponse.data.data._id;
    console.log('\n✅ Nhóm được tạo với ID:', groupId, '\n');

    // Test 2: Lấy danh sách nhóm
    console.log('📋 TEST 2: Lấy danh sách nhóm');
    console.log('─'.repeat(50));
    const listResponse = await makeRequest('GET', '/api/customers/groups/list?page=1&limit=10');
    console.log('Status:', listResponse.status);
    console.log('Total groups:', listResponse.data.meta?.total);
    console.log('Response:', JSON.stringify(listResponse.data, null, 2));
    console.log('');

    // Test 3: Lấy chi tiết nhóm
    console.log('🔍 TEST 3: Lấy chi tiết nhóm');
    console.log('─'.repeat(50));
    const detailResponse = await makeRequest('GET', `/api/customers/groups/${groupId}`);
    console.log('Status:', detailResponse.status);
    console.log('Response:', JSON.stringify(detailResponse.data, null, 2));
    console.log('');

    // Test 4: Cập nhật nhóm
    console.log('✏️  TEST 4: Cập nhật thông tin nhóm');
    console.log('─'.repeat(50));
    const updateResponse = await makeRequest('PUT', `/api/customers/groups/${groupId}`, {
      name: 'Test Group - Hà Nội (Updated)',
      description: 'Nhóm test khách hàng Hà Nội - Đã cập nhật'
    });
    console.log('Status:', updateResponse.status);
    console.log('Response:', JSON.stringify(updateResponse.data, null, 2));
    console.log('');

    // Test 5: Lấy tất cả nhóm (không phân trang)
    console.log('📊 TEST 5: Lấy tất cả nhóm (không phân trang)');
    console.log('─'.repeat(50));
    const allResponse = await makeRequest('GET', '/api/customers/groups/list/all');
    console.log('Status:', allResponse.status);
    console.log('Total groups:', allResponse.data.data?.length || 0);
    console.log('Response:', JSON.stringify(allResponse.data, null, 2));
    console.log('');

    // Test 6: Xóa nhóm
    console.log('🗑️  TEST 6: Xóa nhóm');
    console.log('─'.repeat(50));
    const deleteResponse = await makeRequest('DELETE', `/api/customers/groups/${groupId}`);
    console.log('Status:', deleteResponse.status);
    console.log('isActive after delete:', deleteResponse.data.data?.isActive);
    console.log('Response:', JSON.stringify(deleteResponse.data, null, 2));
    console.log('');

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Tất cả test hoàn tất!                             ║');
    console.log('╚════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }
}

// Chạy tests
runTests();
