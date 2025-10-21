// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();

// ====== Middleware ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ====== Database Connection ======
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bookcircle";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ====== Session Setup ======
app.use(
  session({
    secret: process.env.SESSION_SECRET || "bookcircle_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

// ====== Models ======
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const bookSchema = new mongoose.Schema(
  {
    title: String,
    author: String,
    price: Number,
    location: String,
    description: String,
    image: String, // filename
    rating: { type: Number, min: 1, max: 5 }, // star rating 1-5
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // owner
  },
  { timestamps: true }
);
const Book = mongoose.model("Book", bookSchema);

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    createdAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Message = mongoose.model("Message", messageSchema);

// ====== Cart Schema & Routes ======
const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  createdAt: { type: Date, default: Date.now }
});
const Cart = mongoose.model("Cart", cartSchema);

// Add to cart
app.post("/cart/add/:bookId", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const bookId = req.params.bookId;
    const exists = await Cart.findOne({ user: req.session.userId, book: bookId });
    if (exists) return res.status(400).json({ error: "Already in cart" });
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: "Book not found" });
    const c = new Cart({ user: req.session.userId, book: bookId });
    await c.save();
    res.json({ success: true, cart: c });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

// Remove from cart
app.delete("/cart/remove/:bookId", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const bookId = req.params.bookId;
    const removed = await Cart.findOneAndDelete({ user: req.session.userId, book: bookId });
    if (!removed) return res.status(404).json({ error: "Item not in cart" });
    res.json({ success: true });
  } catch (err) {
    console.error("Remove from cart error:", err);
    res.status(500).json({ error: "Failed to remove from cart" });
  }
});

// Get user's cart
app.get("/cart", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const items = await Cart.find({ user: req.session.userId }).populate({
      path: "book",
      populate: { path: "user", select: "username" }
    }).sort({ createdAt: -1 }).lean();
    // format
    const formatted = items.map(i => ({
      _id: i._id,
      bookId: i.book ? i.book._id : null,
      title: i.book ? i.book.title : null,
      author: i.book ? i.book.author : null,
      price: i.book ? i.book.price : null,
      location: i.book ? i.book.location : null,
      description: i.book ? i.book.description : null,
      image: i.book && i.book.image ? `/uploads/${i.book.image}` : null,
      rating: i.book ? i.book.rating : null,
      user: i.book && i.book.user ? { username: i.book.user.username } : null,
      createdAt: i.book ? i.book.createdAt : null,
      addedAt: i.createdAt
    }));
    res.json(formatted);
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ error: "Failed to get cart" });
  }
});


// ====== Multer (uploads) ======
const uploadsDir = path.join(__dirname, "uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });
app.use("/uploads", express.static(uploadsDir));

// ====== Auth routes ======

// Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash: hash });
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid username or password" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Invalid username or password" });

    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user
app.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(200).json({ username: null });
  res.json({ id: req.session.userId, username: req.session.username });
});

// ====== Book routes ======

// Create book
app.post("/books", upload.single("image"), async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const { title, author, price, location, description, rating } = req.body;
    const filename = req.file ? req.file.filename : null;

    const book = new Book({
      title,
      author,
      price: price ? Number(price) : undefined,
      location,
      description,
      image: filename,
      rating: rating ? Number(rating) : undefined,
      user: req.session.userId,
    });
    await book.save();
    res.json({ success: true, book });
  } catch (err) {
    console.error("Post book error:", err);
    res.status(500).json({ error: "Failed to post book" });
  }
});

// Get all books (for home)
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find().populate("user", "username").sort({ createdAt: -1 });
    const formatted = books.map((b) => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      price: b.price,
      location: b.location,
      description: b.description,
      image: b.image ? `/uploads/${b.image}` : null,
      rating: b.rating,
      user: b.user ? { id: b.user._id, username: b.user.username } : null,
      createdAt: b.createdAt,
    }));
    res.json(formatted);
  } catch (err) {
    console.error("Get books error:", err);
    res.status(500).json({ error: "Failed to fetch books" });
  }
});

// Get my books (profile)
app.get("/books/mine", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const books = await Book.find({ user: req.session.userId }).populate("user", "username").sort({ createdAt: -1 });
    const formatted = books.map((b) => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      price: b.price,
      location: b.location,
      description: b.description,
      image: b.image ? `/uploads/${b.image}` : null,
      rating: b.rating,
      user: b.user ? { id: b.user._id, username: b.user.username } : null,
      createdAt: b.createdAt,
    }));
    res.json(formatted);
  } catch (err) {
    console.error("Get my books error:", err);
    res.status(500).json({ error: "Failed to fetch my books" });
  }
});

// Edit a book (owner only)
app.put("/books/:id", upload.single("image"), async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });
    if (book.user.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: "Forbidden" });

    const { title, author, price, location, description } = req.body;

    if (req.file) {
      // remove old image file if exists
      if (book.image) {
        try {
          fs.unlinkSync(path.join(uploadsDir, book.image));
        } catch (e) {
          // ignore
        }
      }
      book.image = req.file.filename;
    }
    if (title !== undefined) book.title = title;
    if (author !== undefined) book.author = author;
    if (price !== undefined) book.price = Number(price);
    if (location !== undefined) book.location = location;
    if (description !== undefined) book.description = description;

    await book.save();
    res.json({ success: true, book });
  } catch (err) {
    console.error("Edit book error:", err);
    res.status(500).json({ error: "Failed to edit book" });
  }
});

// Delete a book (owner only)
app.delete("/books/:id", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });
    if (book.user.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: "Forbidden" });

    // delete image file
    if (book.image) {
      try {
        fs.unlinkSync(path.join(uploadsDir, book.image));
      } catch (e) {
        // ignore
      }
    }

    await book.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("Delete book error:", err);
    res.status(500).json({ error: "Failed to delete book" });
  }
});

