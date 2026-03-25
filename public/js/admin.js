// Caching elements
const eventForm = document.getElementById('event-form');
const eventIdInput = document.getElementById('event-id');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('event-submit-btn');
const cancelBtn = document.getElementById('event-cancel-btn');

// --- INITIALIZATION & SECURITY CHECK ---
window.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch('/api/check-session');
    const data = await res.json();
    
    // Client-side guard: Boot them to login if they bypassed the UI without an Admin session
    if (!data.loggedIn || !data.isAdmin) {
        alert("Access Denied. Please log in as an Admin.");
        window.location.href = 'admin-login.html';
        return;
    }

    // 🎬 DOM MUTATION: Swaps a plain text box for a strict Dropdown mapping to CBFC codes
    const ageInput = document.getElementById('event-age');
    if (ageInput && ageInput.tagName === 'INPUT') {
        const selectAge = document.createElement('select');
        selectAge.id = 'event-age';
        selectAge.className = 'form-select';
        selectAge.innerHTML = `
            <option value="0">U (Unrestricted / All Ages)</option>
            <option value="7">UA 7+ (Parental Guidance Advised)</option>
            <option value="13">UA 13+ (Parental Guidance Advised)</option>
            <option value="16">UA 16+ (Parental Guidance Advised)</option>
            <option value="18">A (Adults Only 18+)</option>
            <option value="99">S (Specialized Audience)</option>
        `;
        ageInput.parentNode.replaceChild(selectAge, ageInput);
    }

    loadAnalytics();
    loadEvents();
    loadUsers();
});

