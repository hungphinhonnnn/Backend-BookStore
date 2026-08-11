const express = require('express');
const Discount = require('../models/Discount');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    // Fetch active discounts that are within start/end dates
    const discounts = await Discount.find({
      active: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
      ]
    }).sort({ createdAt: -1 });

    // Map backend Discount objects to client-side Voucher model format
    const vouchers = discounts.map(doc => {
      const discountType = doc.type === 'percent' ? 'percentage' : 'fixed';
      return {
        id: doc._id.toString(),
        _id: doc._id.toString(),
        code: doc.code,
        description: doc.description,
        discount: doc.value,
        discountType: discountType,
        minOrderValue: doc.minOrder || 0,
        maxDiscount: doc.maxDiscount || 0,
        expiryDate: doc.endDate ? doc.endDate.toISOString() : null,
        status: (doc.usageLimit > 0 && doc.usedCount >= doc.usageLimit) ? 'invalid' : 'active'
      };
    });

    return res.json({
      message: 'Lấy danh sách mã giảm giá thành công',
      data: { vouchers }
    });
  } catch (err) {
    console.error('Error fetching vouchers:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
