const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    location: { type: String, required: true },
    description: { type: String, default: '' },
    ageLimit: { type: Number, default: 0 }, 
    eventType: { type: String, enum: ['Seated', 'General'], required: true },
    category: { type: String, enum: ['Movie', 'Concert', 'Sports', 'Theater'], default: 'Movie' },
    capacity: { type: Number, required: true },
    price: { type: Number, required: true, default: 0 }, 
    imageUrl: { type: String, default: '' }, 
    ticketsSold: { type: Number, default: 0 }, 
    
    // 🚨 NEW: Array of time slots (e.g., ["09:40 AM", "12:50 PM", "06:30 PM"])
    timeSlots: [{ type: String }], 
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);
