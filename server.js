// ==========================================
// DEPENDENCIES & SETUP
// ==========================================
// Express is our web framework that handles HTTP requests (GET, POST, etc.)
const express = require('express');
// Mongoose is an ODM (Object Data Modeling) library used to interact with MongoDB
const mongoose = require('mongoose');
// express-session manages user login states using cookies
const session = require('express-session');
// bcryptjs is used for securely hashing passwords so they aren't stored as plain text
const bcrypt = require('bcryptjs'); 
// path helps us serve HTML/CSS files correctly regardless of the operating system
const path = require('path');
// dotenv loads environment variables from a .env file (crucial for live deployment)
require('dotenv').config(); 

// Import our custom Database Models
const User = require('./models/User'); 
const Event = require('./models/Event');
const Seat = require('./models/Seat');

const app = express();

// --- LIVE DEPLOYMENT CONFIGURATION ---
// If the app is live (e.g., on Render), process.env.PORT will be used. Otherwise, use 3000 locally.
const PORT = process.env.PORT || 3000;
// Same for the Database. Use a live MongoDB Atlas URL if available, otherwise use local DB.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ticketmaster-secret-key';

// ==========================================
// MIDDLEWARE
// ==========================================
// This tells Express to parse incoming requests that contain JSON data
app.use(express.json());
// This tells Express to serve our static files (HTML, CSS, images) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public'))); 

// Configure the session tracking
app.use(session({
    secret: SESSION_SECRET, 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // 'secure: true' would require HTTPS
}));

// ==========================================
// DATABASE CONNECTION
// ==========================================
// Asynchronously connect to MongoDB using the URI defined above
mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB successfully.');
        // syncIndexes ensures that unique constraints (like unique usernames) are enforced in the database
        await User.syncIndexes(); 
        await Seat.syncIndexes();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// 🛡️ AUTHENTICATION ROUTES (API Endpoints)
// ==========================================

// Route to handle standard user signup
app.post('/api/signup', async (req, res) => {
    try {
        // Destructure (extract) the username and password sent from the frontend
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Fields required." });

        const cleanUsername = username.trim();

        // Check if the user already exists using a case-insensitive regular expression
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        // SECURITY: Hash the password. '10' is the salt round, determining how complex the hash is.
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save the new user to the database
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: false });
        res.json({ success: true, message: "Account created! You can now log in." });
    } catch (err) {
        // Error code 11000 means a unique constraint (like duplicate username) failed in MongoDB
        if (err.code === 11000) return res.status(400).json({ success: false, message: "Username taken." });
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// Route to handle login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        
        // Find the user in the database
        const user = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (!user) return res.status(404).json({ success: false, notFound: true, message: "User not found. Would you like to sign up?" });

        // SECURITY: Use bcrypt to compare the plain text password with the hashed password in the DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password. Please try again." });

        // If passwords match, create a server-side session for the user
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;
        
        // Send success response back to the frontend
        res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// Route to destroy the session (Logout)
app.post('/api/logout', (req, res) => {
    req.session.destroy(); 
    res.json({ success: true });
});

// Checks if a user is currently logged in by looking for their session ID
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==========================================
// 👤 USER PROFILE ROUTES
// ==========================================

// Fetches the user's profile data (excluding their password for security)
app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    const user = await User.findById(req.session.userId).select('-password');
    res.json({ success: true, user });
});

// Updates the user's profile information
app.put('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    try {
        const { username, fullName, email, phone, dob, address } = req.body;
        const user = await User.findById(req.session.userId);
        
        // Update document fields
        user.username = username.trim();
        user.fullName = fullName;
        user.email = email;
        user.phone = phone;
        user.dob = dob;
        user.address = address;
        
        // Save changes to MongoDB
        await user.save();
        
        req.session.username = user.username; 
        res.json({ success: true, message: "Profile updated successfully!", newUsername: user.username });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating profile." });
    }
});

// ==========================================
// 🎟️ EVENT & BOOKING ROUTES
// ==========================================

// Fetches all available events, sorted by start date
app.get('/api/events', async (req, res) => {
    const events = await Event.find().sort({ startDate: 1 });
    res.json(events);
});

// Fetches all seats belonging to a specific event
app.get('/api/seats/:eventId', async (req, res) => {
    const seats = await Seat.find({ eventId: req.params.eventId });
    res.json(seats);
});

// Books specific numbered seats
app.post('/api/events/book-seats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const { eventId, seats } = req.body; 
    
    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        // ATOMIC UPDATE: updateMany prevents a "Race Condition" where two users click book at the exact same millisecond. 
        // It strictly requires the seat status to currently be 'Available' before updating it.
        const result = await Seat.updateMany(
            { eventId: eventId, seatId: { $in: seats }, status: 'Available' },
            { $set: { status: 'Booked', bookedBy: req.session.username, userId: req.session.userId } } 
        );

        // If the number of modified documents doesn't match the requested seats, someone else took one.
        if (result.modifiedCount !== seats.length) {
            return res.status(400).json({ success: false, message: "Some seats were already taken. Try again." });
        }

        // Increment the tickets sold counter on the event
        event.ticketsSold += seats.length;
        await event.save();
        
        res.json({ success: true, message: `Successfully booked ${seats.length} seat(s)!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

// Start the Express Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});