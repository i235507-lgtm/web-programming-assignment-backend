require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));

app.use((err, req, res, next) => {
  console.error(`[expense-ranking] Unhandled error on ${req.method} ${req.path}`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.info(`[expense-ranking] Server running on port ${PORT}`);
  });
};

start();
