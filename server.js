/** HASE KB Dashboard Server (optional, for local dev only) */
const express = require('express');
const path = require('path');
const PORT = process.env.PORT || 8899;
const app = express();
app.use(express.static(__dirname));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HASE KB Dashboard: http://localhost:${PORT}`);
});
