const eventForm = document.getElementById('event-form');
const eventIdInput = document.getElementById('event-id');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('event-submit-btn');
const cancelBtn = document.getElementById('event-cancel-btn');

window.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch('/api/check-session');
    const data = await res.json();
    
    if (!data.loggedIn || !data.isAdmin) {
        alert("Access Denied. Please log in as an Admin.");
        window.location.href = 'admin-login.html';
        return;
    }

    // 🧹 Cleanup: JavaScript injection logic for CBFC dropdown is removed 
    // because the consolidated dropdown is now handled directly in the HTML file.

    loadAnalytics();
    loadEvents();
    loadUsers();
});

// ==========================================
// 🎨 SMART THEME EXTRACTOR & FILE UPLOAD
// ==========================================
const hexToRgbA = (hex, alpha) => {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    }
    return `rgba(226, 55, 68, ${alpha})`; 
};

// Reusable function to extract dominant color from an image source (URL or Base64)
const updateThemeColorFromImage = (imgSrc) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Crucial to prevent CORS "tainted canvas" security blocks for external URLs
    img.src = imgSrc;

    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        try {
            ctx.drawImage(img, 0, 0, img.width, img.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            let r = 0, g = 0, b = 0, count = 0;
            
            // Sample every 4th pixel to speed up processing
            for (let i = 0; i < imgData.length; i += 16) {
                const pr = imgData[i], pg = imgData[i+1], pb = imgData[i+2], pa = imgData[i+3];
                
                // Skip transparent pixels
                if (pa < 255) continue;
                // Skip too dark (blacks/shadows)
                if (pr < 30 && pg < 30 && pb < 30) continue;
                // Skip too bright (whites/glare)
                if (pr > 230 && pg > 230 && pb > 230) continue;

                r += pr; g += pg; b += pb; count++;
            }

            if (count > 0) {
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                
                // Convert RGB to HEX
                const hex = "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
                document.getElementById('event-theme').value = hex;
            }
        } catch (err) {
            console.warn("Smart Theme Extractor blocked by CORS or tainted canvas security. Using manual picker fallback.");
        }
    };
};

// Listen for direct URL input changes
document.getElementById('event-image').addEventListener('change', function(e) {
    if(e.target.value && !e.target.value.startsWith('data:image')) { // Don't trigger if it's base64 from upload
        updateThemeColorFromImage(e.target.value);
    }
});

// Listen for local file upload changes
document.getElementById('event-poster-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Use FileReader to convert local file to base64 string
    const reader = new FileReader();
    reader.onload = function(event) {
        const base64String = event.target.result;
        // Update the main 'event-image' input with the base64 string for saving to DB
        document.getElementById('event-image').value = base64String;
        
        // Run theme extractor on the newly loaded base64 data
        updateThemeColorFromImage(base64String);
    };
    reader.readAsDataURL(file);
});


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
            // Updated preview logic to handle both external URLs and long base64 strings cleanly
            let imgHtml = `<div style="width: 50px; height: 50px; background: ${e.themeColor || '#334155'}; border-radius: 8px; margin-right: 15px; display: inline-block;"></div>`;
            if (e.imageUrl) {
                imgHtml = `<img src="${e.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 15px; border: 2px solid ${e.themeColor || '#E23744'};">`;
            }
            
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
                        ${imgHtml}
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
        capacity: parseInt(document.getElementById('event-capacity').value),
        price: Number(document.getElementById('event-price').value),
        startDate: startInput ? new Date(startInput).toISOString() : null,
        endDate: endInput ? new Date(endInput).toISOString() : null,
        location: document.getElementById('event-location').value,
        description: document.getElementById('event-description').value,
        imageUrl: document.getElementById('event-image').value,
        themeColor: document.getElementById('event-theme').value 
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
    document.getElementById('event-capacity').value = eventData.capacity;
    document.getElementById('event-price').value = eventData.price || 0;
    document.getElementById('event-location').value = eventData.location;
    document.getElementById('event-description').value = eventData.description || '';
    
    // Fill the hidden text field with the URL/base64
    document.getElementById('event-image').value = eventData.imageUrl || ''; 
    // Clear the file upload input for security/UX
    document.getElementById('event-poster-file').value = ''; 
    
    document.getElementById('event-theme').value = eventData.themeColor || '#E23744'; 

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
    // Reset file upload specifically
    document.getElementById('event-poster-file').value = ''; 
    document.getElementById('event-theme').value = '#E23744';
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
