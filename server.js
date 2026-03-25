// --- 1. IMPORTING REQUIRED LIBRARIES ---
const express = require('express');         // The core framework for building the web server
const mongoose = require('mongoose');       // The tool to talk to our MongoDB database
const session = require('express-session'); // Creates browser cookies to remember who is logged in
const bcrypt = require('bcryptjs');         // Cryptography library to safely hash user passwords
const path = require('path');               // Helps locate files on the server
const http = require('http');               // Core Node.js HTTP module
const { Server } = require('socket.io');    // The WebSockets library for real-time live updates
require('dotenv').config();                 // Loads hidden environment variables (like DB passwords)

// Import our Database Blueprints (Models)
const User = require('./models/User'); 
const Event = require('./models/Event');
const Seat = require('./models/Seat');

// --- 2. SERVER INITIALIZATION ---
const app = express();
const server = http.createServer(app);      // We wrap Express in a standard HTTP server so WebSockets can attach to it
const io = new Server(server);              // Initialize the live WebSocket engine

const PORT = process.env.PORT || 3000;

// --- 3. MIDDLEWARE CONFIGURATION ---
app.use(express.json()); // Tells the server how to read incoming JSON data from frontend forms
app.use(express.static(path.join(__dirname, 'public'))); // Tells the server to serve HTML/CSS/JS files from the 'public' folder

// Session Config: Gives every user a unique 'cookie' when they log in to track their state
app.use(session({
    secret: process.env.SESSION_SECRET || 'ticketmaster-secret-key', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // 'secure' would be true if we were using forced HTTPS (SSL)
}));

// --- 4. DATABASE CONNECTION ---
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';
mongoose.connect(DB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        // syncIndexes ensures our 'unique' constraints (like duplicate usernames) are actively enforced
        await User.syncIndexes(); 
        await Seat.syncIndexes();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// 🛡️ SECURITY MIDDLEWARE
// ==========================================

// This function intercepts requests. If a user tries to book a ticket, it checks if they are logged in.
// It also checks if the admin deleted their account while they were logged in (Ghost User check).
const verifyActiveUser = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    
    const user = await User.findById(req.session.userId);
    if (!user) {
        req.session.destroy(); // Kill the session
        return res.status(401).json({ success: false, forceLogout: true, message: "Your account has been deleted by an administrator." });
    }
    next(); // Security passed! Let them continue to the requested route.
};

// Intercepts requests meant for the Admin panel to ensure standard users can't access them
const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(403).json({ success: false, message: "Forbidden: Admins Only" });
};

// ==========================================
// 🔑 AUTHENTICATION ROUTES (Login / Signup)
// ==========================================

