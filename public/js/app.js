// ==========================================
// DOM ELEMENT CACHING
// ==========================================
// We store HTML elements in variables so JavaScript can manipulate them without having to search the document every time.
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const toggleAuth = document.getElementById('toggle-auth');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

const authSection = document.getElementById('auth-section');
const bookingSection = document.getElementById('booking-section');
// ... (Keep your other const declarations here)

let isLoginMode = true; // State variable to track if user is on Login or Signup screen
let currentEventId = null;
let currentEventPrice = 0; 
let allEvents = []; 

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

// Toggles the UI between Login and Signup mode
toggleAuth.addEventListener('click', (e) => {
    e.preventDefault(); // Prevents the link from reloading the page
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Login' : 'Sign Up';
    authBtn.innerText = isLoginMode ? 'Login' : 'Sign Up';
    toggleAuth.innerText = isLoginMode ? 'Need an account? Sign up here.' : 'Already have an account? Login here.';
});

// Handles Form Submission for Login/Signup
authForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    // NEW: Frontend Password Validation for Signups
    if (!isLoginMode && passwordInput.value.length < 6) {
        alert("Security requirement: Password must be at least 6 characters long.");
        return; // Stops the function from proceeding to the server
    }

    // Determine which API endpoint to hit based on the mode
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    
    try {
        // fetch() is an asynchronous API used to make HTTP requests to our Node.js server
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: usernameInput.value.trim(), 
                password: passwordInput.value 
            })
        });
        
        // Parse the JSON response from the server
        const data = await res.json();
        
        if (data.success) {
            if (isLoginMode) {
                // If login is successful, hide auth screen and show booking screen
                showBookingScreen(data.username, data.isAdmin);
            } else {
                // If signup is successful, switch them back to the login screen
                alert(data.message);
                toggleAuth.click(); 
                passwordInput.value = ''; // Clear password field for security
            }
        } else {
            alert(data.message || 'Error occurred');
        }
    } catch (err) {
        alert("Server error. Please try again.");
    }
});

// ==========================================
// DYNAMIC EVENT RENDERING
// ==========================================

// Fetches events from the database and passes them to the display function
async function renderEvents() {
    try {
        const res = await fetch('/api/events');
        allEvents = await res.json(); // Store locally for search filtering
        displayEvents(allEvents);
    } catch (err) {
        console.error("Error loading events:", err);
    }
}

// Maps over the array of event objects and injects them as HTML cards into the DOM
function displayEvents(events) {
    const container = document.getElementById('events-container');

    if (events.length === 0) {
        container.innerHTML = '<p class="text-muted text-center fs-5 mt-4">No events found.</p>';
        return;
    }

    // .map() transforms our array of JSON objects into a single giant string of HTML elements
    container.innerHTML = events.map(e => {
        const imgHtml = e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img">` : '';

        return `
        <div class="col-md-6 col-lg-6 mb-4">
            <div class="card event-card">
                ${imgHtml} 
                <div class="card-body">
                    <h4 class="card-title fw-bold">${e.title}</h4>
                    <button class="btn btn-outline-primary select-event-btn" 
                        data-id="${e._id}" 
                        data-age="${e.ageLimit || 0}"
                        data-price="${e.price || 0}">Select Event</button>
                </div>
            </div>
        </div>
    `}).join(''); // .join('') removes the commas between array items
}