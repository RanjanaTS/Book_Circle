

// script.js

// ---------------------- Helpers ----------------------
function qs(selector) { return document.querySelector(selector); }
function qsa(selector) { return Array.from(document.querySelectorAll(selector)); }
function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// ---------------------- Auth: signup & login ----------------------
const signupForm = qs("#signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = qs("#signupUsername").value.trim();
    const password = qs("#signupPassword").value;
    if (!username || !password) { alert("Enter username & password"); return; }
    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = "home.html";
    } else {
      alert(data.error || "Signup failed");
    }
  });
}

const loginForm = qs("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = qs("#loginUsername").value.trim();
    const password = qs("#loginPassword").value;
    if (!username || !password) { alert("Enter username & password"); return; }
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = "home.html";
    } else {
      alert(data.error || "Login failed");
    }
  });
}

// ---------------------- Show current username everywhere ----------------------
async function showUsername() {
  try {
    const res = await fetch("/me");
    if (!res.ok) return;
    const data = await res.json(); // { id?, username? }
    const username = data?.username || null;
    if (!username) return;
    qsa(".js-username").forEach(el => el.textContent = username);
    const usernameDisplay = qs("#usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = username;

    // Set current user ID for message alignment
    window._currentUserId = data.id;

    // Set avatar first character dynamically
    const avatarEls = qsa(".avatar");
    avatarEls.forEach(el => {
      el.textContent = username.charAt(0).toUpperCase();
    });
  } catch (err) {
    console.error("showUsername:", err);
  }
}

// ---------------------- Posting books (profile) ----------------------

async function postBook() {
  const form = qs("#postBookForm");
  if (!form) return;
  const formData = new FormData();
  formData.append("title", qs("#bookTitle").value || "");
  formData.append("author", qs("#bookAuthor").value || "");
  formData.append("price", qs("#bookPrice").value || "");
  formData.append("location", qs("#bookLocation").value || "");
  formData.append("description", qs("#bookDesc").value || "");
  formData.append("rating", qs("#bookRating").value || "");
  const file = qs("#bookImage") && qs("#bookImage").files[0];
  if (file) formData.append("image", file);

  try {
    const res = await fetch("/books", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      alert("Book posted successfully!");
      form.reset();
      loadMyBooks(); // refresh posted books
      loadAllBooks();
    } else {
      alert(data.error || data.message || "Error posting book");
    }
  } catch (err) {
    console.error(err);
    alert("Failed to post book.");
  }
}


// ---------------------- Load my posted books ----------------------

async function loadMyBooks() {
  const container = qs("#postedBooks");
  if (!container) return;
  try {
    const res = await fetch("/books/mine");
    if (!res.ok) {
      container.innerHTML = `<div style="color:var(--muted)">Please login to see your posted books.</div>`;
      return;
    }
    const books = await res.json();
    if (!Array.isArray(books) || books.length === 0) {
      container.innerHTML = `<div style="color:var(--muted)">You haven't posted any books yet.</div>`;
      return;
    }
    container.innerHTML = "";
    books.forEach(b => {
      const card = document.createElement("div");
      card.className = "post-card";
      card.style.display = "flex";
      card.style.gap = "12px";
      card.style.alignItems = "flex-start";
      const imgHtml = b.image ? `<img src="${b.image}" style="width:120px;height:150px;object-fit:cover;border-radius:8px">` : `<div style="width:120px;height:150px;border-radius:8px;background:#f1f6fb;display:flex;align-items:center;justify-content:center;color:var(--muted)">No Image</div>`;
      card.innerHTML = `
        <div style="min-width:120px;">
          ${imgHtml}
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div style="font-weight:700">${b.title || ""}</div>
              <div style="color:var(--muted);font-size:13px">${b.author || ""}</div>
              <div style="font-weight:700">${b.location || ""}</div>
              <div style="color:var(--muted);font-size:13px">${b.rating ? `<span class="star-rating">${'★'.repeat(b.rating)}</span> (${b.rating})` : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700">₹${b.price ?? "N/A"}</div>
              <div style="color:var(--muted);font-size:13px">${b.createdAt ? new Date(b.createdAt).toLocaleString() : ""}</div>
            </div>
          </div>
          <div style="margin-top:8px;color:var(--muted)">${b.description || ""}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn" onclick="promptEditBook('${b._id}')">Edit</button>
            <button class="btn" onclick="deleteBook('${b._id}')">Delete</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("loadMyBooks:", err);
    container.innerHTML = `<div style="color:var(--muted)">Failed to load your books.</div>`;
  }
}
// ---------------------- Edit book (simple prompt-based) ----------------------
async function promptEditBook(id) {
  try {
    const res = await fetch("/books");
    const books = await res.json();
    const b = books.find(x => x._id === id) || {};
    const newTitle = prompt("Title", b.title || "");
    if (newTitle === null) return;
    const newPrice = prompt("Price (₹)", b.price || "");
    const newDesc = prompt("Description", b.description || "");
    const formData = new FormData();
    formData.append("title", newTitle);
    formData.append("price", newPrice || "");
    formData.append("description", newDesc || "");
    const put = await fetch(`/books/${id}`, { method: "PUT", body: formData });
    if (!put.ok) {
      const err = await put.json().catch(()=>({}));
      alert(err.error || "Edit failed");
      return;
    }
    alert("Book updated");
    loadMyBooks();
    loadAllBooks();
  } catch (err) {
    console.error("promptEditBook:", err);
    alert("Edit failed");
  }
}

// ---------------------- Delete book ----------------------
async function deleteBook(id) {
  if (!confirm("Delete this book?")) return;
  try {
    const res = await fetch(`/books/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(()=>({}));
      alert(data.error || "Failed to delete");
      return;
    }
    alert("Deleted");
    loadMyBooks();
    loadAllBooks();
  } catch (err) {
    console.error("deleteBook:", err);
    alert("Failed to delete");
  }
}

// ---------------------- Load all books (home) ----------------------
let allBooks = [];

async function loadAllBooks() {
  const container = qs("#booksList");
  if (!container) return;
  try {
    const res = await fetch("/books");
    if (!res.ok) {
      container.innerHTML = `<div style="color:var(--muted)">Failed to load books.</div>`;
      return;
    }
    allBooks = await res.json();

    // Populate filter options
    populateFilters();

    displayBooks(allBooks);
  } catch (err) {
    console.error("loadAllBooks:", err);
    container.innerHTML = `<div style="color:var(--muted)">Failed to load books.</div>`;
  }
}

function populateFilters() {
  const authorFilter = qs("#filterAuthor");
  const locationFilter = qs("#filterLocation");

  if (authorFilter) {
    // Clear existing options except the first
    while (authorFilter.children.length > 1) {
      authorFilter.removeChild(authorFilter.lastChild);
    }
    const authors = [...new Set(allBooks.map(b => b.author).filter(a => a))];
    authors.forEach(author => {
      const option = document.createElement("option");
      option.value = author;
      option.textContent = author;
      authorFilter.appendChild(option);
    });
  }

  if (locationFilter) {
    // Clear existing options except the first
    while (locationFilter.children.length > 1) {
      locationFilter.removeChild(locationFilter.lastChild);
    }
    const locations = [...new Set(allBooks.map(b => b.location).filter(l => l))];
    locations.forEach(location => {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      locationFilter.appendChild(option);
    });
  }
}

function displayBooks(books) {
  const container = qs("#booksList");
  if (!container) return;

  if (!Array.isArray(books) || books.length === 0) {
    container.innerHTML = `<div style="color:var(--muted)">No books posted yet.</div>`;
    return;
  }

  container.innerHTML = "";
  books.forEach(b => {
    const card = document.createElement("div");
    card.className = "book-card";
    const imgHtml = b.image ? `<img src="${b.image}" style="width:120px;height:150px;object-fit:cover;border-radius:8px">` : `<div style="width:120px;height:150px;border-radius:8px;background:#f1f6fb;display:flex;align-items:center;justify-content:center;color:var(--muted)">No Image</div>`;
    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div>${imgHtml}</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="book-title">${b.title || ""}</div>
              <div class="book-meta">${b.author || ""}</div>
              <div style="font-weight:700">${b.location || ""}</div>
              <div style="color:var(--muted);font-size:13px">${b.rating ? `<span class="star-rating">${'★'.repeat(b.rating)}</span> (${b.rating})` : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700">₹${b.price ?? "N/A"}</div>
              <div style="color:var(--muted);font-size:13px">${new Date(b.createdAt).toLocaleString()}</div>
            </div>
          </div>
          <div style="margin-top:8px;color:var(--muted)">${b.description || ""}</div>
          <div style="margin-top:8px">
            <div style="color:var(--muted);font-size:13px">Posted by: <strong>${b.user?.username || "Unknown"}</strong></div>
          </div>
          <div style="margin-top:10px"></div>
        </div>
      </div>
    `;
    // create buttons area
    const btnArea = document.createElement("div");
    btnArea.style.marginTop = "10px";
    const msgBtn = document.createElement("button");
    msgBtn.className = "btn";
    msgBtn.textContent = "Message Seller";
    msgBtn.onclick = () => goToMessages(b.user?.id || "");
    btnArea.appendChild(msgBtn);

    // add-to-cart or remove button
    const inCart = currentCartBookIds.has(String(b._id));
    const cartBtn = document.createElement("button");
    cartBtn.className = "btn";
    cartBtn.style.marginLeft = "8px";
    if (inCart) {
      cartBtn.textContent = "Remove from cart";
      cartBtn.onclick = () => removeFromCart(b._id);
    } else {
      cartBtn.textContent = "Add to cart";
      cartBtn.onclick = () => addToCart(b._id);
    }
    btnArea.appendChild(cartBtn);

    // append button area into card (find the inner div where to place it)
    const inner = card.querySelector("div[style*='flex:1']");
    if (inner) {
      inner.appendChild(btnArea);
    } else {
      card.appendChild(btnArea);
    }

    container.appendChild(card);
  });
}

function applyFilters() {
  const titleInput = qs("#searchInput").value.toLowerCase();
  const locationFilter = qs("#filterLocation").value;
  const authorFilter = qs("#filterAuthor").value;
  const priceFilter = qs("#filterPrice").value;

  const filteredBooks = allBooks.filter(b => {
    const matchesTitle = b.title.toLowerCase().includes(titleInput);
    const matchesLocation = !locationFilter || b.location === locationFilter;
    const matchesAuthor = !authorFilter || b.author === authorFilter;
    let matchesPrice = true;
    if (priceFilter) {
      const [min, max] = priceFilter.split("-").map(Number);
      matchesPrice = b.price >= min && b.price <= max;
    }
    return matchesTitle && matchesLocation && matchesAuthor && matchesPrice;
  });

  displayBooks(filteredBooks);
}
// When Message Seller button clicked, go to messages page and open thread
function goToMessages(userId) {
  if (!userId) return alert("Seller not available");
  window.location.href = `messages.html?user=${userId}`;
}

// ---------------------- Messages page UI ----------------------
async function loadConversations() {
  const container = qs(".chat-list");
  if (!container) return;
  try {
    const res = await fetch("/messages/conversations");
    if (!res.ok) {
      container.innerHTML = `<div style="color:var(--muted)">No conversations yet.</div>`;
      return;
    }
    const convs = await res.json();
    window._conversations = convs; // Store conversations globally for fallback
    container.innerHTML = "";
    if (!convs.length) {
      container.innerHTML = `<div style="color:var(--muted)">No conversations yet.</div>`;
      return;
    }
    convs.forEach(c => {
      const item = document.createElement("div");
      item.className = "chat-item";
      item.style.cursor = "pointer";
      item.innerHTML = `
        <div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--sky-400),var(--sky-500));display:flex;align-items:center;justify-content:center;color:white;font-weight:700">${(c.username||"U").charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-weight:700">${c.username}</div>
          <div style="color:var(--muted);font-size:13px">${c.lastMessage}</div>
        </div>
        <div style="color:var(--muted);font-size:12px">${new Date(c.updatedAt).toLocaleString()}</div>
      `;
      item.addEventListener("click", () => {
        // Update URL param without reloading page
        const newUrl = new URL(window.location);
        newUrl.searchParams.set("user", c.userId);
        window.history.pushState({}, "", newUrl);
        loadThread(c.userId);
      });
      container.appendChild(item);
    });
  } catch (err) {
    console.error("loadConversations:", err);
    container.innerHTML = `<div style="color:var(--muted)">Failed to load conversations.</div>`;
  }
}

async function loadThread(otherUserId) {
  const chatHeader = qs("#chatHeader");
  let chatArea = qs("#chatWindow");
  if (!chatArea) {
    const rightPanel = qs(".sidebar") || document.body;
    chatArea = document.createElement("div");
    chatArea.id = "chatWindow";
    chatArea.className = "section-card card";
    chatArea.style.marginTop = "12px";
    rightPanel.appendChild(chatArea);
  }

  try {
    console.log("loadThread called with userId:", otherUserId);
    console.log("URL param user:", getParam("user"));
    // Fetch user info for the other user to display username
    const userRes = await fetch(`/users/${otherUserId}`);
    console.log("User fetch response status:", userRes.status);
    let otherUsername = "Select a conversation";
    if (userRes.ok) {
      const userData = await userRes.json();
      console.log("Fetched user data:", userData);
      otherUsername = userData.username || otherUsername;
    } else {
      console.warn("Failed to fetch user info for userId:", otherUserId);
      // Fallback: try to get username from URL param or conversation list if available
      const urlUsername = getParam("username");
      if (urlUsername) {
        otherUsername = urlUsername;
      } else if (window._conversations) {
        // Try to find username from conversations list
        const conv = window._conversations.find(c => c.userId === otherUserId);
        if (conv) {
          otherUsername = conv.username;
        }
      }
    }
    console.log("Displaying chat header username:", otherUsername);
    const chatHeaderAvatar = qs("#chatHeaderAvatar");
    const chatHeaderUsername = qs("#chatHeaderUsername");
    if (chatHeaderAvatar) {
      if (otherUsername === "Select a conversation") {
        chatHeaderAvatar.textContent = "";
      } else {
        chatHeaderAvatar.textContent = otherUsername.charAt(0).toUpperCase();
      }
    }
    if (chatHeaderUsername) {
      chatHeaderUsername.textContent = otherUsername;
    }

    const res = await fetch(`/messages/thread/${otherUserId}`);
    if (!res.ok) {
      chatArea.innerHTML = `<div style="color:var(--muted)">Cannot load messages.</div>`;
      return;
    }
    const msgs = await res.json();
    const threadContainer = qs("#threadMessages");
    if (!threadContainer) return;

    threadContainer.innerHTML = "";
    msgs.forEach(m => {
      const me = (m.from === undefined) ? false : (m.from.toString() === (window._currentUserId || ""));
      const msgEl = document.createElement("div");
      msgEl.className = "message " + (me ? "sent" : "received");
      msgEl.innerHTML = `<div>${m.text}</div><div class="timestamp">${new Date(m.createdAt).toLocaleString()}</div>`;
      threadContainer.appendChild(msgEl);
    });

    const sendBtn = qs("#sendMsgBtn");
    if (sendBtn) {
      sendBtn.onclick = async () => {
        const input = qs("#chatInput");
        const text = input.value.trim();
        if (!text) return;
        try {
          const send = await fetch("/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: otherUserId, text })
          });
          if (!send.ok) {
            const err = await send.json().catch(() => ({}));
            alert(err.error || "Failed to send");
            return;
          }
          input.value = "";
          loadThread(otherUserId);
          loadConversations();
        } catch (err) {
          console.error("send message error:", err);
        }
      };
    }
  } catch (err) {
    console.error("loadThread:", err);
    if (chatArea) chatArea.innerHTML = `<div style="color:var(--muted)">Failed to load chat.</div>`;
  }
}



// ---------------------- Cart client functions ----------------------
let currentCartBookIds = new Set();

async function loadCart() {
  const container = qs("#cartItems");
  if (!container) return;
  try {
    const res = await fetch("/cart");
    if (!res.ok) {
      container.innerHTML = `<div style="color:var(--muted)">Books you added to cart will appear here.</div>`;
      currentCartBookIds = new Set();
      return;
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = `<div style="color:var(--muted)">Books you added to cart will appear here.</div>`;
      currentCartBookIds = new Set();
      return;
    }
    currentCartBookIds = new Set(items.map(i => String(i.bookId)));
    // render items
    container.innerHTML = "";
    items.forEach(i => {
      const card = document.createElement("div");
      card.className = "book-card";
      const imgHtml = i.image ? `<img src="${i.image}" style="width:120px;height:150px;object-fit:cover;border-radius:8px">` : `<div style="width:120px;height:150px;border-radius:8px;background:#f1f6fb;display:flex;align-items:center;justify-content:center;color:var(--muted)">No Image</div>`;
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div>${imgHtml}</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:start">
              <div>
                <div class="book-title">${i.title || ""}</div>
                <div class="book-meta">${i.author || ""}</div>
                <div style="font-weight:700">${i.location || ""}</div>
                <div style="color:var(--muted);font-size:13px">${i.rating ? `<span class="star-rating">${'★'.repeat(i.rating)}</span> (${i.rating})` : ''}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700">₹${i.price ?? "N/A"}</div>
                <div style="color:var(--muted);font-size:13px">${i.createdAt ? new Date(i.createdAt).toLocaleString() : ""}</div>
              </div>
            </div>
            <div style="margin-top:8px;color:var(--muted)">${i.description || ""}</div>
            <div style="margin-top:8px;color:var(--muted);font-size:13px">Posted by: <strong>${i.user?.username || "Unknown"}</strong></div>
            <div style="margin-top:10px;display:flex;gap:8px">
              <button class="btn" onclick="removeFromCart('${i.bookId}')">Remove from cart</button>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("loadCart:", err);
    container.innerHTML = `<div style="color:var(--muted)">Failed to load cart items.</div>`;
  }
}

async function addToCart(bookId) {
  try {
    const res = await fetch(`/cart/add/${bookId}`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(()=>({}));
      alert(data.error || "Failed to add to cart");
      return;
    }
    alert("Added to cart");
    await loadCart();
    await loadAllBooks();
  } catch (err) {
    console.error("addToCart:", err);
    alert("Failed to add to cart");
  }
}

async function removeFromCart(bookId) {
  try {
    const res = await fetch(`/cart/remove/${bookId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(()=>({}));
      alert(data.error || "Failed to remove from cart");
      return;
    }
    alert("Removed from cart");
    await loadCart();
    await loadAllBooks();
  } catch (err) {
    console.error("removeFromCart:", err);
    alert("Failed to remove from cart");
  }
}
function appendMessage(text, sender = "bot") {
  const chatMessages = qs("#chatMessages");
  if (!chatMessages) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = "message " + (sender === "user" ? "sent" : sender === "bot" ? "bot" : "received");
  msgDiv.textContent = text;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
  const input = qs("#chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  appendMessage(text, "user");
  input.value = "";
  try {
    const res = await fetch("/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      appendMessage("Sorry, I couldn't process your request.", "bot");
      return;
    }
    const data = await res.json();
    if (data.type === "navigation" && data.page) {
      appendMessage(data.message || "Redirecting...", "bot");
      setTimeout(() => {
        window.location.href = data.page;
      }, 1500);
    } else if (data.type === "text") {
      appendMessage(data.message || "I didn't understand that.", "bot");
    } else {
      appendMessage("I didn't understand that.", "bot");
    }
  } catch (err) {
    console.error("Chatbot error:", err);
    appendMessage("Error communicating with the server.", "bot");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await showUsername();
  await loadCart();
  if (qs("#postedBooks")) loadMyBooks();
  if (qs("#booksList")) {
    await loadAllBooks();
    // Add search listener
    const searchInput = qs("#searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", applyFilters);
    }
    // Add filter listeners
    const locationFilter = qs("#filterLocation");
    if (locationFilter) {
      locationFilter.addEventListener("change", applyFilters);
    }
    const authorFilter = qs("#filterAuthor");
    if (authorFilter) {
      authorFilter.addEventListener("change", applyFilters);
    }
    const priceFilter = qs("#filterPrice");
    if (priceFilter) {
      priceFilter.addEventListener("change", applyFilters);
    }
  }
  if (qs(".chat-list")) {
    loadConversations().then(() => {
      const u = getParam("user");
      if (u) loadThread(u);
    });
  }
  // Chatbot event listeners
  const sendBtn = qs("#sendBtn");
  const chatInput = qs("#chatInput");
  if (sendBtn && chatInput) {
    sendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
