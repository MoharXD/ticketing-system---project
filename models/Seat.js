const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true }, 
    bookingDate: { type: String, required: true }, 
    
    // 🚨 NEW: Seats are now bound to a specific time slot
    timeSlot: { type: String, required: true }, 
    
    status: { type: String, enum: ['Available', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

// 🚨 CRITICAL: Compound Index updated. A seat can only be booked ONCE per Event per Date per TIME.
seatSchema.index({ eventId: 1, seatId: 1, bookingDate: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
