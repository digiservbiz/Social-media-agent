require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const postRoutes = require('./routes/posts');
const { startScheduler } = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/posts', postRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`Social poster running on http://localhost:${PORT}`);
  startScheduler();
});
