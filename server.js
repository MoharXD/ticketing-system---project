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
const redis = require('redis'); // 🚨 NEW: Redis Library
require('dotenv').config();                 

const User = require('./models/User'); 
const Event = require('./models/Event');
const Seat = require('./models/Seat');

const app = express();
const server = http.createServer(app);      
const io = new Server(server);              

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticketingDB';

// ==========================================
// 🚀 REDIS CACHE INITIALIZATION
// ==========================================
let redisClient;
let isRedisConnected = false;

(async () => {
    redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });

    redisClient.on('error', (err) => {
        if (isRedisConnected) console.warn('⚠️ Redis Disconnected. Falling back to MongoDB.');
        isRedisConnected = false;
    });

    redisClient.on('connect', () => {
        console.log('🟢 Connected to Redis Cache');
        isRedisConnected = true;
    });

    try {
        await redisClient.connect();
    } catch (err) {
        console.warn('⚠️ Redis not running locally. Starting app with MongoDB only (Safe Fallback).');
    }
})();

// Helper to invalidate cache when database changes
const clearEventsCache = async () => {
    if (isRedisConnected) {
        try { await redisClient.del('events_cache'); } catch(e) {}
    }
};

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
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 14 } 
}));

mongoose.connect(DB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        await User.syncIndexes(); await Seat.syncIndexes();
    }).catch(err => console.error('❌ MongoDB Connection Error:', err));

const verifyActiveUser = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "Not logged in" });
    const user = await User.findById(req.session.userId).lean();
    if (!user) {
        req.session.destroy(); return res.status(401).json({ success: false, forceLogout: true, message: "Your account has been deleted." });
    }
    next(); 
};

const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) next(); else res.status(403).json({ success: false, message: "Forbidden" });
};

// --- AUTH ROUTES ---
app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Fields required." });
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } }).lean();
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });
        await User.create({ username: username.trim(), password: await bcrypt.hash(password, 10), isAdmin: false });
        io.emit('dashboardUpdate'); res.json({ success: true, message: "Account created!" });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/admin/signup', async (req, res) => {
    try {
        const { username, password, secretKey } = req.body;
        if (secretKey !== process.env.ADMIN_SECRET) return res.status(403).json({ success: false, message: "Invalid Secret Key." });
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } }).lean();
        if (existingUser) return res.status(400).json({ success: false, message: "Username taken." });
        await User.create({ username: username.trim(), password: await bcrypt.hash(password, 10), isAdmin: true });
        io.emit('dashboardUpdate'); res.json({ success: true, message: "Admin account created." });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: { $regex: new RegExp(`^${req.body.username.trim()}$`, 'i') } }).lean();
        if (!user) return res.status(404).json({ success: false, notFound: true, message: "User not found." });
        if (!(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: "Incorrect password." });
        req.session.userId = user._id; req.session.username = user.username; req.session.isAdmin = user.isAdmin;
        res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    } catch (err) { res.status(500).json({ success: false, message: "Server error." }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/check-session', async (req, res) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId).lean();
        if(!user) { req.session.destroy(); return res.json({ loggedIn: false }); }
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else res.json({ loggedIn: false });
});

app.get('/api/profile', verifyActiveUser, async (req, res) => { res.json({ success: true, user: await User.findById(req.session.userId).select('-password').lean() }); });

app.put('/api/profile', verifyActiveUser, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.session.userId, req.body, {new: true});
        req.session.username = user.username; res.json({ success: true, message: "Profile updated!", newUsername: user.username });
    } catch (err) { res.status(500).json({ success: false, message: "Error updating profile." }); }
});

// ==========================================
// 🎟️ EVENT ROUTES (REDIS CACHED)
// ==========================================
app.get('/api/events', async (req, res) => {
    try {
        // 1. Check Redis Cache First
        if (isRedisConnected) {
            const cachedEvents = await redisClient.get('events_cache');
            if (cachedEvents) return res.json(JSON.parse(cachedEvents)); // ⚡ Super fast return
        }

        // 2. Fetch from DB if Cache is empty
        const events = await Event.find().sort({ startDate: 1 }).lean(); 

        // 3. Save to Cache for 1 Hour (3600 seconds)
        if (isRedisConnected) {
            await redisClient.setEx('events_cache', 3600, JSON.stringify(events));
        }

        res.json(events);
    } catch (err) {
        res.status(500).json({ error: "Failed to load events" });
    }
});

