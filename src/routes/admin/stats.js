const express = require('express');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Book = require('../../models/Book');
const { adminRequired } = require('../../middleware/auth');

const router = express.Router();

router.use(adminRequired);

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
};

async function revenueBetween(start, end) {
  const match = { status: { $ne: 'cancelled' } };
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lt = end;
  }
  const rows = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
  ]);
  return rows.length ? { revenue: rows[0].total || 0, count: rows[0].count || 0 } : { revenue: 0, count: 0 };
}

router.get('/dashboard', async (_req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfDayBefore = new Date(startOfYesterday);
    startOfDayBefore.setDate(startOfDayBefore.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [totalBooks, totalOrders, totalUsers, todayOrders, todayUsers, todayBooks, yesterdayOrders, yesterdayUsers, yesterdayBooks] =
      await Promise.all([
        Book.countDocuments(),
        Order.countDocuments(),
        User.countDocuments(),
        Order.countDocuments({ createdAt: { $gte: startOfToday } }),
        User.countDocuments({ createdAt: { $gte: startOfToday } }),
        Book.countDocuments({ createdAt: { $gte: startOfToday } }),
        Order.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
        User.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
        Book.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
      ]);

    const [totalRevenue, todayRev, yesterdayRev] = await Promise.all([
      revenueBetween(null, null),
      revenueBetween(startOfToday, null),
      revenueBetween(startOfYesterday, startOfToday),
    ]);

    const pct = (cur, prev) => {
      if (prev <= 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    };

    const weekDays = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDays.push(d);
    }
    const statusRows = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: '$status', value: { $sum: 1 } } },
    ]);
    const statusMap = {};
    for (const r of statusRows) statusMap[r._id] = r.value;

    const [revMonth, revLastMonth, revWeekRows, topBooks, lowStock, newCustomers, recentOrders, pendingCount] =
      await Promise.all([
        revenueBetween(startOfMonth, startOfNextMonth),
        revenueBetween(startOfLastMonth, startOfMonth),
        Order.aggregate([
          { $match: { createdAt: { $gte: startOfWeek, $lt: startOfNextMonth }, status: { $ne: 'cancelled' } } },
          { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $match: { status: { $ne: 'cancelled' } } },
          { $unwind: '$items' },
          { $group: { _id: '$items.book', totalQuantity: { $sum: '$items.quantity' }, totalRevenue: { $sum: '$items.subtotal' } } },
          { $sort: { totalQuantity: -1 } },
          { $limit: 5 },
        ]),
        Book.find({ stock: { $lte: 10 } }).sort({ stock: 1, updatedAt: -1 }).limit(5).populate('category'),
        User.find().sort({ createdAt: -1 }).limit(5),
        Order.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('user', 'username email firstName lastName')
          .populate({ path: 'items.book', populate: { path: 'category' } }),
        Order.countDocuments({ status: 'pending' }),
      ]);

    const revByDay = {};
    for (const r of revWeekRows) {
      const key = `${r._id.y}-${String(r._id.m).padStart(2, '0')}-${String(r._id.d).padStart(2, '0')}`;
      revByDay[key] = { revenue: r.revenue, count: r.count };
    }
    const revenue7d = weekDays.map((d) => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const row = revByDay[key] || { revenue: 0, count: 0 };
      return {
        label: d.toLocaleDateString('vi-VN', { weekday: 'short' }),
        date: key,
        revenue: row.revenue,
        orders: row.count,
      };
    });

    const topBookIds = topBooks.map((r) => r._id);
    const books = await Book.find({ _id: { $in: topBookIds } });
    const bookMap = {};
    for (const b of books) bookMap[b._id.toString()] = b;
    const topBookList = topBooks.map((r) => {
      const book = bookMap[r._id.toString()];
      return {
        book: book
          ? { id: book._id.toString(), title: book.title, author: book.author, coverImage: book.coverImage, price: book.price, category: book.category?.name }
          : null,
        totalQuantity: r.totalQuantity,
        totalRevenue: r.totalRevenue,
      };
    });

    const lowStockList = lowStock.map((b) => ({
      id: b._id.toString(),
      title: b.title,
      author: b.author,
      coverImage: b.coverImage,
      price: b.price,
      stock: b.stock ?? 0,
    }));

    const recentOrdersList = recentOrders.map((o) => ({
      id: o._id.toString(),
      code: o._id.toString().slice(-6).toUpperCase(),
      fullName: o.fullName,
      email: o.user?.email || '',
      phone: o.phone || '',
      address: o.address || '',
      city: o.city || '',
      notes: o.notes || '',
      paymentMethod: o.paymentMethod || 'cash_on_delivery',
      shippingFee: o.shippingFee || 0,
      discountCode: o.discountCode || '',
      discountAmount: o.discountAmount || 0,
      createdAt: o.createdAt?.toISOString?.() || o.createdAt,
      totalAmount: o.totalAmount,
      status: o.status,
      items: (o.items || []).map((line) => ({
        book: line.book?.title ? { title: line.book.title } : null,
        quantity: line.quantity,
        price: line.price,
        subtotal: line.subtotal,
      })),
    }));

    const activity = [];
    for (const o of recentOrders) {
      activity.push({
        type: 'order',
        message: `Đơn hàng mới #${o._id.toString().slice(-6).toUpperCase()} từ ${o.fullName}`,
        time: o.createdAt?.toISOString?.() || o.createdAt,
      });
    }
    for (const u of newCustomers) {
      activity.push({
        type: 'user',
        message: `Người dùng mới đăng ký: ${u.firstName} ${u.lastName}`,
        time: u.createdAt?.toISOString?.() || u.createdAt,
      });
    }
    const recentBooks = await Book.find().sort({ createdAt: -1 }).limit(3);
    for (const b of recentBooks) {
      activity.push({
        type: 'book',
        message: `Admin thêm sách mới: ${b.title}`,
        time: b.createdAt?.toISOString?.() || b.createdAt,
      });
    }
    activity.sort((a, b) => new Date(b.time) - new Date(a.time));
    const recentActivity = activity.slice(0, 8);

    const monthlyRevenue = revMonth.revenue || 0;
    const lastMonthRevenue = revLastMonth.revenue || 0;
    const deliveredCount = await Order.countDocuments({ status: 'delivered' });
    const nonCancelled = await Order.countDocuments({ status: { $ne: 'cancelled' } });
    const completionRate = nonCancelled > 0 ? Math.round((deliveredCount / nonCancelled) * 100) : 0;

    return res.json({
      data: {
        totals: {
          books: totalBooks,
          orders: totalOrders,
          revenue: totalRevenue.revenue,
          users: totalUsers,
          booksChange: pct(todayBooks, yesterdayBooks),
          ordersChange: pct(todayOrders, yesterdayOrders),
          revenueChange: pct(todayRev.revenue, yesterdayRev.revenue),
          usersChange: pct(todayUsers, yesterdayUsers),
        },
        today: {
          orders: todayOrders,
          revenue: todayRev.revenue,
          newUsers: todayUsers,
          lowStock: lowStockList.length,
        },
        revenue7d,
        statusDistribution: [
          { status: 'delivered', label: 'Đã giao', value: statusMap.delivered || 0 },
          { status: 'pending', label: 'Chờ xác nhận', value: statusMap.pending || 0 },
          { status: 'confirmed', label: 'Đang xử lý', value: statusMap.confirmed || 0 },
          { status: 'cancelled', label: 'Đã hủy', value: statusMap.cancelled || 0 },
        ],
        topBooks: topBookList,
        lowStock: lowStockList,
        newCustomers: newCustomers.map((u) => ({
          id: u._id.toString(),
          name: `${u.firstName} ${u.lastName}`.trim() || u.username,
          email: u.email,
          avatar: u.avatar || '',
          createdAt: u.createdAt?.toISOString?.() || u.createdAt,
        })),
        recentOrders: recentOrdersList,
        recentActivity,
        monthly: {
          revenue: monthlyRevenue,
          lastMonthRevenue,
          avgOrder: totalOrders > 0 ? Math.round(totalRevenue.revenue / totalOrders) : 0,
          completionRate,
          totalReviews: 0,
          avgRating: 0,
        },
        notifications: {
          count: pendingCount + lowStockList.length,
          items: [
            ...pendingCount
              ? [{ icon: 'order', text: `${pendingCount} đơn hàng đang chờ xác nhận` }]
              : [],
            ...lowStockList.map((b) => ({ icon: 'stock', text: `Sắp hết hàng: ${b.title} (còn ${b.stock})` })),
          ],
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

router.get('/overview', async (_req, res) => {
  try {
    const [totalOrders, totalUsers, totalBooks, revenueResult] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Book.countDocuments(),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    return res.json({
      data: { totalOrders, totalUsers, totalBooks, totalRevenue },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

router.get('/revenue', async (req, res) => {
  try {
    const groupBy = req.query.groupBy || 'day';
    const match = { status: { $ne: 'cancelled' } };

    if (req.query.from || req.query.to) {
      match.createdAt = {};
      if (req.query.from) match.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        match.createdAt.$lte = to;
      }
    }

    let groupId;
    if (groupBy === 'month') {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
    } else if (groupBy === 'year') {
      groupId = { year: { $year: '$createdAt' } };
    } else {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
    }

    const rows = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    const data = rows.map((r) => {
      let label;
      if (groupBy === 'month') {
        label = `${r._id.year}-${String(r._id.month).padStart(2, '0')}`;
      } else if (groupBy === 'year') {
        label = String(r._id.year);
      } else {
        label = `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
      }
      return { label, revenue: r.revenue, orderCount: r.orderCount };
    });

    return res.json({ data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

router.get('/top-books', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const rows = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.book',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
    ]);

    const bookIds = rows.map((r) => r._id);
    const books = await Book.find({ _id: { $in: bookIds } }).populate('category');
    const bookMap = {};
    for (const b of books) {
      bookMap[b._id.toString()] = b;
    }

    const data = rows.map((r) => {
      const book = bookMap[r._id.toString()];
      return {
        book: book
          ? { id: book._id.toString(), title: book.title, author: book.author, coverImage: book.coverImage, category: book.category?.name }
          : null,
        totalQuantity: r.totalQuantity,
        totalRevenue: r.totalRevenue,
      };
    });

    return res.json({ data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
