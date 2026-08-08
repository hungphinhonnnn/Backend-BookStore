const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    author: {
      type: String,
      required: true
    },

    description: {
      type: String,
      default: ''
    },

    // =========================
    // NỘI DUNG ĐỌC THỬ
    // =========================
    preview: {
      type: String,
      default: ''
    },

    coverImage: {
      type: String,
      default: ''
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
  },
  { timestamps: true }
);


function bookToClient(doc, categoryDoc) {
  const id = doc._id.toString();

  const cat = categoryDoc || doc.category;

  let category = null;

  if (cat && typeof cat === 'object' && cat.name) {
    const cid = cat._id.toString();

    category = {
      _id: cid,
      id: cid,
      name: cat.name
    };
  }

  return {
    _id: id,
    id,

    title: doc.title,

    author: doc.author,

    description: doc.description || '',

    // =========================
    // TRẢ NỘI DUNG ĐỌC THỬ
    // =========================
    preview: doc.preview || '',

    coverImage: doc.coverImage || '',

    image: doc.coverImage || '',

    price: doc.price,

    category,
  };
}


bookSchema.statics.toClient = bookToClient;


module.exports = mongoose.model('Book', bookSchema);

module.exports.bookToClient = bookToClient;