app.get('/api/events/:eventId/timeslots-availability', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({error: "Date required"});
    const event = await Event.findById(req.params.eventId).select('capacity timeSlots').lean();
    if (!event) return res.status(404).json({error: "Event not found"});

    const slotsData = [];
    for (let slot of event.timeSlots) {
        const soldForSlot = await Seat.countDocuments({ eventId: req.params.eventId, bookingDate: date, timeSlot: slot });
        slotsData.push({ time: slot, capacity: event.capacity, sold: soldForSlot, available: event.capacity - soldForSlot });
    }
    res.json(slotsData);
});

app.get('/api/events/:eventId/availability', async (req, res) => {
    const { date, timeSlot } = req.query;
    if (!date || !timeSlot) return res.status(400).json({error: "Required"});
    const event = await Event.findById(req.params.eventId).select('capacity').lean();
    const sold = await Seat.countDocuments({ eventId: req.params.eventId, bookingDate: date, timeSlot });
    res.json({ capacity: event.capacity, sold, available: event.capacity - sold });
});

app.get('/api/seats/:eventId', async (req, res) => {
    const { date, timeSlot } = req.query;
    const event = await Event.findById(req.params.eventId).select('capacity').lean();
    const bookedSeats = await Seat.find({ eventId: req.params.eventId, bookingDate: date, timeSlot }).select('seatId').lean();
    const bookedSeatIds = bookedSeats.map(s => s.seatId);
    
    const allSeats = [];
    for(let i=1; i<=event.capacity; i++) allSeats.push({ seatId: `S${i}`, status: bookedSeatIds.includes(`S${i}`) ? 'Booked' : 'Available' });
    res.json(allSeats);
});

// ==========================================
// 🛒 CORE BOOKING LOGIC (CACHE INVALIDATION)
// ==========================================
app.post('/api/events/book-seats', verifyActiveUser, async (req, res) => {
    const { eventId, seats, selectedDate, timeSlot } = req.body; 
    try {
        const event = await Event.findById(eventId);
        const seatsToInsert = seats.map(seatId => ({ eventId, seatId, bookingDate: selectedDate, timeSlot, status: 'Booked', bookedBy: req.session.username, userId: req.session.userId }));
        await Seat.insertMany(seatsToInsert, { ordered: true });
        event.ticketsSold += seats.length; await event.save();
        
        clearEventsCache(); // 🚨 Invalidate cache so new ticketsSold counts show on frontend
        io.emit('seatUpdate', { eventId, date: selectedDate, timeSlot }); io.emit('dashboardUpdate'); 
        res.json({ success: true, message: `Successfully booked ${seats.length} seat(s)!` });
    } catch (err) { res.status(400).json({ success: false, message: "Seat snatched! Please refresh." }); }
});

app.post('/api/events/book-general', verifyActiveUser, async (req, res) => {
    const { eventId, qty, selectedDate, timeSlot } = req.body;
    try {
        const event = await Event.findById(eventId);
        const currentSold = await Seat.countDocuments({ eventId, bookingDate: selectedDate, timeSlot });
        if (currentSold + Number(qty) > event.capacity) return res.status(400).json({ success: false, message: "Not enough tickets." });

        const tickets = Array.from({length: Number(qty)}).map((_, i) => ({
            eventId: event._id, seatId: `GA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${i+1}`, bookingDate: selectedDate, timeSlot, status: 'Booked', bookedBy: req.session.username, userId: req.session.userId 
        }));
        await Seat.insertMany(tickets);
        event.ticketsSold += Number(qty); await event.save();

        clearEventsCache(); // 🚨 Invalidate Cache
        io.emit('seatUpdate', { eventId, date: selectedDate, timeSlot }); io.emit('dashboardUpdate'); 
        res.json({ success: true, message: `Successfully booked ${qty} ticket(s)!` });
    } catch (err) { res.status(500).json({ success: false, message: "Booking error." }); }
});

