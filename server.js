// --- 1. IMPORTING REQUIRED LIBRARIES ---
const express = require('express');         
const mongoose = require('mongoose');       
const session = require('express-session'); 
const MongoStore = require('connect-mongo'); 
const bcrypt = require('bcryptjs');         
const path = require('path');               
const http = require('http');               
const { Server } = require('socket.io');  
const compression = require('compression'); 
require('dotenv').config();                 

const User = require('./models/User'); 
const Event = require('./models/Event');
const Seat = require('./models/Seat');

const app = express();
const server = http.createServer(app);      
const io = new Server(server);              

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';

app.set('trust proxy', 1); 

app.use(compression()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { 
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
})); 

app.use(session({
    secret: process.env.SESSION_SECRET || 'ticketmaster-secret-key', 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: DB_URI, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 14 
    } 
}));

mongoose.connect(DB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        await User.syncIndexes(); 
        await Seat.syncIndexes();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const verifyActiveUser = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const user = await User.findById(req.session.userId).lean();
    if (!user) {
        req.session.destroy(); 
        return res.status(401).json({ success: false, forceLogout: true, message: "Your account has been deleted." });
    }
    next(); 
};

const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(403).json({ success: false, message: "Forbidden: Admins Only" });
};

// ==========================================
// 🔑 AUTHENTICATION ROUTES
// ==========================================
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Fields required." });
        const cleanUsername = username.trim();
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } }).lean();
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: false });
        io.emit('dashboardUpdate'); 
        res.json({ success: true, message: "Account created! You can now log in." });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/admin/signup', async (req, res) => {
    try {
        const { username, password, secretKey } = req.body;
        const validSecret = process.env.ADMIN_SECRET;
        if (!validSecret) return res.status(500).json({ success: false, message: "Admin configuration missing on server." });
        if (secretKey !== validSecret) return res.status(403).json({ success: false, message: "Invalid Admin Secret Key." });

        const cleanUsername = username.trim();
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } }).lean();
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: cleanUsername, password: hashedPassword, isAdmin: true });
        io.emit('dashboardUpdate');
        res.json({ success: true, message: "Admin account created successfully." });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } }).lean();
        if (!user) return res.status(404).json({ success: false, notFound: true, message: "User not found." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password." });

        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;
        res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/check-session', async (req, res) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId).lean();
        if(!user) { req.session.destroy(); return res.json({ loggedIn: false }); }
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else { res.json({ loggedIn: false }); }
});

app.get('/api/profile', verifyActiveUser, async (req, res) => {
    const user = await User.findById(req.session.userId).select('-password').lean(); 
    res.json({ success: true, user });
});

app.put('/api/profile', verifyActiveUser, async (req, res) => {
    try {
        const { username, fullName, email, phone, dob, address } = req.body;
        const user = await User.findById(req.session.userId);
        user.username = username.trim(); user.fullName = fullName; user.email = email; user.phone = phone; user.dob = dob; user.address = address;
        await user.save();
        req.session.username = user.username; 
        res.json({ success: true, message: "Profile updated successfully!", newUsername: user.username });
    } catch (err) { res.status(500).json({ success: false, message: "Error updating profile." }); }
});

// ==========================================
// 🎟️ PUBLIC EVENTS & DYNAMIC SEATS
// ==========================================
app.get('/api/events', async (req, res) => {
    const events = await Event.find().sort({ startDate: 1 }).lean(); 
    res.json(events);
});

// 🚨 FIXED: This is the missing API route your frontend was begging for!
app.get('/api/events/:eventId/timeslots-availability', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({error: "Date required"});
    
    const event = await Event.findById(req.params.eventId).select('capacity timeSlots').lean();
    if (!event) return res.status(404).json({error: "Event not found"});

    const slotsData = [];
    for (let slot of event.timeSlots) {
        const soldForSlot = await Seat.countDocuments({ eventId: req.params.eventId, bookingDate: date, timeSlot: slot });
        slotsData.push({
            time: slot,
            capacity: event.capacity,
            sold: soldForSlot,
            available: event.capacity - soldForSlot
        });
    }
    res.json(slotsData);
});

app.get('/api/events/:eventId/availability', async (req, res) => {
    const { date, timeSlot } = req.query;
    if (!date || !timeSlot) return res.status(400).json({error: "Date and TimeSlot required"});
    
    const event = await Event.findById(req.params.eventId).select('capacity').lean();
    if (!event) return res.status(404).json({error: "Event not found"});
    
    const soldForDate = await Seat.countDocuments({ eventId: req.params.eventId, bookingDate: date, timeSlot: timeSlot });
    res.json({ capacity: event.capacity, sold: soldForDate, available: event.capacity - soldForDate });
});

