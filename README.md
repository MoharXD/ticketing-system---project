# 🎟️ Ticket Booking System (Full-Stack Node + WebSockets)

A professional, real-time event ticketing platform built with Node.js, Express, MongoDB, and Vanilla JavaScript. This system features live seat synchronization, high-performance database querying, dynamic category filtering, and a secure, modern admin dashboard.

## ✨ Key Features

* **🟢 Real-Time Seat Synchronization:** Powered by `Socket.io`, when one user books a seat, it instantly turns grey on every other user's screen globally without requiring a page refresh.
* **⚡ Client-Side Image Optimization:** When an admin uploads an event poster, the system uses the HTML5 Canvas API to automatically resize and compress the image to a lightweight JPEG *before* converting it to Base64. This prevents database bloating and ensures ultra-fast page loads.
* **💎 Premium "District" Aesthetic:** A modern, app-like UI featuring high-contrast dark modes, massive border radii, glassmorphism elements, a unified user dropdown menu, and a dedicated full-screen printable digital ticket view.
* **🏷️ Dynamic Category Filtering:** Users can instantly filter the events feed by categories (Movies, Concerts, Sports, Theater) without reloading the page.
* **🛡️ Concurrency Control (Race Condition Prevention):** Utilizes MongoDB atomic updates (`$inc`, `$set`) and compound database indexes to guarantee that two users cannot mathematically book the same seat at the exact same millisecond.
* **🚀 Cold-Start Resilient:** Architected for free-tier cloud hosting (like Render). Features a smart 15-second asynchronous initialization protocol that detects server sleep states and elegantly informs the user without freezing the browser.
* **⏱️ Automated Event Expiration:** A "Frontend Heartbeat" constantly checks the UTC time against the server. When an event ends, the UI instantly locks down ticket sales.
* **🎬 CBFC Rating Enforcement:** Integrated Indian CBFC ratings (U, UA 7+, A, S). The system dynamically checks a user's Date of Birth and enforces strict blocks based on the event's rating.
* **📊 Live Admin Dashboard:** A secure CMS where admins can perform CRUD operations, upload posters, manage users, and watch revenue/ticket analytics update in real-time via a sleek flexbox-powered list UI.
* **🎫 Digital Tickets with QR Codes:** Successfully booked tickets generate dynamic QR codes for physical event scanning alongside printable layouts.

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (DOM Manipulation, Canvas API for compression), Bootstrap 5, QRCode.js.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB & Mongoose (Object Data Modeling with `.lean()` optimization).
* **Real-Time Engine:** Socket.io (WebSockets).
* **Security:** `bcryptjs` (Hashing), `express-session` (Cookies), `dotenv` (Environment Variables).

## 🚀 Installation & Setup

If you want to run this project locally on your machine, follow these steps:

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* A [MongoDB Atlas](https://www.mongodb.com/atlas/database) account and cluster URI.

### 2. Clone the Repository
```bash
git clone [https://github.com/MoharXD/ticketing-system---project](https://github.com/MoharXD/ticketing-system---project)
cd ticketing-system
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Environment Variables
Create a `.env` file in the root directory and add the following secure variables:
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string_here
SESSION_SECRET=your_super_secret_cookie_key
ADMIN_SECRET=admin123
```
*(Note: The `ADMIN_SECRET` is required to authorize the creation of a new Admin account).*

### 5. Start the Server
```bash
# For local development (auto-restarts on save):
npm run dev

# For production/deployment:
npm start
```
The application will be running at `http://localhost:3000`.

## 📖 How to Use

1.  **Standard User:** Navigate to the home page, create an account, browse events, and secure seats. Ensure your profile has a valid Date of Birth to access age-restricted events! Access your digital passes from the "My Bookings" dropdown menu.
2.  **Administrator:** * Navigate to `/admin-login.html`.
    * Click "Authorize a new Admin Account" and use the `ADMIN_SECRET` key to bypass the root-security check.
    * Once logged in, click the "Admin Panel" button in your user dropdown to manage the database.

## 🧠 Architecture Highlights

* **Database Query Optimization:** The backend utilizes Mongoose's `.lean()` and `.select()` methods on high-traffic routes (like the Admin Analytics and User Dashboard) to bypass heavy Mongoose document hydration, significantly reducing server memory usage.
* **Single Page Application (SPA) Feel:** While not using React, the frontend utilizes heavy DOM manipulation, state management, and bulletproof event delegation (`e.target.closest()`) to hide/show sections seamlessly, creating a fast experience without reloading the browser.
* **Cascading Deletes:** If an admin deletes a user, the backend recursively hunts down all tickets owned by that user, subtracts them from the event's `ticketsSold` tally, and releases the seats back to the public before terminating the account.
* **Aggressive Cache Busting:** Utilizes timestamp-appended URLs (`?t=123456`) for API data fetching and hardcoded versioning (`?v=V8`) on Javascript/CSS assets to ensure mobile browsers never load stale states. 

## 📂 Project Structure

```text
ticketing-system/
├── models/
│   ├── Event.js       # Mongoose Schema for Events (Includes Category enums)
│   ├── Seat.js        # Mongoose Schema for individual Seats/Tickets
│   └── User.js        # Mongoose Schema for Users & Admins
├── public/
│   ├── css/
│   │   └── style.css  # Global Design System, CSS Vars & Deep Dark Mode
│   ├── js/
│   │   ├── app.js     # Master Client-Side Logic, SPA Routing & WebSockets
│   │   └── admin.js   # Admin CMS & Canvas Image Compression logic
│   ├── index.html     # Single Page Application (SPA) UI
│   ├── admin.html     # Secure Admin Dashboard
│   └── admin-login.html
├── .env               # Secure Environment Variables (Ignored by Git)
├── server.js          # Main Express API & Socket.io Server (0.0.0.0 Bound)
└── package.json       # Project Manifest & Dependencies
```
```
