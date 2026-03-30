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
    timeSlots: [{ type: String }], // 🚨 FIXED: Added Time Slots Array
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);
