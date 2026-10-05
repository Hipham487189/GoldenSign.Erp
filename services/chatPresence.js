const ONLINE_TTL_MS = 35000;
const onlineUsers = new Map();

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

module.exports = { getOnlineUsers, markUserOnline };