# 🎟️ Ticket Booking System (Full-Stack MERN + WebSockets)

A professional, real-time event ticketing platform built with Node.js, Express, MongoDB, and Vanilla JavaScript. This system features live seat synchronization, concurrency control, role-based access, and a dynamic admin dashboard.

## ✨ Key Features

* **🟢 Real-Time Seat Synchronization:** Powered by `Socket.io`, when one user books a seat, it instantly turns grey on every other user's screen without requiring a page refresh.
* **🛡️ Concurrency Control (Race Condition Prevention):** Utilizes MongoDB atomic updates (`$inc`, `$set`) to guarantee that two users cannot mathematically book the same seat at the exact same millisecond.
* **⏱️ Automated Event Expiration:** A "Frontend Heartbeat" constantly checks the UTC time against the server. When an event ends, the UI instantly locks down ticket sales.
* **🎬 CBFC Rating Enforcement:** Integrated Indian CBFC ratings (U, UA 7+, A, S). The system dynamically checks a user's Date of Birth and enforces strict blocks or parental permission prompts based on the event's rating.
* **📊 Live Admin Dashboard:** A secure CMS where admins can perform CRUD operations on events, manage users, and watch revenue/ticket analytics update in real-time.
* **🎫 Digital Tickets with QR Codes:** Successfully booked tickets generate dynamic QR codes for physical event scanning.
* **🔒 Secure Authentication:** Features server-side sessions, Bcrypt password hashing, and strict Role-Based Access Control (RBAC) to separate standard users from administrators.

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3 (Custom Variables), Vanilla JavaScript (DOM Manipulation & Fetch API), Bootstrap 5.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB & Mongoose (Object Data Modeling).
* **Real-Time Engine:** Socket.io (WebSockets).
* **Security:** `bcryptjs` (Hashing), `express-session` (Cookies), `dotenv` (Environment Variables).

## 🚀 Installation & Setup

If you want to run this project locally on your machine, follow these steps:

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.
* A [MongoDB Atlas](https://www.mongodb.com/atlas/database) account and cluster URI.

### 2. Clone the Repository
```bash
git clone https://github.com/MoharXD/ticketing-system---project
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

1.  **Standard User:** Navigate to the home page, create an account, browse events, and secure seats. Ensure your profile has a valid Date of Birth to access age-restricted events!
2.  **Administrator:** * Navigate to `/admin-login.html`.
    * Click "Authorize a new Admin Account" and use the `ADMIN_SECRET` key to bypass the root-security check.
    * Once logged in, click the "Admin Panel" button to manage the database.

## 🧠 Architecture Highlights

* **Single Page Application (SPA) Feel:** While not using React, the frontend utilizes heavy DOM manipulation to hide/show sections seamlessly, creating a fast, app-like experience without reloading the browser.
* **Cascading Deletes:** If an admin deletes a user, the backend recursively hunts down all tickets owned by that user, subtracts them from the event's `ticketsSold` tally, and releases the seats back to the public before terminating the account.
* **Deterministic Fetching:** Uses timestamp-appended URLs (`?t=123456`) to aggressively break mobile browser caching, ensuring users always see the most accurate data.* 

## 📂 Project Structure

```text
ticketing-system/
├── models/
│   ├── Event.js       # Mongoose Schema for Events
│   ├── Seat.js        # Mongoose Schema for individual Seats/Tickets
│   └── User.js        # Mongoose Schema for Users & Admins
├── public/
│   ├── css/
│   │   └── style.css  # Global Design System & Admin Dark Mode
│   ├── js/
│   │   ├── app.js     # Master Client-Side Logic & WebSocket Listeners
│   │   └── admin.js   # Admin CMS & Dashboard Logic
│   ├── index.html     # Single Page Application (SPA) UI
│   ├── admin.html     # Secure Admin Dashboard
│   └── admin-login.html
├── .env               # Secure Environment Variables (Ignored by Git)
├── server.js          # Main Express API & Socket.io Server
└── package.json       # Project Manifest & Dependencies
