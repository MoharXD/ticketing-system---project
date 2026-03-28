const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true }, 
    bookingDate: { type: String, required: true }, // NEW: Crucial for allowing multi-day bookings
    status: { type: String, enum: ['Available', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

// COMPOUND INDEX: Guarantees that a Seat ID can only be booked ONCE per Event per DATE.
seatSchema.index({ eventId: 1, seatId: 1, bookingDate: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