// ====== Messaging ======

// Send message
app.post("/messages", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: "Missing fields" });

    const toUser = await User.findById(to);
    if (!toUser) return res.status(404).json({ error: "Recipient not found" });

    const msg = new Message({ from: req.session.userId, to, text });
    await msg.save();
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Conversations (last message per counterpart)
app.get("/messages/conversations", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const userId = req.session.userId.toString();
    // fetch messages where current user is sender or receiver, newest first
    const msgs = await Message.find({ $or: [{ from: userId }, { to: userId }] })
      .sort({ createdAt: -1 })
      .lean();

    const seen = new Set();
    const conversations = [];

    for (const m of msgs) {
      const counterpart = m.from.toString() === userId ? m.to.toString() : m.from.toString();
      if (seen.has(counterpart)) continue;
      seen.add(counterpart);

      const u = await User.findById(counterpart).select("username").lean();
      conversations.push({
        userId: counterpart,
        username: u ? u.username : "Unknown",
        lastMessage: m.text,
        updatedAt: m.createdAt,
      });
    }

    res.json(conversations);
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Thread with a user
app.get("/messages/thread/:userId", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const me = req.session.userId.toString();
    const other = req.params.userId;
    const msgs = await Message.find({
      $or: [
        { from: me, to: other },
        { from: other, to: me },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json(msgs);
  } catch (err) {
    console.error("Get thread error:", err);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

// ====== Logout (optional but handy) ======
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ====== Chatbot ======
app.post("/chatbot", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const msg = message.toLowerCase().trim();
    let response = {};

    // FAQs
    if (msg.includes("post") && msg.includes("book")) {
      response = {
        type: "text",
        message: "To post a book: Go to your Profile page, fill in the book details (title, author, price, location, description), upload an image if available, and click 'Post Book'."
      };
    } else if (msg.includes("search") && msg.includes("under")) {
      const priceMatch = msg.match(/under\s*₹?(\d+)/);
      if (priceMatch) {
        const maxPrice = parseInt(priceMatch[1]);
        const books = await Book.find({ price: { $lte: maxPrice } }).populate("user", "username").sort({ createdAt: -1 }).limit(5);
        const formatted = books.map(b => `${b.title} by ${b.author} - ₹${b.price} (${b.location})`);
        response = {
          type: "text",
          message: `Books under ₹${maxPrice}: ${formatted.length ? formatted.join("; ") : "No books found."}`
        };
      } else {
        response = {
          type: "text",
          message: "To search for books under a price: Use the search bar on the Home page and select a price filter."
        };
      }
    } else if (msg.includes("go to") || msg.includes("show")) {
      if (msg.includes("profile")) {
        response = {
          type: "navigation",
          page: "profile.html",
          message: "Redirecting to your Profile page..."
        };
      } else if (msg.includes("cart")) {
        response = {
          type: "navigation",
          page: "profile.html#cart", // Assuming cart is in profile
          message: "Redirecting to your Cart..."
        };
      } else if (msg.includes("home")) {
        response = {
          type: "navigation",
          page: "home.html",
          message: "Redirecting to Home page..."
        };
      } else if (msg.includes("messages") || msg.includes("message")) {
        response = {
          type: "navigation",
          page: "messages.html",
          message: "Redirecting to Messages page..."
        };
      } else {
        response = {
          type: "text",
          message: "I can help you navigate to Profile, Home, Messages, or Cart. What page would you like to go to?"
        };
      }
    } else {
      // Location-based filtering: check if user wants books in a specific location
      const locationMatch = msg.match(/books?.*in\s+([a-zA-Z0-9\s]+)/i);
      if (locationMatch) {
        const location = locationMatch[1].trim();
        const books = await Book.find({ location: new RegExp(location, "i") }).populate("user", "username").sort({ createdAt: -1 }).limit(5);
        if (books.length > 0) {
          const formatted = books.map(b => `${b.title} by ${b.author} - ₹${b.price} (${b.location})`);
          response = {
            type: "text",
            message: `Books available in ${location}: ${formatted.join("; ")}`
          };
        } else {
          response = {
            type: "text",
            message: `Sorry, no books found in ${location}.`
          };
        }
      } else {
        // Book suggestions: search by keywords in title/author
        const keywords = msg.split(/\s+/).filter(w => w.length > 2);
        if (keywords.length > 0) {
          const regex = new RegExp(keywords.join("|"), "i");
          const books = await Book.find({
            $or: [{ title: regex }, { author: regex }]
          }).populate("user", "username").sort({ createdAt: -1 }).limit(3);
          if (books.length > 0) {
            const suggestions = books.map(b => `${b.title} by ${b.author} - ₹${b.price}`);
            response = {
              type: "text",
              message: `Based on your interest in "${keywords.join(", ")}", here are some book suggestions: ${suggestions.join("; ")}`
            };
          } else {
            response = {
              type: "text",
              message: "I'm sorry, I couldn't find books matching your query. Try searching on the Home page or ask about posting books, searching, or navigation."
            };
          }
        } else {
          response = {
            type: "text",
            message: "Hi! I'm the Book Circle AI Assistant. I can help with FAQs like posting books, searching, or navigating the site. What can I assist you with?"
          };
        }
      }
    }

    res.json(response);
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Something went wrong with the chatbot." });
  }
});

// ====== User info by ID ======
app.get("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "User ID required" });
    const user = await User.findById(userId).select("username").lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ username: user.username });
  } catch (err) {
    console.error("Get user by ID error:", err);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ====== Start ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
