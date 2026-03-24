const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    // FOREIGN KEYS: 'ref' tells Mongoose that this ObjectId belongs to another collection. 
    // This allows us to link a Seat directly to a specific Event and User.
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    seatId: { type: String, required: true }, 
    status: { type: String, enum: ['Available', 'Booked'], default: 'Available' },
    bookedBy: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

// Compound Index: Ensures that for any given Event, a specific Seat ID (like "A1") can only exist once.
seatSchema.index({ eventId: 1, seatId: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);