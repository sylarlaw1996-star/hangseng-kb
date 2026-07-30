/**
 * HASE KB Dashboard Server
 * Guestbook: stores messages in messages.json (no GitHub API, no Token needed)
 * Admin PIN: 8888
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 8899;
const ADMIN_PIN = '8888';
const MSG_FILE = path.join(__dirname, 'messages.json');

app.use(express.json());
app.use(express.static(__dirname));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-admin-pin');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function loadMessages() {
  try {
    if (!fs.existsSync(MSG_FILE)) fs.writeFileSync(MSG_FILE, '[]');
    return JSON.parse(fs.readFileSync(MSG_FILE, 'utf8'));
  } catch { return []; }
}

function saveMessages(msgs) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(msgs, null, 2), 'utf8');
}

// GET /api/messages - list messages (public)
app.get('/api/messages', (req, res) => {
  const filter = req.query.filter || 'all';
  const limit = parseInt(req.query.limit) || 100;
  let msgs = loadMessages();
  if (filter === 'open') msgs = msgs.filter(m => !m.closed);
  if (filter === 'closed') msgs = msgs.filter(m => m.closed);
  msgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totalOpen = msgs.filter(m => !m.closed).length;
  res.json({ issues: msgs.slice(0, limit), totalOpen });
});

// POST /api/messages - create message (public, no auth needed)
app.post('/api/messages', (req, res) => {
  const { name, email, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: '请填写留言内容' });
  }
  const msgs = loadMessages();
  const id = msgs.length > 0 ? Math.max(...msgs.map(m => m.number)) + 1 : 1;
  const entry = {
    number: id,
    title: `留言: ${(name || '匿名').trim()}`,
    body: `${(name || '匿名').trim()}\n${(email || '').trim()}\n${message.trim()}`,
    state: 'open',
    closed: false,
    createdAt: new Date().toISOString(),
    name: (name || '匿名').trim(),
    email: (email || '').trim(),
    message: message.trim()
  };
  msgs.push(entry);
  saveMessages(msgs);
  console.log(`📝 Message #${id} from ${entry.name}`);
  res.status(201).json({ issue: entry, success: true });
});

// PATCH /api/messages/:id - close/reopen (needs PIN)
app.patch('/api/messages/:id', (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(403).json({ error: '密码错误' });
  }
  const msgs = loadMessages();
  const idx = msgs.findIndex(m => m.number == req.params.id);
  if (idx === -1) return res.status(404).json({ error: '留言不存在' });

  const { action } = req.body;
  msgs[idx].closed = action !== 'reopen';
  msgs[idx].state = action === 'reopen' ? 'open' : 'closed';
  saveMessages(msgs);
  console.log(`📋 Message #${req.params.id} ${action === 'reopen' ? 'reopened' : 'closed'}`);
  res.json({ success: true, state: msgs[idx].state });
});

// DELETE /api/messages/:id - delete (needs PIN)
app.delete('/api/messages/:id', (req, res) => {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(403).json({ error: '密码错误' });
  }
  let msgs = loadMessages();
  msgs = msgs.filter(m => m.number != req.params.id);
  saveMessages(msgs);
  console.log(`🗑️ Message #${req.params.id} deleted`);
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HASE KB Dashboard + Guestbook`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Admin PIN: ${ADMIN_PIN}`);
});
