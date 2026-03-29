const eventForm = document.getElementById('event-form');
const eventIdInput = document.getElementById('event-id');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('event-submit-btn');
const cancelBtn = document.getElementById('event-cancel-btn');

window.addEventListener('DOMContentLoaded', async () => {
    // 🚨 FIX: Cache buster appended to ensure fresh session checks
    const res = await fetch(`/api/check-session?t=${Date.now()}`);
    const data = await res.json();
    
    if (!data.loggedIn || !data.isAdmin) {
        alert("Access Denied. Please log in as an Admin.");
        window.location.href = 'admin-login.html';
        return;
    }

    loadAnalytics();
    loadEvents();
    loadUsers();
});

document.getElementById('event-poster-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; 
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('event-image').value = compressedBase64;
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});


async function loadAnalytics() {
    try {
        // 🚨 FIX: Cache buster appended to load instantly
        const res = await fetch(`/api/admin/analytics?t=${Date.now()}`);
        const data = await res.json();
        
        if(data.success) {
            document.getElementById('stat-revenue').innerText = data.totalRevenue.toLocaleString();
            document.getElementById('stat-tickets').innerText = data.totalTicketsSold.toLocaleString();
            document.getElementById('stat-events').innerText = data.totalEvents.toLocaleString();
            document.getElementById('stat-users').innerText = data.totalUsers.toLocaleString();
        }
    } catch (err) {
        console.error("Error loading analytics:", err);
    }
}

