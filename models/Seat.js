const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true }, 
    bookingDate: { type: String, required: true }, 
    timeSlot: { type: String, required: true }, // 🚨 FIXED: Added Time Slot requirement for seats
    status: { type: String, enum: ['Available', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

// 🚨 FIXED: Compound Index now allows the SAME seat on the SAME date to be booked at DIFFERENT times
seatSchema.index({ eventId: 1, seatId: 1, bookingDate: 1, timeSlot: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
