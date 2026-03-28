# 🎟️ Ticket Booking System (Full-Stack Node + WebSockets)

A professional, real-time event ticketing platform built with Node.js, Express, MongoDB, and Vanilla JavaScript. This system features live seat synchronization, concurrency control, a dynamic "Smart Theme" UI engine, and a secure admin dashboard.

## ✨ Key Features

* **🟢 Real-Time Seat Synchronization:** Powered by `Socket.io`, when one user books a seat, it instantly turns grey on every other user's screen without requiring a page refresh.
* **🎨 Smart Theme Engine (Auto-Color Extraction):** When an admin uploads an event poster, the system uses the HTML5 Canvas API to scan the image's pixels, extract the dominant vibrant color, and dynamically re-theme the entire user interface (buttons, glows, and borders) to match that specific event.
* **💎 Premium "District" Aesthetic:** A modern, app-like UI featuring glassmorphism navbars, high-contrast dark modes, massive border radii, and buttery-smooth `cubic-bezier` micro-interactions.
* **🛡️ Concurrency Control (Race Condition Prevention):** Utilizes MongoDB atomic updates (`$inc`, `$set`) to guarantee that two users cannot mathematically book the same seat at the exact same millisecond.
* **🚀 Cold-Start Resilient:** Architected for free-tier cloud hosting (like Render). Features a smart asynchronous initialization protocol that detects server sleep states and elegantly informs the user without freezing the browser or deadlocking CDN dependencies.
* **⏱️ Automated Event Expiration:** A "Frontend Heartbeat" constantly checks the UTC time against the server. When an event ends, the UI instantly locks down ticket sales.
* **🎬 CBFC Rating Enforcement:** Integrated Indian CBFC ratings (U, UA 7+, A, S). The system dynamically checks a user's Date of Birth and enforces strict blocks or parental permission prompts based on the event's rating.
* **📊 Live Admin Dashboard:** A secure CMS where admins can perform CRUD operations, upload Base64 local images, manage users, and watch revenue/ticket analytics update in real-time.
* **🎫 Digital Tickets with QR Codes:** Successfully booked tickets generate dynamic QR codes for physical event scanning.

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3 (Custom Contextual Variables), Vanilla JavaScript (DOM Manipulation, Canvas API, FileReader API), Bootstrap 5.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB & Mongoose (Object Data Modeling).
* **Real-Time Engine:** Socket.io (WebSockets via Global CDN).
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

* **CORS-Bypass Proxy:** The image analyzer utilizes an automatic fallback to a raw data proxy (`api.allorigins.win`) to successfully extract color themes even from highly-secured external image URLs.
* **Single Page Application (SPA) Feel:** While not using React, the frontend utilizes heavy DOM manipulation and state management to hide/show sections seamlessly, creating a fast experience without reloading the browser.
* **Cascading Deletes:** If an admin deletes a user, the backend recursively hunts down all tickets owned by that user, subtracts them from the event's `ticketsSold` tally, and releases the seats back to the public before terminating the account.
* **Aggressive Cache Busting:** Utilizes timestamp-appended URLs (`?t=123456`) for data fetching and hardcoded versioning (`?v=DISTRICT_FINAL`) on stylesheets to ensure mobile browsers never load stale states. 

## 📂 Project Structure

```text
ticketing-system/
├── models/
│   ├── Event.js       # Mongoose Schema for Events (Includes themeColor)
│   ├── Seat.js        # Mongoose Schema for individual Seats/Tickets
│   └── User.js        # Mongoose Schema for Users & Admins
├── public/
│   ├── css/
│   │   └── style.css  # Global Design System, CSS Vars & Deep Dark Mode
│   ├── js/
│   │   ├── app.js     # Master Client-Side Logic, SPA Routing & WebSockets
│   │   └── admin.js   # Admin CMS, Base64 File Uploads & Canvas Color Extractor
│   ├── index.html     # Single Page Application (SPA) UI
│   ├── admin.html     # Secure Admin Dashboard
│   └── admin-login.html
├── .env               # Secure Environment Variables (Ignored by Git)
├── server.js          # Main Express API & Socket.io Server (0.0.0.0 Bound)
└── package.json       # Project Manifest & Dependencies
```
