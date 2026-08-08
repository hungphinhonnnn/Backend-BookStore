require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const bookRoutes = require('./routes/books');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminBookRoutes = require('./routes/admin/books');
const adminOrderRoutes = require('./routes/admin/orders');
const adminUserRoutes = require('./routes/admin/users');
const adminCategoryRoutes = require('./routes/admin/categories');
const adminDiscountRoutes = require('./routes/admin/discounts');
const adminStatsRoutes = require('./routes/admin/stats');
const favoriteRoute = require('./routes/favorite');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/', (_req, res) => {
  res.json({ message: 'BookStore API', version: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/books', adminBookRoutes);
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);
app.use('/api/admin/discounts', adminDiscountRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/favorites', favoriteRoute);

async function start() {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BookStore API: http://localhost:${PORT}`);
    console.log('Android emulator: http://10.0.2.2:3000');
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app;