async function loadEvents() {
    try {
        // 🚨 FIX: Cache buster appended to fetch new events bypassing disk cache
        const res = await fetch(`/api/admin/events?t=${Date.now()}`);
        const events = await res.json();
        const container = document.getElementById('event-list-container');

        if (events.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5 border rounded" style="border-color: #262626 !important; background-color: var(--surface-card);">No events found.</div>';
            return;
        }

        container.innerHTML = events.map(e => {
            const d = new Date(e.startDate);
            const dateStr = d.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
            const timeStr = d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
            
            const sold = e.ticketsSold || 0;
            const capacity = e.capacity || 0;
            const available = Math.max(0, capacity - sold);
            const percent = capacity > 0 ? Math.round((sold / capacity) * 100) : 0;
            
            let imgHtml = '';
            if (e.imageUrl) {
                imgHtml = `<img src="${e.imageUrl}" class="admin-event-img border" style="border-color: #262626 !important;">`;
            } else {
                const icon = e.eventType === 'Seated' ? '💺' : '🎫';
                imgHtml = `<div class="admin-event-img border" style="border-color: #262626 !important; background-color: rgba(255,255,255,0.05);">${icon}</div>`;
            }

            let badgeClass = e.eventType === 'Seated' ? 'bg-info text-dark' : 'bg-warning text-dark';
            
            let ratingBadge = '';
            if(e.ageLimit === 0) ratingBadge = `<span class="badge bg-success ms-2">U</span>`;
            else if(e.ageLimit === 7) ratingBadge = `<span class="badge bg-info text-dark ms-2">UA 7+</span>`;
            else if(e.ageLimit === 13) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 13+</span>`;
            else if(e.ageLimit === 16) ratingBadge = `<span class="badge bg-warning text-dark ms-2">UA 16+</span>`;
            else if(e.ageLimit === 18) ratingBadge = `<span class="badge bg-danger ms-2">A</span>`;
            else if(e.ageLimit === 99) ratingBadge = `<span class="badge bg-dark ms-2">S</span>`;

            let catColor = 'bg-secondary text-white';
            if (e.category === 'Movie') catColor = 'bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25';
            else if (e.category === 'Concert') catColor = 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25';
            else if (e.category === 'Sports') catColor = 'bg-success bg-opacity-25 text-success border border-success border-opacity-25';
            else if (e.category === 'Theater') catColor = 'bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25';
            
            let catBadge = e.category ? `<span class="badge ${catColor} ms-3 rounded-pill" style="font-size: 10px; padding: 4px 10px; letter-spacing: 0.5px;">${e.category}</span>` : '';

            return `
            <div class="admin-event-row rounded mb-2">
                
                <div class="d-flex align-items-center flex-grow-1">
                    ${imgHtml}
                    <div class="ms-3">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <h6 class="fw-bold mb-0 text-white" style="font-size: 15px;">${e.title} ${ratingBadge} ${catBadge}</h6>
                            <span class="badge ${badgeClass} rounded-pill" style="font-size: 10px; padding: 4px 8px; letter-spacing: 0.5px;">${e.eventType}</span>
                        </div>
                        <div class="text-muted mb-1" style="font-size: 13px;">${e.location}</div>
                        <div class="text-muted" style="font-size: 13px;">${dateStr} • ${timeStr}</div>
                    </div>
                </div>
                
                <div class="d-flex align-items-center justify-content-end gap-4 pe-4 border-end border-secondary border-opacity-25" style="min-width: 250px;">
                    <div class="admin-event-stat">
                        <span class="admin-stat-num text-white">${sold}</span>
                        <span class="admin-stat-label">Sold</span>
                    </div>
                    <div class="admin-event-stat">
                        <span class="admin-stat-num text-success">${available}</span>
                        <span class="admin-stat-label">Available</span>
                    </div>
                    <div class="admin-event-stat" style="width: 50px;">
                        <span class="fw-bold text-white mb-1" style="font-size: 11px;">${percent}%</span>
                        <div class="progress w-100" style="height: 4px; background-color: #262626;">
                            <div class="progress-bar bg-danger" role="progressbar" style="width: ${percent}%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="ps-4 text-center" style="min-width: 50px;">
                    <div class="dropdown">
                        <button class="btn btn-link text-muted p-0 text-decoration-none fs-5" data-bs-toggle="dropdown" aria-expanded="false">⋮</button>
                        <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-lg" style="border-color: #262626;">
                            <li><button class="dropdown-item fw-bold text-white py-2" onclick='editEvent(${JSON.stringify(e).replace(/'/g, "&apos;")})'>✏️ Edit Event</button></li>
                            <li><hr class="dropdown-divider border-secondary opacity-25 my-1"></li>
                            <li><button class="dropdown-item text-danger fw-bold py-2" onclick="deleteEvent('${e._id}')">🗑️ Delete Event</button></li>
                        </ul>
                    </div>
                </div>
                
            </div>
            `
        }).join('');
    } catch (err) {
        console.error("Error loading events:", err);
    }
}

async function loadUsers() {
    try {
        // 🚨 FIX: Cache buster appended to force real-time user refresh
        const res = await fetch(`/api/admin/users?t=${Date.now()}`);
        const users = await res.json();
        const tbody = document.getElementById('user-table-body');

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td class="ps-4">${u.username}</td>
                <td>${u.isAdmin ? '<span class="badge bg-warning text-dark">Admin</span>' : '<span class="badge bg-secondary">User</span>'}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-outline-danger btn-sm fw-bold" onclick="deleteUser('${u._id}')">Remove</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Error loading users:", err);
    }
}

eventForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const eventId = eventIdInput.value;
    const isEditing = !!eventId; 

    const startInput = document.getElementById('event-start').value;
    const endInput = document.getElementById('event-end').value;

    const payload = {
        title: document.getElementById('event-title').value,
        ageLimit: parseInt(document.getElementById('event-age').value), 
        eventType: document.getElementById('event-type').value,
        category: document.getElementById('event-category').value, 
        capacity: parseInt(document.getElementById('event-capacity').value),
        price: Number(document.getElementById('event-price').value),
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

window.editEvent = function(eventData) {
    eventIdInput.value = eventData._id;
    document.getElementById('event-title').value = eventData.title;
    document.getElementById('event-age').value = eventData.ageLimit || 0;
    document.getElementById('event-type').value = eventData.eventType;
    document.getElementById('event-category').value = eventData.category || 'Movie'; 
    document.getElementById('event-capacity').value = eventData.capacity;
    document.getElementById('event-price').value = eventData.price || 0;
    document.getElementById('event-location').value = eventData.location;
    document.getElementById('event-description').value = eventData.description || '';
    
    document.getElementById('event-image').value = eventData.imageUrl || ''; 
    document.getElementById('event-poster-file').value = ''; 

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

function formatForDateTimeLocal(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

window.resetEventForm = function() {
    eventForm.reset();
    eventIdInput.value = '';
    
    document.getElementById('event-image').value = ''; 
    document.getElementById('event-poster-file').value = ''; 
    document.getElementById('event-category').value = 'Movie'; 
    
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

const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
    socket.on('dashboardUpdate', () => {
        loadAnalytics();
        loadEvents();
        loadUsers();
    });
}