app.get('/api/my-tickets', verifyActiveUser, async (req, res) => {
    const mySeats = await Seat.find({ $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }] }).populate('eventId', '-imageUrl').lean();
    res.json(mySeats.filter(s => s.eventId).map(seat => ({ eventId: seat.eventId._id, eventTitle: seat.eventId.title, bookingDate: seat.bookingDate, timeSlot: seat.timeSlot, location: seat.eventId.location, eventType: seat.eventId.eventType, price: seat.eventId.price || 0, seatId: seat.seatId })));
});

app.post('/api/events/cancel-booking', verifyActiveUser, async (req, res) => {
    try {
        const { eventId, seatId, bookingDate, timeSlot } = req.body;
        const result = await Seat.findOneAndDelete({ eventId, seatId, bookingDate, timeSlot, $or: [{ userId: req.session.userId }, { bookedBy: req.session.username }] });
        if (result) {
            const event = await Event.findById(eventId); event.ticketsSold = Math.max(0, event.ticketsSold - 1); await event.save();
            clearEventsCache(); // 🚨 Invalidate Cache
            io.emit('seatUpdate', { eventId, date: bookingDate, timeSlot }); io.emit('dashboardUpdate');
            res.json({ success: true, message: "Cancelled." });
        } else res.status(400).json({ success: false, message: "Ticket not found." });
    } catch (err) { res.status(500).json({ success: false, message: "Error cancelling." }); }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
    const usersCount = await User.countDocuments(); const events = await Event.find().select('title eventType ticketsSold capacity price').lean();
    let totalRev = 0; let totalSold = 0; let eventStats = events.map(e => { const rev = e.ticketsSold * e.price; totalSold += e.ticketsSold; totalRev += rev; return { title: e.title, type: e.eventType, ticketsSold: e.ticketsSold, capacity: e.capacity, revenue: rev }; });
    res.json({ success: true, totalUsers: usersCount, totalEvents: events.length, totalTicketsSold: totalSold, totalRevenue: totalRev, eventStats: eventStats.sort((a, b) => b.revenue - a.revenue) });
});

app.get('/api/admin/events', requireAdmin, async (req, res) => { res.json(await Event.find().sort({ startDate: -1 }).lean()); });
app.get('/api/admin/users', requireAdmin, async (req, res) => { res.json(await User.find().select('-password').lean()); });

app.post('/api/admin/events', requireAdmin, async (req, res) => {
    try {
        let p = req.body; p.timeSlots = p.timeSlots ? p.timeSlots.split(',').map(s => s.trim()).filter(s => s) : ["12:00 PM"];
        await Event.create(p); clearEventsCache(); io.emit('eventUpdate'); io.emit('dashboardUpdate'); res.json({ success: true, message: "Created!" });
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

app.put('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try { 
        let p = { ...req.body }; if (typeof p.timeSlots === 'string') p.timeSlots = p.timeSlots.split(',').map(s => s.trim()).filter(s => s);
        await Event.findByIdAndUpdate(req.params.id, p); clearEventsCache(); io.emit('eventUpdate'); io.emit('dashboardUpdate'); res.json({ success: true, message: "Updated." }); 
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
    try { await Event.findByIdAndDelete(req.params.id); await Seat.deleteMany({ eventId: req.params.id }); clearEventsCache(); io.emit('eventUpdate'); io.emit('dashboardUpdate'); res.json({ success: true, message: "Deleted." }); } 
    catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userSeats = await Seat.find({ userId: req.params.id });
        if (userSeats.length > 0) {
            const eventCounts = {}; userSeats.forEach(s => { eventCounts[s.eventId] = (eventCounts[s.eventId] || 0) + 1; });
            for (const eid in eventCounts) { await Event.findByIdAndUpdate(eid, { $inc: { ticketsSold: -eventCounts[eid] } }); io.emit('eventUpdate'); }
            await Seat.deleteMany({ userId: req.params.id }); clearEventsCache();
        }
        await User.findByIdAndDelete(req.params.id); io.emit('dashboardUpdate'); io.emit('eventUpdate'); res.json({ success: true, message: "Deleted." });
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT} bound to 0.0.0.0`); });