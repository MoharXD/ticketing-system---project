const mongoose = require('mongoose'); // Imports the library used to interact with MongoDB

// A Schema is a blueprint. It tells the database exactly what a "User" should look like.
const userSchema = new mongoose.Schema({
    // 'unique: true' creates a database index. It asks MongoDB to automatically block duplicate usernames.
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Role-Based Access Control (RBAC). It defaults to false so normal signups don't become admins.
    isAdmin: { type: Boolean, default: false },
    
    // Optional profile fields for the user to fill out later
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    dob: { type: Date, default: null },       
    address: { type: String, default: '' }    
});

module.exports = mongoose.model('User', userSchema);
