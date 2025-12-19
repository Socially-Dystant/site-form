const express = require('express');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB = path.join(__dirname, 'store.json');

app.use(express.json());
app.use(express.static('public'));

function readDB() {
  if (!fs.existsSync(DB)) return {};
  return JSON.parse(fs.readFileSync(DB, 'utf8') || '{}');
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

app.post('/api/save', (req, res) => {
  const token = uuid().slice(0, 8);
  const db = readDB();
  db[token] = {
    data: req.body,
    savedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ token });
});

app.get('/api/load/:token', (req, res) => {
  const db = readDB();
  res.json(db[req.params.token]?.data || null);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
