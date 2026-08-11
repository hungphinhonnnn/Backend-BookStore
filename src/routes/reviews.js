const express = require("express");
const router = express.Router();

const Review = require("../models/Review");

// Nếu project của bạn đã có auth.js thì dùng middleware này
const { authRequired } = require("../middleware/auth");

// ===============================
// LẤY DANH SÁCH ĐÁNH GIÁ CỦA SÁCH
// GET /api/reviews/:bookId
// ===============================
router.get("/:bookId", async (req, res) => {
  try {
    const reviews = await Review.find({
      bookId: req.params.bookId,
    })
      .populate("userId", "username firstName lastName avatar")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ===============================
// THÊM ĐÁNH GIÁ
// POST /api/reviews
// ===============================
router.post("/", authRequired, async (req, res) => {
  try {
    const { bookId, rating, comment } = req.body;

    if (!bookId || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Số sao phải từ 1 đến 5",
      });
    }

    const review = new Review({
      bookId,
      userId: req.userId,
      rating,
      comment,
    });

    await review.save();

    const newReview = await Review.findById(review._id).populate(
      "userId",
      "username firstName lastName avatar"
    );

    res.status(201).json({
      success: true,
      message: "Đánh giá thành công",
      data: newReview,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ===============================
// SỬA ĐÁNH GIÁ
// PUT /api/reviews/:id
// ===============================
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đánh giá",
      });
    }

    if (review.userId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền sửa đánh giá này",
      });
    }

    review.rating = rating;
    review.comment = comment;

    await review.save();

    res.json({
      success: true,
      message: "Cập nhật đánh giá thành công",
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ===============================
// XÓA ĐÁNH GIÁ
// DELETE /api/reviews/:id
// ===============================
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đánh giá",
      });
    }

    if (review.userId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa",
      });
    }

    await Review.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Xóa đánh giá thành công",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;