app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Fields required." });

        const cleanUsername = username.trim();
        // Uses Regex 'i' for case-insensitive search (e.g. 'Mohar' and 'mohar' are treated as the same)
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        // SECURITY: We NEVER store plaintext passwords. We hash it with a "salt" round of 10.
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: false });
        
        io.emit('dashboardUpdate'); // Broadcast to the Admin panel that a new user just registered live
        res.json({ success: true, message: "Account created! You can now log in." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/admin/signup', async (req, res) => {
    try {
        const { username, password, secretKey } = req.body;
        // The Root Secret Key prevents random users from creating admin accounts
        const validSecret = process.env.ADMIN_SECRET || 'admin123';
        if (secretKey !== validSecret) return res.status(403).json({ success: false, message: "Invalid Admin Secret Key." });

        const cleanUsername = username.trim();
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        // Notice: isAdmin is strictly set to TRUE here
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: true });
        
        io.emit('dashboardUpdate');
        res.json({ success: true, message: "Admin account created successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        
        const user = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (!user) return res.status(404).json({ success: false, notFound: true, message: "User not found." });

        // Compares the typed password against the scrambled hash in the database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password." });

        // Establish the secure server-side session
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;
        res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(); // Erases the session memory on the server
    res.json({ success: true });
});

app.get('/api/check-session', async (req, res) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        if(!user) {
            req.session.destroy();
            return res.json({ loggedIn: false });
        }
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==========================================
// 👤 USER PROFILE (Protected Routes)
// ==========================================

// Both of these routes pass through 'verifyActiveUser' middleware first
app.get('/api/profile', verifyActiveUser, async (req, res) => {
    const user = await User.findById(req.session.userId).select('-password'); // .select('-password') hides the hash from the frontend
    res.json({ success: true, user });
});

app.put('/api/profile', verifyActiveUser, async (req, res) => {
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
    const events = await Event.find().sort({ startDate: 1 }); // Sorts by soonest event first
    res.json(events);
});

app.get('/api/seats/:eventId', async (req, res) => {
    const seats = await Seat.find({ eventId: req.params.eventId });
    res.json(seats);
});

// ==========================================
// 🛒 CORE BOOKING LOGIC (Concurrency Control)
// ==========================================

app.post('/api/events/book-seats', verifyActiveUser, async (req, res) => {
    const { eventId, seats } = req.body; 
    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        // ATOMIC UPDATE: We try to update ALL requested seats in one single, unbreakable database action.
        // It strictly requires the seats to be 'Available'. 
        const result = await Seat.updateMany(
            { eventId: eventId, seatId: { $in: seats }, status: 'Available' },
            { $set: { status: 'Booked', bookedBy: req.session.username, userId: req.session.userId } } 
        );

        // RACE CONDITION CHECK: If the user wanted 3 seats, but the DB only modified 2, it means someone else stole 1 seat a millisecond earlier!
        if (result.modifiedCount !== seats.length) {
            return res.status(400).json({ success: false, message: "Some seats were already taken. Try again." });
        }

        event.ticketsSold += seats.length;
        await event.save();
        
        // Broadcast the live update to all users online
        io.emit('seatUpdate', { eventId: eventId }); 
        io.emit('dashboardUpdate'); 
        io.emit('eventUpdate'); 

        res.json({ success: true, message: `Successfully booked ${seats.length} seat(s)!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

app.post('/api/events/book-general', verifyActiveUser, async (req, res) => {
    const { eventId, qty } = req.body;
    const requestedQty = Number(qty);

    try {
        // ATOMIC UPDATE: We use '$expr' to mathematically check if Capacity is Greater Than (TicketsSold + RequestedQty)
        // This calculates directly inside the database engine to guarantee flawless concurrency.
        const event = await Event.findOneAndUpdate(
            { _id: eventId, $expr: { $gte: [ "$capacity", { $add: ["$ticketsSold", requestedQty] } ] } },
            { $inc: { ticketsSold: requestedQty } }, // Safely increments the ticket count
            { new: true }
        );

        if (!event) return res.status(400).json({ success: false, message: "Not enough tickets available or event not found." });

        const generalTickets = [];
        for(let i=0; i<requestedQty; i++) {
            generalTickets.push({
                eventId: event._id,
                seatId: `GA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${i+1}`, // Generates a random Ticket ID
                status: 'Booked',
                bookedBy: req.session.username,
                userId: req.session.userId 
            });
        }
        // Inserts all newly generated tickets efficiently in bulk
        await Seat.insertMany(generalTickets);

        io.emit('seatUpdate', { eventId: eventId });
        io.emit('dashboardUpdate'); 
        io.emit('eventUpdate'); 

        res.json({ success: true, message: `Successfully booked ${requestedQty} ticket(s)!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

app.get('/api/my-tickets', verifyActiveUser, async (req, res) => {
    try {
        // Find tickets belonging to the user. 'populate' pulls in the associated Event data so we can see the Title/Date.
        const mySeats = await Seat.find({ 
            $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }]
        }).populate('eventId');
        
        // Clean up the data before sending it to the frontend
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

app.post('/api/events/cancel-booking', verifyActiveUser, async (req, res) => {
    const { eventId, seatId } = req.body;
    try {
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        let result;
        if (seatId.startsWith('GA-')) {
            // General Admission tickets are physically deleted from the database
            result = await Seat.findOneAndDelete({ 
                eventId, seatId, $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }]
            });
        } else {
            // Seated tickets are kept, but reset to 'Available'
            result = await Seat.findOneAndUpdate(
                { eventId, seatId, $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }] },
                { $set: { status: 'Available', bookedBy: null, userId: null } }
            );
        }

        if (result) {
            // Decrement the tickets sold, ensuring it never drops below 0 mathematically
            event.ticketsSold = Math.max(0, event.ticketsSold - 1);
            await event.save();
            
            io.emit('seatUpdate', { eventId: eventId });
            io.emit('dashboardUpdate');
            io.emit('eventUpdate'); 
            
            res.json({ success: true, message: "Booking cancelled successfully." });
        } else {
            res.status(400).json({ success: false, message: "Ticket not found or already cancelled." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Error cancelling booking." });
    }
});

// ==========================================
// 🛠️ ADMIN ROUTES (Strictly Protected)
// ==========================================

// Analytics calculation engine
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
    try {
        const usersCount = await User.countDocuments();
        const events = await Event.find();
        
        let totalRevenue = 0; let totalTicketsSold = 0; let eventStats = [];
        
        // Loop through all events to calculate global statistics dynamically
        events.forEach(e => {
            const rev = e.ticketsSold * e.price;
            totalTicketsSold += e.ticketsSold;
            totalRevenue += rev;
            eventStats.push({ title: e.title, type: e.eventType, ticketsSold: e.ticketsSold, capacity: e.capacity, revenue: rev });
        });

        // Sort events by highest revenue
        eventStats.sort((a, b) => b.revenue - a.revenue);
        res.json({ success: true, totalUsers: usersCount, totalEvents: events.length, totalTicketsSold, totalRevenue, eventStats });
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
        const newEvent = await Event.create({ title, ageLimit, eventType, capacity, price, startDate, endDate, location, description, imageUrl });
        
        // If an Admin creates a 'Seated' event, the backend automatically generates the physical seats (S1, S2, etc) in bulk
        if (newEvent.eventType === 'Seated') {
            const seatsToCreate = [];
            for (let i = 1; i <= newEvent.capacity; i++) {
                seatsToCreate.push({ eventId: newEvent._id, seatId: `S${i}` });
            }
            await Seat.insertMany(seatsToCreate);
        }
        
        io.emit('eventUpdate'); 
        io.emit('dashboardUpdate'); 
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

        // Security check: You cannot change the capacity or type of an event if people have already bought tickets!
        if (oldEvent.ticketsSold > 0) {
            if (oldEvent.eventType !== eventType) return res.status(400).json({ success: false, message: "Cannot change type after tickets sold." });
            if (newCapacity < oldEvent.capacity) return res.status(400).json({ success: false, message: "Cannot reduce capacity after tickets sold." });
        }

        // Dynamically add more seats if the Admin increases capacity
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
        
        io.emit('eventUpdate');
        io.emit('seatUpdate', { eventId: req.params.id });
        io.emit('dashboardUpdate'); 
        res.json({ success: true, message: "Event updated successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating event." });
    }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.id);
        await Seat.deleteMany({ eventId: req.params.id }); // Clean up associated seats
        
        io.emit('eventUpdate');
        io.emit('dashboardUpdate');
        res.json({ success: true, message: "Event deleted." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error deleting event." });
    }
});

// CASCADING DELETE LOGIC: When an admin deletes a user, clean up all their tickets too.
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const userSeats = await Seat.find({ userId: userId });

        if (userSeats.length > 0) {
            const eventCounts = {};
            // Group how many tickets the user had per event
            userSeats.forEach(seat => {
                eventCounts[seat.eventId] = (eventCounts[seat.eventId] || 0) + 1;
            });

            // Adjust the total 'ticketsSold' count on every event mathematically
            for (const eventId in eventCounts) {
                await Event.findByIdAndUpdate(eventId, { $inc: { ticketsSold: -eventCounts[eventId] } });
            }

            // Remove GA tickets entirely, and release Seated tickets back to the public
            await Seat.deleteMany({ userId: userId, seatId: { $regex: /^GA-/ } });
            await Seat.updateMany(
                { userId: userId, seatId: { $not: { $regex: /^GA-/ } } },
                { $set: { status: 'Available', bookedBy: null, userId: null } }
            );

            // Pulse the update so the UI turns those seats white instantly
            for (const eventId in eventCounts) {
                io.emit('seatUpdate', { eventId: eventId });
            }
        }

        await User.findByIdAndDelete(userId); // Finally, execute the user
        
        io.emit('dashboardUpdate');
        io.emit('eventUpdate'); 
        res.json({ success: true, message: "User and their booked tickets were deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error deleting user." });
    }
});

// Start the HTTP Server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
