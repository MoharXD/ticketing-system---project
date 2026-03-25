const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    // FOREIGN KEYS: 'ref' links this Seat document to a specific Event document.
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true }, 
    status: { type: String, enum: ['Available', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

// COMPOUND INDEX: This is a critical database constraint. 
// It guarantees that for any specific Event ID, a Seat ID (like "A1") can only exist ONE time in the database.
seatSchema.index({ eventId: 1, seatId: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