app.get('/api/seats/:eventId', async (req, res) => {
    const { date, timeSlot } = req.query;
    if (!date || !timeSlot) return res.status(400).json({error: "Date and TimeSlot required"});
    
    const event = await Event.findById(req.params.eventId).select('capacity').lean();
    if (!event) return res.status(404).json({error: "Event not found"});

    const bookedSeats = await Seat.find({ eventId: req.params.eventId, bookingDate: date, timeSlot: timeSlot }).select('seatId').lean();
    const bookedSeatIds = bookedSeats.map(s => s.seatId);
    
    const allSeats = [];
    for(let i=1; i<=event.capacity; i++) {
        const sId = `S${i}`;
        allSeats.push({
            seatId: sId,
            status: bookedSeatIds.includes(sId) ? 'Booked' : 'Available'
        });
    }
    res.json(allSeats);
});

// ==========================================
// 🛒 CORE BOOKING LOGIC
// ==========================================
app.post('/api/events/book-seats', verifyActiveUser, async (req, res) => {
    const { eventId, seats, selectedDate, timeSlot } = req.body; 
    if(!selectedDate || !timeSlot) return res.status(400).json({success: false, message: "Date and Time required."});

    try {
        const event = await Event.findById(eventId);
        
        const seatsToInsert = seats.map(seatId => ({
            eventId, seatId, bookingDate: selectedDate, timeSlot, status: 'Booked',
            bookedBy: req.session.username, userId: req.session.userId
        }));

        await Seat.insertMany(seatsToInsert, { ordered: true });

        event.ticketsSold += seats.length; 
        await event.save();
        
        io.emit('seatUpdate', { eventId: eventId, date: selectedDate, timeSlot: timeSlot }); 
        io.emit('dashboardUpdate'); 
        res.json({ success: true, message: `Successfully booked ${seats.length} seat(s) for ${selectedDate} at ${timeSlot}!` });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: "One or more seats were snatched by someone else! Please refresh." });
        res.status(500).json({ success: false, message: "Booking error." });
    }
});

app.post('/api/events/book-general', verifyActiveUser, async (req, res) => {
    const { eventId, qty, selectedDate, timeSlot } = req.body;
    const requestedQty = Number(qty);

    try {
        const event = await Event.findById(eventId);
        const currentSoldForDate = await Seat.countDocuments({ eventId, bookingDate: selectedDate, timeSlot });

        if (currentSoldForDate + requestedQty > event.capacity) {
            return res.status(400).json({ success: false, message: "Not enough tickets available for this time slot." });
        }

        const generalTickets = [];
        for(let i=0; i<requestedQty; i++) {
            generalTickets.push({
                eventId: event._id,
                seatId: `GA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${i+1}`, 
                bookingDate: selectedDate,
                timeSlot: timeSlot,
                status: 'Booked',
                bookedBy: req.session.username,
                userId: req.session.userId 
            });
        }
        await Seat.insertMany(generalTickets);

        event.ticketsSold += requestedQty;
        await event.save();

        io.emit('seatUpdate', { eventId: eventId, date: selectedDate, timeSlot });
        io.emit('dashboardUpdate'); 

        res.json({ success: true, message: `Successfully booked ${requestedQty} ticket(s) for ${selectedDate} at ${timeSlot}!` });
    } catch (err) { res.status(500).json({ success: false, message: "Booking error." }); }
});

app.get('/api/my-tickets', verifyActiveUser, async (req, res) => {
    try {
        const mySeats = await Seat.find({ $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }] })
            .populate('eventId', '-imageUrl')
            .lean();
            
        const formattedTickets = mySeats.map(seat => {
            if (!seat.eventId) return null; 
            return {
                eventId: seat.eventId._id, 
                eventTitle: seat.eventId.title,
                bookingDate: seat.bookingDate, 
                timeSlot: seat.timeSlot,
                location: seat.eventId.location,
                eventType: seat.eventId.eventType,
                price: seat.eventId.price || 0,    
                seatId: seat.seatId
            };
        }).filter(t => t !== null);
        res.json(formattedTickets);
    } catch (err) { res.status(500).json({ success: false, message: "Failed to load tickets." }); }
});

