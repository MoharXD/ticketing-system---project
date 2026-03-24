const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs'); // Used for securely hashing passwords
const path = require('path');
require('dotenv').config(); // Loads environment variables

// Import Mongoose models to interact with the database
const User = require('./models/User'); 
const Event = require('./models/Event');
const Seat = require('./models/Seat');

const app = express();
// FIXED: Use Render's dynamically assigned port, or 3000 for local development
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
// Parses incoming JSON payloads from frontend fetch requests
app.use(express.json());
// Serves static files (HTML, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

// Sets up Server-Side Sessions to remember logged-in users
app.use(session({
    // FIXED: Use Render environment variable for the session secret
    secret: process.env.SESSION_SECRET || 'ticketmaster-secret-key', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// --- DATABASE CONNECTION ---
// FIXED: Use Render environment variable for MongoDB connection
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';

mongoose.connect(DB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        await User.syncIndexes(); // Ensures unique constraints are built
        await Seat.syncIndexes();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// 🛡️ AUTHENTICATION & SESSIONS
// ==========================================

app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Fields required." });

        const cleanUsername = username.trim();

        // Check if user already exists (case-insensitive search using Regex)
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        // SECURITY: Hash password with a 'salt' round of 10
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: false });
        res.json({ success: true, message: "Account created! You can now log in." });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: "A database constraint blocked this signup." });
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/admin/signup', async (req, res) => {
    try {
        const { username, password, secretKey } = req.body;
        const validSecret = process.env.ADMIN_SECRET || 'admin123';
        if (secretKey !== validSecret) return res.status(403).json({ success: false, message: "Invalid Admin Secret Key." });

        const cleanUsername = username.trim();
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: true });
        res.json({ success: true, message: "Admin account created successfully." });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: "Database error. Username taken." });
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        
        const user = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (!user) return res.status(404).json({ success: false, notFound: true, message: "User not found. Would you like to sign up?" });

        // SECURITY: Compare the plaintext password from the user with the hashed password in the DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password. Please try again." });

        // Establish the session
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;
        res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(); // Destroys the session object on the server
    res.json({ success: true });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==========================================
// 👤 USER PROFILE
// ==========================================

app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    const user = await User.findById(req.session.userId).select('-password');
    res.json({ success: true, user });
});

app.put('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    try {
        const { username, fullName, email, phone, dob, address } = req.body;
        const user = await User.findById(req.session.userId);
        
        user.username = username.trim();
        user.fullName = fullName;
        user.email = email;
        user.phone = phone;
        user.dob = dob;
        user.address = address;
        await user.save();
        
        req.session.username = user.username; 
        res.json({ success: true, message: "Profile updated successfully!", newUsername: user.username });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating profile." });
    }
});

// ==========================================
// 🎟️ PUBLIC EVENTS & SEATS
// ==========================================

app.get('/api/events', async (req, res) => {
    const events = await Event.find().sort({ startDate: 1 });
    res.json(events);
});

app.get('/api/seats/:eventId', async (req, res) => {
    const seats = await Seat.find({ eventId: req.params.eventId });
    res.json(seats);
});

// ==========================================
// 🛒 BOOKING & CANCELLATION ROUTES
// ==========================================

