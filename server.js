/**
 * HASE KB Dashboard Server
 * Serves static files + Message Board API
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8899;
const ADMIN_PASSWORD = process.env.ADMIN_PW || 'hasekb2026';
const MSG_FILE = path.join(__dirname, 'messages.json');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// ─── Message Board API ───

function getMessages() {
  try {
    if (!fs.existsSync(MSG_FILE)) return [];
    const raw = fs.readFileSync(MSG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function saveMessages(msgs) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(msgs, null, 2), 'utf-8');
}

// POST /api/messages — submit a message (public)
app.post('/api/messages', (req, res) => {
  const { name, email, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: '請填寫留言內容' });
  }
  const msgs = getMessages();
  const entry = {
    id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
    name: (name || '匿名').trim().slice(0, 50),
    email: (email || '').trim().slice(0, 100),
    message: message.trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
    read: false
  };
  msgs.unshift(entry);
  saveMessages(msgs);
  res.json({ success: true, id: entry.id });
});

// GET /api/messages — list messages (admin only)
app.get('/api/messages', (req, res) => {
  const pw = req.query.pw || req.headers['x-admin-key'];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const msgs = getMessages();
  res.json(msgs);
});

// PUT /api/messages/:id/read — mark as read
app.put('/api/messages/:id/read', (req, res) => {
  const pw = req.query.pw || req.headers['x-admin-key'];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const msgs = getMessages();
  const idx = msgs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  msgs[idx].read = true;
  saveMessages(msgs);
  res.json({ success: true });
});

// DELETE /api/messages/:id — delete a message
app.delete('/api/messages/:id', (req, res) => {
  const pw = req.query.pw || req.headers['x-admin-key'];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let msgs = getMessages();
  const before = msgs.length;
  msgs = msgs.filter(m => m.id !== req.params.id);
  if (msgs.length === before) return res.status(404).json({ error: 'Not found' });
  saveMessages(msgs);
  res.json({ success: true });
});

// GET /api/messages/recent — recent 10 messages (public, no email)
app.get('/api/messages/recent', (req, res) => {
  const msgs = getMessages();
  const recent = msgs.slice(0, 10).map(m => ({
    id: m.id, name: m.name, message: m.message, createdAt: m.createdAt
  }));
  res.json(recent);
});

// Get unread count (public)
app.get('/api/messages/unread-count', (req, res) => {
  const msgs = getMessages();
  const count = msgs.filter(m => !m.read).length;
  res.json({ count });
});

// ─── Start Server ───
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HASE KB Server running on http://localhost:${PORT}`);
  console.log(`📝 Admin panel: http://localhost:${PORT}/admin.html`);
});