// --- ANALYTICS ENGINE ---
async function loadAnalytics() {
    try {
        const res = await fetch('/api/admin/analytics');
        const data = await res.json();
        
        if(data.success) {
            document.getElementById('stat-revenue').innerText = data.totalRevenue.toLocaleString();
            document.getElementById('stat-tickets').innerText = data.totalTicketsSold.toLocaleString();
            document.getElementById('stat-events').innerText = data.totalEvents.toLocaleString();
            document.getElementById('stat-users').innerText = data.totalUsers.toLocaleString();

            const tbody = document.getElementById('analytics-table-body');
            if (data.eventStats.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No events found.</td></tr>';
            } else {
                tbody.innerHTML = data.eventStats.map(e => {
                    // Calculates ratio, preventing NaN/Infinity errors if capacity is 0
                    const percent = e.capacity > 0 ? Math.round((e.ticketsSold / e.capacity) * 100) : 0;
                    
                    let barColor = 'bg-success';
                    if (percent < 30) barColor = 'bg-danger';
                    else if (percent < 70) barColor = 'bg-warning';

                    return `
                    <tr>
                        <td class="ps-4 fw-bold text-light">${e.title}</td>
                        <td><span class="badge bg-secondary">${e.type}</span></td>
                        <td style="width: 30%;">
                            <div class="d-flex justify-content-between small mb-1">
                                <span>${e.ticketsSold} / ${e.capacity}</span>
                                <span>${percent}%</span>
                            </div>
                            <div class="progress" style="height: 6px; background-color: #334155;">
                                <div class="progress-bar ${barColor}" role="progressbar" style="width: ${percent}%"></div>
                            </div>
                        </td>
                        <td class="text-end pe-4 fw-bold text-success">₹${e.revenue.toLocaleString()}</td>
                    </tr>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error("Error loading analytics:", err);
    }
}

// --- DATA FETCHING ---
async function loadEvents() {
    try {
        const res = await fetch('/api/admin/events');
        const events = await res.json();
        const tbody = document.getElementById('event-table-body');

        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No events found.</td></tr>';
            return;
        }

        tbody.innerHTML = events.map(e => {
            const imgPreview = e.imageUrl ? `<img src="${e.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 15px;">` : `<div style="width: 50px; height: 50px; background: #334155; border-radius: 8px; margin-right: 15px; display: inline-block;"></div>`;
            
            // Translates raw Database ints back into nice admin UI tags
            let ratingBadge = '';
            if(e.ageLimit === 0) ratingBadge = `<span class="badge bg-success ms-2">U</span>`;
            else if(e.ageLimit === 7) ratingBadge = `<span class="badge bg-info text-dark ms-2">UA 7+</span>`;
            else if(e.ageLimit === 13) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 13+</span>`;
            else if(e.ageLimit === 16) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 16+</span>`;
            else if(e.ageLimit === 18) ratingBadge = `<span class="badge bg-danger ms-2">A</span>`;
            else if(e.ageLimit === 99) ratingBadge = `<span class="badge bg-dark ms-2">S</span>`;

            return `
            <tr>
                <td class="fw-bold">
                    <div class="d-flex align-items-center">
                        ${imgPreview}
                        <div>${e.title} ${ratingBadge}</div>
                    </div>
                </td>
                <td>
                    <span class="badge bg-info text-dark">${e.eventType}</span><br>
                    <small class="text-success fw-bold">₹${e.price || 0}</small>
                </td>
                <td>
                    <small><strong>Start:</strong> ${new Date(e.startDate).toLocaleString()}</small><br>
                    <small><strong>End:</strong> ${new Date(e.endDate).toLocaleString()}</small>
                </td>
                <td class="text-end">
                    <button class="btn btn-primary btn-sm me-1" onclick='editEvent(${JSON.stringify(e).replace(/'/g, "&apos;")})'>Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEvent('${e._id}')">Delete</button>
                </td>
            </tr>
        `}).join('');
    } catch (err) {
        console.error("Error loading events:", err);
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('user-table-body');

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.username}</td>
                <td>${u.isAdmin ? '<span class="badge bg-warning text-dark">Admin</span>' : '<span class="badge bg-secondary">User</span>'}</td>
                <td class="text-end">
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteUser('${u._id}')">Remove</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Error loading users:", err);
    }
}

// --- FORM HANDLING (CREATE/UPDATE EVENT) ---
eventForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const eventId = eventIdInput.value;
    const isEditing = !!eventId; // Coerces the string ID into a Boolean true/false

    const startInput = document.getElementById('event-start').value;
    const endInput = document.getElementById('event-end').value;

    const payload = {
        title: document.getElementById('event-title').value,
        ageLimit: parseInt(document.getElementById('event-age').value), 
        eventType: document.getElementById('event-type').value,
        capacity: parseInt(document.getElementById('event-capacity').value),
        price: Number(document.getElementById('event-price').value),
        // Translates local time to Global Standard (ISO) before saving
        startDate: startInput ? new Date(startInput).toISOString() : null,
        endDate: endInput ? new Date(endInput).toISOString() : null,
        location: document.getElementById('event-location').value,
        description: document.getElementById('event-description').value,
        imageUrl: document.getElementById('event-image').value 
    };

    const endpoint = isEditing ? `/api/admin/events/${eventId}` : '/api/admin/events';
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const res = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        alert(data.message);
        if (data.success) {
            resetEventForm();
            loadEvents(); 
            loadAnalytics(); 
        }
    } catch (err) {
        alert("An error occurred while saving the event.");
    }
});

// --- DELETION LOGIC ---
window.deleteEvent = async function(id) {
    if (!confirm("Are you sure you want to delete this event? This will also delete all associated tickets!")) return;

    try {
        const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadEvents(); 
            loadAnalytics(); 
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Failed to delete event.");
    }
}

// --- UI STATE MANAGEMENT ---
window.editEvent = function(eventData) {
    eventIdInput.value = eventData._id;
    document.getElementById('event-title').value = eventData.title;
    document.getElementById('event-age').value = eventData.ageLimit || 0;
    document.getElementById('event-type').value = eventData.eventType;
    document.getElementById('event-capacity').value = eventData.capacity;
    document.getElementById('event-price').value = eventData.price || 0;
    document.getElementById('event-location').value = eventData.location;
    document.getElementById('event-description').value = eventData.description || '';
    document.getElementById('event-image').value = eventData.imageUrl || ''; 

    document.getElementById('event-start').value = formatForDateTimeLocal(eventData.startDate);
    document.getElementById('event-end').value = formatForDateTimeLocal(eventData.endDate);

    formTitle.innerText = "✏️ Edit Event";
    submitBtn.innerText = "Update Event";
    submitBtn.classList.replace('btn-success', 'btn-warning');
    cancelBtn.classList.remove('d-none');
    
    document.getElementById('event-type').disabled = false;
    document.getElementById('event-capacity').min = 1;

    eventForm.scrollIntoView({ behavior: 'smooth' });
}

// THE TIMEZONE FIX: Extracts the raw time and subtracts the exact offset of the user's specific country
function formatForDateTimeLocal(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

window.resetEventForm = function() {
    eventForm.reset();
    eventIdInput.value = '';
    formTitle.innerText = "Create New Event";
    submitBtn.innerText = "Save Event";
    submitBtn.classList.replace('btn-warning', 'btn-success');
    cancelBtn.classList.add('d-none');
}

window.deleteUser = async function(id) {
    if (!confirm("Are you sure you want to completely remove this user?")) return;

    try {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadUsers();
            loadAnalytics(); 
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert("Failed to delete user.");
    }
}

// ==========================================
// 🔴 GLOBAL WEBSOCKET LISTENER
// ==========================================
const socket = typeof io !== 'undefined' ? io() : null;

if (socket) {
    socket.on('dashboardUpdate', () => {
        console.log("Live Update Received! Refreshing Admin Dashboard...");
        loadAnalytics();
        loadEvents();
        loadUsers();
    });
}