app.post('/api/events/book-seats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const { eventId, seats } = req.body; 
    
    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        // ATOMIC UPDATE: Prevents "Race Conditions" where two users try to book the exact same seat
        const result = await Seat.updateMany(
            { eventId: eventId, seatId: { $in: seats }, status: 'Available' },
            { $set: { status: 'Booked', bookedBy: req.session.username, userId: req.session.userId } } 
        );

        if (result.modifiedCount !== seats.length) {
            return res.status(400).json({ success: false, message: "Some seats were already taken. Try again." });
        }

        event.ticketsSold += seats.length;
        await event.save();
        res.json({ success: true, message: `Successfully booked ${seats.length} seat(s)!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

app.post('/api/events/book-general', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const { eventId, qty } = req.body;
    const requestedQty = Number(qty);

    try {
        // ATOMIC UPDATE: Finds the event AND checks if capacity allows for the requested quantity
        const event = await Event.findOneAndUpdate(
            { 
                _id: eventId,
                $expr: { $gte: [ "$capacity", { $add: ["$ticketsSold", requestedQty] } ] }
            },
            { $inc: { ticketsSold: requestedQty } },
            { new: true }
        );

        if (!event) return res.status(400).json({ success: false, message: "Not enough tickets available or event not found." });

        const generalTickets = [];
        for(let i=0; i<requestedQty; i++) {
            generalTickets.push({
                eventId: event._id,
                seatId: `GA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${i+1}`, 
                status: 'Booked',
                bookedBy: req.session.username,
                userId: req.session.userId 
            });
        }
        await Seat.insertMany(generalTickets);

        res.json({ success: true, message: `Successfully booked ${requestedQty} General Admission ticket(s)!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

app.get('/api/my-tickets', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    try {
        const mySeats = await Seat.find({ 
            $or: [
                { userId: req.session.userId },
                { bookedBy: req.session.username }
            ]
        }).populate('eventId');
        
        const formattedTickets = mySeats.map(seat => {
            if (!seat.eventId) return null; 
            return {
                eventId: seat.eventId._id, 
                eventTitle: seat.eventId.title,
                startDate: seat.eventId.startDate,
                location: seat.eventId.location,
                eventType: seat.eventId.eventType,
                seatId: seat.seatId
            };
        }).filter(t => t !== null);

        res.json(formattedTickets);
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to load tickets." });
    }
});

app.post('/api/events/cancel-booking', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const { eventId, seatId } = req.body;

    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        let result;
        if (seatId.startsWith('GA-')) {
            result = await Seat.findOneAndDelete({ 
                eventId, 
                seatId, 
                $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }]
            });
        } else {
            result = await Seat.findOneAndUpdate(
                { eventId, seatId, $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }] },
                { $set: { status: 'Available', bookedBy: null, userId: null } }
            );
        }

        if (result) {
            event.ticketsSold = Math.max(0, event.ticketsSold - 1);
            await event.save();
            res.json({ success: true, message: "Booking cancelled successfully." });
        } else {
            res.status(400).json({ success: false, message: "Ticket not found or already cancelled." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Error cancelling booking." });
    }
});

// ==========================================
// 🛠️ ADMIN ROUTES
// ==========================================

const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(403).json({ success: false, message: "Forbidden" });
};

app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
    try {
        const usersCount = await User.countDocuments();
        const events = await Event.find();
        
        let totalRevenue = 0;
        let totalTicketsSold = 0;
        let eventStats = [];
        
        events.forEach(e => {
            const rev = e.ticketsSold * e.price;
            totalTicketsSold += e.ticketsSold;
            totalRevenue += rev;
            
            eventStats.push({
                title: e.title,
                type: e.eventType,
                ticketsSold: e.ticketsSold,
                capacity: e.capacity,
                revenue: rev
            });
        });

        eventStats.sort((a, b) => b.revenue - a.revenue);

        res.json({
            success: true,
            totalUsers: usersCount,
            totalEvents: events.length,
            totalTicketsSold,
            totalRevenue,
            eventStats
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching analytics." });
    }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => {
    const events = await Event.find().sort({ startDate: -1 });
    res.json(events);
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await User.find().select('-password');
    res.json(users);
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
    try {
        const { title, ageLimit, eventType, capacity, price, startDate, endDate, location, description, imageUrl } = req.body;
        
        const newEvent = await Event.create({
            title, ageLimit, eventType, capacity, price, startDate, endDate, location, description, imageUrl
        });
        
        if (newEvent.eventType === 'Seated') {
            const seatsToCreate = [];
            for (let i = 1; i <= newEvent.capacity; i++) {
                seatsToCreate.push({ eventId: newEvent._id, seatId: `S${i}` });
            }
            await Seat.insertMany(seatsToCreate);
        }
        res.json({ success: true, message: "Event created successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error creating event." });
    }
});

app.put('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try {
        const oldEvent = await Event.findById(req.params.id);
        const { eventType, capacity, imageUrl } = req.body; 
        const newCapacity = Number(capacity);

        if (oldEvent.ticketsSold > 0) {
            if (oldEvent.eventType !== eventType) {
                return res.status(400).json({ success: false, message: "Cannot change type after tickets sold." });
            }
            if (newCapacity < oldEvent.capacity) {
                return res.status(400).json({ success: false, message: "Cannot reduce capacity after tickets sold." });
            }
        }

        if (eventType === 'Seated') {
            const currentSeatCount = await Seat.countDocuments({ eventId: oldEvent._id });
            if (newCapacity > currentSeatCount) {
                const seatsToCreate = [];
                for (let i = currentSeatCount + 1; i <= newCapacity; i++) {
                    seatsToCreate.push({ eventId: oldEvent._id, seatId: `S${i}` });
                }
                await Seat.insertMany(seatsToCreate);
            }
        }

        await Event.findByIdAndUpdate(req.params.id, req.body);
        res.json({ success: true, message: "Event updated successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating event." });
    }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.id);
        await Seat.deleteMany({ eventId: req.params.id }); 
        res.json({ success: true, message: "Event deleted." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error deleting event." });
    }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "User deleted." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error deleting user." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
