const express = require('express');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Book = require('../../models/Book');
const Category = require('../../models/Category');
const { bookToClient } = require('../../models/Book');
const { adminRequired } = require('../../middleware/auth');

const router = express.Router();

router.use(adminRequired);

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `book_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Chỉ chấp nhận file ảnh'));
    }
    cb(null, true);
  },
});

function parseBookFields(body) {
  const title = body.title != null
    ? String(body.title).trim()
    : '';

  const author = body.author != null
    ? String(body.author).trim()
    : '';

  const description = body.description != null
    ? String(body.description).trim()
    : '';

  const preview = body.preview != null
    ? String(body.preview).trim()
    : '';

  const price = body.price != null
    ? Number(body.price)
    : NaN;

  const category = body.category || body.categoryId || '';

  return {
    title,
    author,
    description,
    preview,
    price,
    category
  };
}

function coverFromRequest(req) {
  if (req.file) {
    return `/uploads/${req.file.filename}`;
  }
  if (req.body.coverImage != null && String(req.body.coverImage).trim()) {
    return String(req.body.coverImage).trim();
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.search) {
      const q = String(req.query.search).trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { author: { $regex: q, $options: 'i' } },
      ];
    }
    if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
      filter.category = req.query.category;
    }

    let sortObj = { createdAt: -1 };
    if (req.query.sortField && req.query.sortDir) {
      const dir = req.query.sortDir === 'desc' ? -1 : 1;
      if (['title', 'price'].includes(req.query.sortField)) {
        sortObj = { [req.query.sortField]: dir };
      }
    }

    const [books, total] = await Promise.all([
      Book.find(filter).populate('category').sort(sortObj).skip(skip).limit(limit),
      Book.countDocuments(filter),
    ]);

    const list = books.map((b) => bookToClient(b, b.category));
    return res.json({ books: list, data: list, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('category');
    if (!book) {
      return res.status(404).json({ error: 'Không tìm thấy sách' });
    }
    const payload = bookToClient(book, book.category);
    return res.json({ book: payload, data: payload });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: 'Id sách không hợp lệ' });
  }
});

router.post('/', upload.single('coverImage'), async (req, res) => {
  try {
    const {
  title,
  author,
  description,
  preview,
  price,
  category
} = parseBookFields(req.body);
    if (!title || !author) {
      return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và tác giả' });
    }
    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Giá không hợp lệ' });
    }
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ error: 'Danh mục không hợp lệ' });
    }
    const cat = await Category.findById(category);
    if (!cat) {
      return res.status(400).json({ error: 'Không tìm thấy danh mục' });
    }

    const cover = coverFromRequest(req) || '';
    const book = await Book.create({
  title,
  author,
  description,
  preview,
  price,
  category,
  coverImage: cover,
});
    const populated = await Book.findById(book._id).populate('category');
    const payload = bookToClient(populated, populated.category);
    return res.status(201).json({ message: 'Đã thêm sách', book: payload, data: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
});

router.put('/:id', upload.single('coverImage'), async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Không tìm thấy sách' });
    }

   const book = await Book.create({
  title,
  author,
  description,
  preview,
  price,
  category,
  coverImage: cover,
});
    if (title) book.title = title;
    if (author) book.author = author;
    if (req.body.description !== undefined) book.description = description;
    if (req.body.preview !== undefined) book.preview = preview;
    if (!Number.isNaN(price) && price >= 0) book.price = price;
    

    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ error: 'Danh mục không hợp lệ' });
      }
      const cat = await Category.findById(category);
      if (!cat) {
        return res.status(400).json({ error: 'Không tìm thấy danh mục' });
      }
      book.category = category;
    }

    const cover = coverFromRequest(req);
    if (cover) book.coverImage = cover;

    await book.save();
    const populated = await Book.findById(book._id).populate('category');
    const payload = bookToClient(populated, populated.category);
    return res.json({ message: 'Đã cập nhật sách', book: payload, data: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
});

router.patch('/:id/stock', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Không tìm thấy sách' });
    }
    const { quantity } = req.body || {};
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    book.stock = (book.stock || 0) + qty;
    await book.save();
    const populated = await Book.findById(book._id).populate('category');
    const payload = bookToClient(populated, populated.category);
    return res.json({ message: 'Đã nhập thêm hàng', book: payload, data: payload });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: 'Id sách không hợp lệ' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Không tìm thấy sách' });
    }
    return res.json({ message: 'Đã xóa sách' });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: 'Id sách không hợp lệ' });
  }
});

module.exports = router;
