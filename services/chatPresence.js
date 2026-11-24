const ONLINE_TTL_MS = 35000;
const TYPING_TTL_MS = 5000;
const onlineUsers = new Map();
const typingUsers = new Map();

function getOnlineUsers(now = Date.now()) {
  for (const [username, lastSeen] of onlineUsers) {
    if (now - lastSeen > ONLINE_TTL_MS) onlineUsers.delete(username);
  }
  return [...onlineUsers.keys()].sort((first, second) => first.localeCompare(second, 'vi'));
}

function markUserOnline(username, now = Date.now()) {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername) return getOnlineUsers(now);
  onlineUsers.set(normalizedUsername, now);
  return getOnlineUsers(now);
}

function markUserTyping(username, typing, now = Date.now()) {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername) return getTypingUsers(now);
  if (typing) typingUsers.set(normalizedUsername, now);
  else typingUsers.delete(normalizedUsername);
  return getTypingUsers(now);
}

function getTypingUsers(now = Date.now()) {
  for (const [username, lastSeen] of typingUsers) {
    if (now - lastSeen > TYPING_TTL_MS) typingUsers.delete(username);
  }
  return [...typingUsers.keys()].sort((first, second) => first.localeCompare(second, 'vi'));
}

module.exports = { getOnlineUsers, getTypingUsers, markUserOnline, markUserTyping };