app.post('/api/events/cancel-booking', verifyActiveUser, async (req, res) => {
    const { eventId, seatId, bookingDate, timeSlot } = req.body;
    try {
        const event = await Event.findById(eventId);
        
        const result = await Seat.findOneAndDelete({ 
            eventId, seatId, bookingDate, timeSlot, $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }]
        });

        if (result) {
            event.ticketsSold = Math.max(0, event.ticketsSold - 1);
            await event.save();
            
            io.emit('seatUpdate', { eventId: eventId, date: bookingDate, timeSlot });
            io.emit('dashboardUpdate');
            res.json({ success: true, message: "Booking cancelled successfully." });
        } else {
            res.status(400).json({ success: false, message: "Ticket not found or already cancelled." });
        }
    } catch (err) { res.status(500).json({ success: false, message: "Error cancelling booking." }); }
});

// ==========================================
// 🛠️ ADMIN ROUTES
// ==========================================
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
    try {
        const usersCount = await User.countDocuments();
        const events = await Event.find().select('title eventType ticketsSold capacity price').lean();
        
        let totalRevenue = 0; let totalTicketsSold = 0; let eventStats = [];
        events.forEach(e => {
            const rev = e.ticketsSold * e.price;
            totalTicketsSold += e.ticketsSold; totalRevenue += rev;
            eventStats.push({ title: e.title, type: e.eventType, ticketsSold: e.ticketsSold, capacity: e.capacity, revenue: rev });
        });
        eventStats.sort((a, b) => b.revenue - a.revenue);
        res.json({ success: true, totalUsers: usersCount, totalEvents: events.length, totalTicketsSold, totalRevenue, eventStats });
    } catch (err) { res.status(500).json({ success: false, message: "Error fetching analytics." }); }
});

app.get('/api/admin/events', requireAdmin, async (req, res) => { 
    res.json(await Event.find().sort({ startDate: -1 }).lean()); 
});

app.get('/api/admin/users', requireAdmin, async (req, res) => { 
    res.json(await User.find().select('-password').lean()); 
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
    try {
        const { title, ageLimit, eventType, category, capacity, price, startDate, endDate, location, description, imageUrl, timeSlots } = req.body;
        // 🚨 FIXED: Parse timeSlots string into an array before saving to DB
        let parsedTimeSlots = timeSlots ? timeSlots.split(',').map(s => s.trim()).filter(s => s) : ["12:00 PM"];
        
        await Event.create({ title, ageLimit, eventType, category, capacity, price, startDate, endDate, location, description, imageUrl, timeSlots: parsedTimeSlots });
        io.emit('eventUpdate'); io.emit('dashboardUpdate'); 
        res.json({ success: true, message: "Event created successfully!" });
    } catch (err) { 
        res.status(500).json({ success: false, message: "Error creating event." }); 
    }
});

app.put('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try { 
        let updateData = { ...req.body };
        // 🚨 FIXED: Parse timeSlots string into an array before updating DB
        if (updateData.timeSlots && typeof updateData.timeSlots === 'string') {
            updateData.timeSlots = updateData.timeSlots.split(',').map(s => s.trim()).filter(s => s);
        }
        await Event.findByIdAndUpdate(req.params.id, updateData); 
        io.emit('eventUpdate'); io.emit('dashboardUpdate'); 
        res.json({ success: true, message: "Event updated successfully." }); 
    }
    catch (err) { res.status(500).json({ success: false, message: "Error updating event." }); }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.id);
        await Seat.deleteMany({ eventId: req.params.id }); 
        io.emit('eventUpdate'); io.emit('dashboardUpdate');
        res.json({ success: true, message: "Event deleted." });
    } catch (err) { res.status(500).json({ success: false, message: "Error deleting event." }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const userSeats = await Seat.find({ userId: userId });
        if (userSeats.length > 0) {
            const eventCounts = {};
            userSeats.forEach(seat => { eventCounts[seat.eventId] = (eventCounts[seat.eventId] || 0) + 1; });
            for (const eventId in eventCounts) { await Event.findByIdAndUpdate(eventId, { $inc: { ticketsSold: -eventCounts[eventId] } }); }
            await Seat.deleteMany({ userId: userId });
            for (const eventId in eventCounts) { io.emit('eventUpdate'); }
        }
        await User.findByIdAndDelete(userId); 
        io.emit('dashboardUpdate'); io.emit('eventUpdate'); 
        res.json({ success: true, message: "User and tickets deleted." });
    } catch (err) { res.status(500).json({ success: false, message: "Error deleting user." }); }
});

server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT} bound to 0.0.0.0`); });
