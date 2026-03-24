const mongoose = require('mongoose');

// A Schema defines the structure of the document, default values, and validators.
const userSchema = new mongoose.Schema({
    // 'unique: true' creates a database index to prevent duplicate usernames automatically.
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Role-based access control. Defaults to false so standard users aren't admins.
    isAdmin: { type: Boolean, default: false },
    
    // Optional profile fields
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    dob: { type: Date, default: null },       
    address: { type: String, default: '' }    
});

module.exports = mongoose.model('User', userSchema);