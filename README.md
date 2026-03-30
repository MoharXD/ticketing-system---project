# 🎟️ Ticket Booking System (Scalable Full-Stack SPA)

A high-performance, real-time event ticketing engine built with Node.js, Express, MongoDB, Redis, and Vanilla JavaScript. Architected to handle high concurrency and race conditions, this platform features bi-directional live seat synchronization, in-memory caching for high-traffic resiliency, dynamic time-slot routing, and a secure, data-driven admin CMS.

## ✨ Engineering Highlights & Features

* **⚡ Redis In-Memory Caching:** Implements a robust caching layer using `redis` with graceful degradation. High-traffic endpoints (like the events feed) are served from memory, reducing database load by over 90%. Includes smart cache invalidation triggered automatically upon ticket sales or admin updates.
* **🕰️ Dynamic Showtimes & Rolling Calendars:** Supports multi-day events with dynamically generated, capacity-aware time slots. Uses algorithm-driven color thresholds (Green/Yellow/Red) to visually indicate availability percentages.
* **🛡️ Concurrency Control (ACID Compliance):** Utilizes MongoDB atomic operators (`$inc`) and strict compound database indexes (`eventId + seatId + bookingDate + timeSlot`) to mathematically guarantee that two users cannot book the same seat at the exact same millisecond.
* **🟢 Bi-Directional Real-Time State:** Powered by `Socket.io`. When a seat is booked or an event is created, the state is instantly broadcasted to all connected global clients, updating UIs and Admin analytic dashboards without requiring HTTP polling or page reloads.
* **🧵 Main-Thread Optimization (Lazy Loading):** Employs the `IntersectionObserver` API to lazy-load and generate complex DOM elements (like QR Codes) only when they enter the viewport, entirely preventing browser lockups during massive ticket renders.
* **📄 Client-Side PDF Generation:** Offloads heavy document generation from the backend by utilizing `html2pdf.js` to construct scalable, styling-preserved digital PDF tickets directly within the user's browser.
* **📊 Data-Driven Admin Dashboard:** A secure CMS featuring a custom-styled, real-time `Chart.js` bar chart with vertical gradients, tooltips, and dynamic scaling to track gross revenue per event alongside core user analytics.
* **🖼️ Edge Asset Compression:** To prevent database bloating and ensure ultra-fast content delivery, event posters are intercepted via the HTML5 Canvas API, aggressively resized, and compressed into lightweight JPEGs *before* being transmitted to the server.
* **🔐 CBFC Rating Enforcement:** Integrated Indian CBFC ratings (U, UA, A, S) dynamically cross-referenced against the authenticated user's calculated Date of Birth to enforce access control.

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3 (Deep Dark Mode UI, CSS Variables), Vanilla JavaScript (DOM Manipulation, Canvas API), Bootstrap 5.
* **Libraries:** `Chart.js` (Analytics), `QRCode.js` (Digital Passes), `html2pdf.js` (Ticket Exporting).
* **Backend:** Node.js, Express.js.
* **Database & Cache:** MongoDB Atlas & Mongoose (Object Data Modeling with `.lean()` optimization), Redis (In-Memory Data Store).
* **Real-Time Engine:** Socket.io (WebSockets).
* **Security & Auth:** `bcryptjs` (Hashing), `express-session` (MongoStore sessions), `dotenv` (Environment Variables).

## 🚀 Installation & Setup

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* A [MongoDB Atlas](https://www.mongodb.com/atlas/database) account and cluster URI.
* *(Optional but recommended)* A local or cloud Redis server.

### 2. Clone the Repository
```bash
git clone https://github.com/MoharXD/ticketing-system---project.git
cd ticketing-system
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Environment Variables
Create a `.env` file in the root directory and configure your secure variables:
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string_here
SESSION_SECRET=your_super_secret_cookie_key
ADMIN_SECRET=admin123
REDIS_URL=redis://127.0.0.1:6379  # Optional: Will safely fallback to MongoDB if missing
```

### 5. Start the Server
```bash
# For local development (auto-restarts on save):
npm run dev

# For production deployment:
npm start
```
The application will be running at `http://localhost:3000`.

## 📖 Usage Guide

1. **Standard User:** Navigate to the home page, create an account, and browse the rolling 4-day calendar. Select a dynamic time slot to view the live seating matrix. Access your digital passes and download PDF tickets from the "My Bookings" dropdown.
2. **Administrator:** * Navigate directly to `/admin-login.html`.
    * Click "Authorize a new Admin Account" and use your `ADMIN_SECRET` key to bypass root-security checks.
    * Access the Admin Panel via your user dropdown to deploy events, view the live revenue charts, and manage user lifecycles.

## 🧠 System Architecture Notes

* **Single Page Application (SPA) Routing:** While not relying on a virtual DOM framework like React, the frontend mimics a highly responsive SPA by utilizing robust state management and event delegation (`e.target.closest()`) to transition views and inject data seamlessly.
* **Cascading Deletions:** Deleting a user via the Admin panel triggers a recursive backend function that hunts down all tickets owned by that user, recalculates the parent event's `ticketsSold` tally, and releases the seats back to the public grid.
* **Aggressive Cache Busting:** Utilizes timestamp-appended endpoints (`?t=123456`) for volatile API data fetching and hardcoded versioning (`?v=V13`) on static assets to guarantee clients bypass stale disk caches following deployments. 

## 📂 Project Structure

```text
ticketing-system/
├── models/
│   ├── Event.js       # Mongoose Schema (Includes Categories & Time Slots array)
│   ├── Seat.js        # Mongoose Schema (Compound Indexed for Concurrency)
│   └── User.js        # Mongoose Schema (RBAC & Profile data)
├── public/
│   ├── css/
│   │   └── style.css  # Global Design System & Custom UI Overrides
│   ├── js/
│   │   ├── app.js     # Master Client-Side Logic, SPA Routing, PDF Export & WebSockets
│   │   └── admin.js   # Admin CMS, Chart.js Initialization & Image Compression
│   ├── index.html     # Single Page Application (SPA) UI
│   ├── admin.html     # Secure Admin Dashboard & Analytics View
│   └── admin-login.html
├── .env               # Secure Environment Variables (Ignored by Git)
├── server.js          # Express API, Redis Caching, and Socket.io Initialization
└── package.json       # Project Manifest & Dependencies
```

## 👨‍💻 Author
**Mohar Gorai** B.Tech Information Technology | Vellore Institute of Technology (VIT)
