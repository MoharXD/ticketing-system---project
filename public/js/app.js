const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const toggleAuth = document.getElementById('toggle-auth');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

const authSection = document.getElementById('auth-section');
const bookingSection = document.getElementById('booking-section');
const profileSection = document.getElementById('profile-section');
const ticketsSection = document.getElementById('tickets-section');
const userDisplay = document.getElementById('user-display');
const usernameBadge = document.getElementById('username-badge');

const actionSection = document.getElementById('action-section');
const seatedView = document.getElementById('seated-view');
const generalView = document.getElementById('general-view');
const seatMap = document.getElementById('seat-map');
const searchBar = document.getElementById('event-search-bar'); 
const homeLogo = document.getElementById('home-logo'); 
const initialLoader = document.getElementById('initial-loader'); 

let isLoginMode = true;
let currentEventId = null;
let currentEventPrice = 0; 
let currentEventType = null;
let currentSelectedDate = null; 
let allEvents = []; 

function hexToRgbA(hex, alpha) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    }
    return `rgba(226, 55, 68, ${alpha})`; 
}

function resetGlobalTheme() {
    document.documentElement.style.setProperty('--brand-primary', '#E23744');
    document.documentElement.style.setProperty('--brand-glow', 'rgba(226, 55, 68, 0.35)');
    document.documentElement.style.setProperty('--brand-glow-light', 'rgba(226, 55, 68, 0.15)');
}

// === BULLETPROOF TIMEZONE DATE UTILS ===

// Custom function instead of toISOString() to prevent UTC timezone shifts
function formatLocalYYYYMMDD(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDatesInRange(startDate, endDate) {
    const dates = [];
    
    let curr = new Date(startDate);
    curr.setHours(0,0,0,0);
    
    let end = new Date(endDate);
    end.setHours(0,0,0,0);

    let today = new Date();
    today.setHours(0,0,0,0);

    // If the event started in the past, skip to Today
    if (curr < today) {
        curr = new Date(today.getTime());
    }
    
    while(curr <= end) {
        dates.push(new Date(curr.getTime()));
        curr.setDate(curr.getDate() + 1);
    }
    return dates;
}

const socket = typeof io !== 'undefined' ? io() : null;

if (socket) {
    socket.on('seatUpdate', async (data) => {
        if (String(currentEventId) === String(data.eventId) && currentSelectedDate === data.date) {
            await loadEventDataForDate(currentSelectedDate, true); 
        }
    });
    socket.on('eventUpdate', async () => { await refreshGlobalEvents(); });
}

function handlePossibleForceLogout(data) {
    if (data.forceLogout) {
        alert("🚨 Session Terminated: " + data.message);
        document.getElementById('logout-btn').click();
        return true;
    }
    return false;
}

function checkEventExpirations() {
    const now = new Date();
    allEvents.forEach(e => {
        const isExpired = now > new Date(e.endDate);
        const btn = document.querySelector(`.select-event-btn[data-id="${e._id}"]`);

        if (isExpired && btn && !btn.disabled) {
            btn.disabled = true;
            btn.innerText = 'Event Ended';
            btn.classList.replace('btn-theme', 'btn-secondary');

            if (currentEventId === String(e._id)) {
                alert("⏳ Time's up! This event has officially ended and is no longer accepting bookings.");
                homeLogo.click(); 
            }
        }
    });
}
setInterval(checkEventExpirations, 10000);

async function refreshGlobalEvents() {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/events?t=${timestamp}`);
        if (!res.ok) throw new Error("Server not responding correctly");
        allEvents = await res.json(); 
        checkEventExpirations(); 
    } catch(err) { console.error("Live sync failed", err); }
}

if (homeLogo) {
    homeLogo.addEventListener('click', (e) => {
        e.preventDefault();
        resetGlobalTheme(); 
        if (authSection.classList.contains('d-none')) {
            profileSection.classList.add('d-none');
            ticketsSection.classList.add('d-none');
            actionSection.classList.add('d-none'); 
            bookingSection.classList.remove('d-none'); 
            
            if (searchBar) { searchBar.value = ''; displayEvents(allEvents); }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

toggleAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Login' : 'Sign Up';
    authBtn.innerText = isLoginMode ? 'Login' : 'Sign Up';
    toggleAuth.innerText = isLoginMode ? 'Need an account? Sign up here.' : 'Already have an account? Login here.';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
        });
        const data = await res.json();
        
        if (data.success) {
            if (isLoginMode) showBookingScreen(data.username, data.isAdmin);
            else {
                alert(data.message);
                isLoginMode = true; authTitle.innerText = 'Login'; authBtn.innerText = 'Login';
                toggleAuth.innerText = 'Need an account? Sign up here.'; passwordInput.value = '';
            }
        } else {
            if (data.notFound && isLoginMode) { if (confirm(data.message)) toggleAuth.click(); } 
            else alert(data.message || 'Error occurred');
        }
    } catch (err) { alert("Server error. Please try again."); }
});

function showBookingScreen(username, isAdmin = false) {
    authSection.classList.add('d-none'); profileSection.classList.add('d-none'); 
    ticketsSection.classList.add('d-none'); bookingSection.classList.remove('d-none');
    userDisplay.classList.remove('d-none'); usernameBadge.innerText = username;
    
    if (isAdmin && !document.getElementById('admin-btn')) {
        const adminLink = document.createElement('a'); adminLink.id = 'admin-btn';
        adminLink.href = 'admin.html'; adminLink.className = 'btn btn-warning btn-sm ms-3 fw-bold';
        adminLink.innerText = '🛠 Admin Panel'; userDisplay.insertBefore(adminLink, document.getElementById('logout-btn'));
    }
    renderEvents(); 
}

async function renderEvents() {
    try { await refreshGlobalEvents(); displayEvents(allEvents); } 
    catch (err) { console.error("Error loading events:", err); }
}

if (searchBar) {
    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredEvents = allEvents.filter(ev => 
            ev.title.toLowerCase().includes(searchTerm) || ev.location.toLowerCase().includes(searchTerm) || ev.description.toLowerCase().includes(searchTerm)
        );
        displayEvents(filteredEvents);
    });
}

function getRatingBadge(age) {
    if (age === 0) return `<span class="badge bg-success ms-2">U</span>`;
    if (age === 7) return `<span class="badge bg-info text-dark ms-2">UA 7+</span>`;
    if (age === 13) return `<span class="badge bg-warning text-dark ms-2">UA 13+</span>`;
    if (age === 16) return `<span class="badge bg-warning text-dark ms-2">UA 16+</span>`;
    if (age === 18) return `<span class="badge bg-danger ms-2">A</span>`;
    if (age === 99) return `<span class="badge bg-dark ms-2">S</span>`;
    return '';
}

function displayEvents(events) {
    const container = document.getElementById('events-container');
    if (events.length === 0) {
        container.innerHTML = '<div class="col-12"><p class="text-muted text-center fs-5 mt-4">No events found matching your search.</p></div>';
        return;
    }

    const now = new Date();
    container.innerHTML = events.map(e => {
        const priceText = `<span class="badge bg-success ms-2 fs-6">₹${e.price || 0}</span>`; 
        const ratingBadge = getRatingBadge(e.ageLimit); 
        const imgHtml = e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img" alt="${e.title}">` : '';
        const safeTheme = e.themeColor || '#E23744'; 
        const isExpired = now > new Date(e.endDate);
        
        const btnHtml = isExpired 
            ? `<button class="btn btn-secondary w-100 fw-bold mt-auto select-event-btn py-2" disabled data-id="${e._id}">Event Ended</button>`
            : `<button class="btn btn-theme w-100 fw-bold mt-auto select-event-btn py-2" 
                data-id="${e._id}" data-title="${e.title}" data-age="${e.ageLimit || 0}"
                data-type="${e.eventType}" data-price="${e.price || 0}" data-theme="${safeTheme}" 
                data-start="${e.startDate}" data-end="${e.endDate}">Select Event Dates</button>`;

        return `
        <div class="col-md-6 col-lg-6 mb-4">
            <div class="card bg-white shadow-sm border-0 h-100 event-card" style="--card-theme: ${safeTheme};">
                ${imgHtml} 
                <div class="card-body d-flex flex-column p-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 class="card-title fw-bold text-dark mb-0">${e.title} ${priceText} ${ratingBadge}</h4> 
                    </div>
                    <p class="card-text text-muted mb-3 fs-6">📍 <span class="fw-medium">${e.location}</span></p>
                    <div class="bg-light p-3 rounded-3 mb-3">
                        <p class="card-text small mb-1"><strong class="text-secondary">Start:</strong> ${new Date(e.startDate).toLocaleString()}</p>
                        <p class="card-text small mb-0"><strong class="text-secondary">End:</strong> ${new Date(e.endDate).toLocaleString()}</p>
                    </div>
                    <p class="card-text text-secondary small mb-4 flex-grow-1">${e.description || "No description provided."}</p>
                    ${btnHtml}
                </div>
            </div>
        </div>
    `}).join('');
}

document.getElementById('events-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('select-event-btn') && !e.target.disabled) {
        
        const activeTheme = e.target.getAttribute('data-theme');
        document.documentElement.style.setProperty('--brand-primary', activeTheme);
        document.documentElement.style.setProperty('--brand-glow', hexToRgbA(activeTheme, 0.35));
        document.documentElement.style.setProperty('--brand-glow-light', hexToRgbA(activeTheme, 0.15));

        const eventId = e.target.getAttribute('data-id');
        const title = e.target.getAttribute('data-title');
        const requiredAge = parseInt(e.target.getAttribute('data-age'));
        
        currentEventType = e.target.getAttribute('data-type');
        currentEventPrice = parseFloat(e.target.getAttribute('data-price')); 
        const eventStart = e.target.getAttribute('data-start');
        const eventEnd = e.target.getAttribute('data-end');

        if (requiredAge === 99) {
            alert(`⚠️ Specialized Audience (S)\n\nThis event is restricted to specific professionals (e.g., doctors, scientists). Relevant ID/credentials will be required at the venue.`);
        } else if (requiredAge > 0) {
            const timestamp = new Date().getTime();
            const res = await fetch(`/api/profile?t=${timestamp}`);
            const data = await res.json();
            if (handlePossibleForceLogout(data)) return; 

            if (!data.user.dob) {
                alert(`⚠️ Age Verification Required.\n\nYou must update your Profile with your Date of Birth before booking this event.`);
                document.getElementById('profile-link').click(); return;
            }
            const userAge = calculateAge(data.user.dob);
            if (userAge < requiredAge) {
                if (requiredAge === 18) { alert(`🛑 Access Denied!\n\nYou are ${userAge} years old. This is an 'A' rated event strictly for adults (18+).`); return; } 
                else { const proceed = confirm(`⚠️ Parental Guidance Advised\n\nYou are ${userAge} years old. This event is rated UA ${requiredAge}+. \n\nDo you have parental permission to book this event?`); if (!proceed) return; }
            }
        }

        currentEventId = eventId;
        actionSection.classList.remove('d-none');
        document.getElementById('selected-event-title').innerText = title; 
        
        seatedView.classList.add('d-none');
        generalView.classList.add('d-none');
        
        // --- RENDER DYNAMIC DISTRICT DATE PILLS ---
        const dates = getDatesInRange(eventStart, eventEnd);
        const datesContainer = document.getElementById('date-pills');
        document.getElementById('date-selection-container').classList.remove('d-none');
        
        if (dates.length === 0) {
            datesContainer.innerHTML = '<p class="text-danger w-100 text-center fw-bold mt-2">No upcoming dates available. Event has ended.</p>';
        } else {
            // Strict Timezone Matching
            let today = new Date(); 
            today.setHours(0,0,0,0);
            let tomorrow = new Date(today.getTime()); 
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const todayStr = formatLocalYYYYMMDD(today);
            const tomorrowStr = formatLocalYYYYMMDD(tomorrow);

            datesContainer.innerHTML = dates.map(d => {
                const dateStr = formatLocalYYYYMMDD(d);
                let line1 = ""; let line2 = "";

                if (dateStr === todayStr) {
                    line1 = "Today"; 
                    line2 = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
                } else if (dateStr === tomorrowStr) {
                    line1 = "Tomorrow"; 
                    line2 = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
                } else {
                    line1 = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                    line2 = d.toLocaleDateString('en-US', { weekday: 'short' });
                }

                return `<button class="district-date-pill" data-date="${dateStr}">
                            <span class="d-block fw-bold fs-5 mb-1 pe-none">${line1}</span>
                            <span class="d-block small pe-none">${line2}</span>
                        </button>`;
            }).join('');

            // Attach click listeners
            document.querySelectorAll('.district-date-pill').forEach(pill => {
                pill.addEventListener('click', async (btnEv) => {
                    const targetBtn = btnEv.target.closest('.district-date-pill');
                    document.querySelectorAll('.district-date-pill').forEach(p => p.classList.remove('active'));
                    targetBtn.classList.add('active');
                    
                    currentSelectedDate = targetBtn.getAttribute('data-date');
                    await loadEventDataForDate(currentSelectedDate, false);
                    
                    // Center the clicked pill horizontally if it's off-screen
                    targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                });
            });

            actionSection.scrollIntoView({ behavior: 'smooth' });
            document.querySelector('.district-date-pill').click();
        }
    }
});

// LOAD SPECIFIC DATA FOR SELECTED DATE
async function loadEventDataForDate(date, isSoftUpdate = false) {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/events/${currentEventId}/availability?date=${date}&t=${timestamp}`);
        const data = await res.json();
        const availableTickets = data.available;

        if (currentEventType === 'Seated') {
            generalView.classList.add('d-none');
            seatedView.classList.remove('d-none');
            if (isSoftUpdate) { await renderSeatsForEvent(currentEventId, date); } 
            else { document.getElementById('seated-total').innerText = '0'; await renderSeatsForEvent(currentEventId, date); }
        } else {
            seatedView.classList.add('d-none');
            generalView.classList.remove('d-none');
            
            const qtyInput = document.getElementById('general-qty');
            const bookBtn = document.getElementById('book-general-btn');
            
            document.getElementById('tickets-left').innerText = availableTickets;
            qtyInput.max = availableTickets;
            
            if (availableTickets <= 0) {
                qtyInput.value = 0; qtyInput.disabled = true; bookBtn.disabled = true;
                bookBtn.innerText = "Sold Out for this Day";
                document.getElementById('general-total').innerText = '0';
            } else {
                if(qtyInput.value == 0 || qtyInput.value > availableTickets) qtyInput.value = 1;
                qtyInput.disabled = false; bookBtn.disabled = false;
                bookBtn.innerText = "Secure Tickets Now";
                document.getElementById('general-total').innerText = (parseInt(qtyInput.value) * currentEventPrice); 
            }
        }
    } catch (err) { console.error("Error loading date data:", err); }
}

async function renderSeatsForEvent(eventId, date) {
    try {
        seatMap.innerHTML = '<p class="text-muted text-center">Loading seat layout for selected date...</p>';
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/seats/${eventId}?date=${date}&t=${timestamp}`);
        let seats = await res.json();
        
        seats.sort((a, b) => {
            let numA = parseInt(a.seatId.replace(/\D/g, ''));
            let numB = parseInt(b.seatId.replace(/\D/g, ''));
            return numA - numB;
        });

        const seatsPerRow = 14; 
        const halfRow = seatsPerRow / 2;
        let html = '<div class="d-flex flex-column align-items-center">';

        for (let i = 0; i < seats.length; i += seatsPerRow) {
            const rowSeats = seats.slice(i, i + seatsPerRow);
            const rowLetter = String.fromCharCode(65 + Math.floor(i / seatsPerRow)); 

            html += `<div class="d-flex align-items-center justify-content-center w-100 mb-2">`;
            html += `<div class="text-end me-4 fw-bold text-secondary" style="width: 20px; font-size: 14px;">${rowLetter}</div>`;

            for (let j = 0; j < rowSeats.length; j++) {
                if (j === halfRow) html += `<div style="width: 40px;"></div>`; 
                html += generateSeatHTML(rowSeats[j]);
            }
            html += `</div>`;
        }

        html += '</div>';
        seatMap.innerHTML = html;
        document.getElementById('book-seats-btn').disabled = document.querySelectorAll('.bms-seat.selected').length === 0;

    } catch (err) { console.error("Error loading seats:", err); }
}

function generateSeatHTML(seat) {
    let classes = 'bms-seat';
    if (seat.status === 'Available') classes += ' available';
    if (seat.status === 'Booked') classes += ' booked disabled';

    let displayNum = seat.seatId.replace(/\D/g, '');
    if (displayNum.length === 1) displayNum = '0' + displayNum; 
    return `<button class="${classes}" data-id="${seat.seatId}" title="Seat ${seat.seatId}">${displayNum}</button>`;
}

seatMap.addEventListener('click', (e) => {
    if (e.target.classList.contains('bms-seat') && e.target.classList.contains('available')) {
        e.target.classList.toggle('selected');
        const selectedCount = document.querySelectorAll('.bms-seat.selected').length;
        document.getElementById('book-seats-btn').disabled = selectedCount === 0;
        document.getElementById('seated-total').innerText = (selectedCount * currentEventPrice);
    }
});

document.getElementById('general-qty').addEventListener('input', (e) => {
    let val = e.target.value;
    if (val === '') { document.getElementById('general-total').innerText = '0'; return; }
    let qty = parseInt(val) || 0;
    const max = parseInt(e.target.max) || 0;
    if (qty > max) { qty = max; e.target.value = max; }
    document.getElementById('general-total').innerText = (qty * currentEventPrice);
});

document.getElementById('general-qty').addEventListener('blur', (e) => {
    const max = parseInt(e.target.max) || 0;
    if (max > 0 && (e.target.value === '' || parseInt(e.target.value) < 1)) {
        e.target.value = 1; document.getElementById('general-total').innerText = currentEventPrice;
    }
});

// BOOKING BUTTONS
document.getElementById('book-seats-btn').addEventListener('click', async (e) => {
    const selectedSeats = Array.from(document.querySelectorAll('.bms-seat.selected')).map(el => el.getAttribute('data-id'));
    if (selectedSeats.length === 0 || !currentSelectedDate) return;

    const btn = e.target;
    const originalText = btn.innerText; btn.innerText = 'Processing...'; btn.disabled = true;

    try {
        const res = await fetch('/api/events/book-seats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: currentEventId, seats: selectedSeats, selectedDate: currentSelectedDate })
        });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            document.getElementById('seated-total').innerText = '0'; 
            await renderSeatsForEvent(currentEventId, currentSelectedDate);
            setTimeout(() => alert(data.message), 10); 
        } else {
            await loadEventDataForDate(currentSelectedDate, true); 
            setTimeout(() => alert(data.message), 10);
        }
    } catch (err) { alert("Booking failed. Please check your internet connection.");
    } finally { btn.innerText = originalText; btn.disabled = document.querySelectorAll('.bms-seat.selected').length === 0; }
});

document.getElementById('book-general-btn').addEventListener('click', async (e) => {
    const qtyInput = document.getElementById('general-qty');
    const qty = parseInt(qtyInput.value); const max = parseInt(qtyInput.max);
    
    if (qty > max) { alert("You cannot book more than the available tickets!"); return; }
    if (!currentSelectedDate) { alert("Please select a date first."); return; }

    const btn = e.target; const originalText = btn.innerText; btn.innerText = 'Processing...'; btn.disabled = true;

    try {
        const res = await fetch('/api/events/book-general', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: currentEventId, qty: qty, selectedDate: currentSelectedDate })
        });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            qtyInput.value = 1; document.getElementById('general-total').innerText = currentEventPrice;
            await loadEventDataForDate(currentSelectedDate, true); 
            setTimeout(() => alert(data.message), 10);
        } else {
            await loadEventDataForDate(currentSelectedDate, true);
            setTimeout(() => alert(data.message), 10);
        }
    } catch (err) { alert("Booking failed.");
    } finally { btn.innerText = originalText; btn.disabled = false; }
});


document.getElementById('my-tickets-link').addEventListener('click', async (e) => {
    e.preventDefault();
    resetGlobalTheme();
    bookingSection.classList.add('d-none'); profileSection.classList.add('d-none'); actionSection.classList.add('d-none'); ticketsSection.classList.remove('d-none');
    const container = document.getElementById('my-tickets-container');
    container.innerHTML = '<p class="text-center text-muted">Loading your tickets...</p>';

    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/my-tickets?t=${timestamp}`);
        const tickets = await res.json();
        if (handlePossibleForceLogout(tickets)) return;

        if (tickets.length === 0) { container.innerHTML = '<p class="text-center text-muted fs-5">You have no booked tickets yet.</p>'; return; }

        container.innerHTML = tickets.map(t => `
            <div class="col-md-6 mb-4">
                <div class="card shadow-sm border-success border-start border-4 h-100 p-2">
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div class="pe-3">
                            <h5 class="fw-bold text-dark mb-1">${t.eventTitle}</h5>
                            <p class="text-muted small mb-2">📍 ${t.location}</p>
                            <p class="mb-1 small"><strong>Date:</strong> ${new Date(t.bookingDate).toLocaleDateString()}</p>
                            ${t.eventType === 'Seated' ? `<p class="mb-0 text-success fw-bold">Seat: ${t.seatId}</p>` : `<p class="mb-0 text-primary fw-bold">General Admission</p><p class="mb-0 text-muted small" style="font-size: 11px;">ID: ${t.seatId}</p>`}
                            <button class="btn btn-outline-danger btn-sm mt-3 fw-bold cancel-ticket-btn" data-eventid="${t.eventId}" data-seatid="${t.seatId}" data-date="${t.bookingDate}">Cancel Ticket</button>
                        </div>
                        <div class="qr-code-box bg-light p-2 rounded border shadow-sm" id="qr-${t.seatId}"></div>
                    </div>
                </div>
            </div>
        `).join('');

        tickets.forEach(t => {
            const qrContainer = document.getElementById(`qr-${t.seatId}`);
            if (qrContainer && typeof QRCode !== 'undefined') {
                const qrDataString = `TicketMaster Pro\nEvent: ${t.eventTitle}\nDate: ${new Date(t.bookingDate).toLocaleDateString()}\nSeat: ${t.seatId}`;
                new QRCode(qrContainer, { text: qrDataString, width: 90, height: 90, colorDark : "#0f172a", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
            }
        });
    } catch (err) { container.innerHTML = '<p class="text-danger text-center">Failed to load tickets.</p>'; }
});

document.getElementById('my-tickets-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('cancel-ticket-btn')) {
        const eventId = e.target.getAttribute('data-eventid');
        const seatId = e.target.getAttribute('data-seatid');
        const bookingDate = e.target.getAttribute('data-date'); 

        if (!confirm('Are you sure you want to cancel this ticket? It will be removed immediately.')) return;
        e.target.disabled = true; e.target.innerText = "Cancelling...";

        try {
            const res = await fetch('/api/events/cancel-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, seatId, bookingDate })
            });
            const data = await res.json();
            if (handlePossibleForceLogout(data)) return;

            if (data.success) document.getElementById('my-tickets-link').click(); 
            else { alert(data.message); e.target.disabled = false; e.target.innerText = "Cancel Ticket"; }
        } catch (err) { alert('Cancellation failed due to a network error.'); e.target.disabled = false; e.target.innerText = "Cancel Ticket"; }
    }
});

document.getElementById('back-to-booking-from-tickets').addEventListener('click', () => { ticketsSection.classList.add('d-none'); bookingSection.classList.remove('d-none'); });

function calculateAge(dobString) {
    if (!dobString) return '';
    const dob = new Date(dobString); const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs); 
    return Math.abs(ageDt.getUTCFullYear() - 1970);
}

const dobInput = document.getElementById('profile-dob');
const ageInput = document.getElementById('profile-age');
if(dobInput) dobInput.addEventListener('change', () => { ageInput.value = calculateAge(dobInput.value); });

document.getElementById('profile-link').addEventListener('click', async (e) => {
    e.preventDefault(); resetGlobalTheme(); document.getElementById('profile-alert').classList.add('d-none');
    bookingSection.classList.add('d-none'); ticketsSection.classList.add('d-none'); profileSection.classList.remove('d-none'); actionSection.classList.add('d-none');
    
    try {
        const timestamp = new Date().getTime(); const res = await fetch(`/api/profile?t=${timestamp}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            document.getElementById('profile-username').value = data.user.username;
            document.getElementById('profile-fullname').value = data.user.fullName || '';
            document.getElementById('profile-email').value = data.user.email || '';
            document.getElementById('profile-phone').value = data.user.phone || '';
            document.getElementById('profile-address').value = data.user.address || '';
            if (data.user.dob) {
                const dateString = new Date(data.user.dob).toISOString().split('T')[0];
                dobInput.value = dateString; ageInput.value = calculateAge(dateString);
            } else { dobInput.value = ''; ageInput.value = ''; }
        }
    } catch (err) { console.error("Failed to load profile data."); }
});

document.getElementById('back-to-booking').addEventListener('click', () => { profileSection.classList.add('d-none'); bookingSection.classList.remove('d-none'); });

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('profile-submit-btn'); const alertBox = document.getElementById('profile-alert');
    const newUsername = document.getElementById('profile-username').value.trim(); const fullName = document.getElementById('profile-fullname').value;
    const email = document.getElementById('profile-email').value; const phone = document.getElementById('profile-phone').value;
    const dob = document.getElementById('profile-dob').value; const address = document.getElementById('profile-address').value;

    submitBtn.disabled = true; submitBtn.innerText = "Saving..."; alertBox.classList.add('d-none'); 

    try {
        const res = await fetch('/api/profile', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername, fullName, email, phone, dob, address })
        });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;
        
        alertBox.classList.remove('d-none', 'alert-danger', 'alert-success');
        alertBox.classList.add(data.success ? 'alert-success' : 'alert-danger'); alertBox.innerText = data.message;
        
        if(data.success) {
            usernameBadge.innerText = data.newUsername || newUsername;
            setTimeout(() => {
                profileSection.classList.add('d-none'); bookingSection.classList.remove('d-none'); alertBox.classList.add('d-none');
                submitBtn.disabled = false; submitBtn.innerText = "Save Changes";
            }, 1500);
        } else { submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }
    } catch (err) {
        alertBox.classList.remove('d-none', 'alert-success'); alertBox.classList.add('alert-danger'); alertBox.innerText = "Network error. Failed to save.";
        submitBtn.disabled = false; submitBtn.innerText = "Save Changes";
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    bookingSection.classList.add('d-none'); profileSection.classList.add('d-none'); ticketsSection.classList.add('d-none');
    userDisplay.classList.add('d-none'); authSection.classList.remove('d-none'); actionSection.classList.add('d-none');
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    if (searchBar) searchBar.value = '';
    const adminBtn = document.getElementById('admin-btn'); if (adminBtn) adminBtn.remove();
});

(async function initializeApp() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); 
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/check-session?t=${timestamp}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Server returned an error while booting.");
        const data = await res.json();
        if (initialLoader) initialLoader.classList.add('d-none');
        if (data.loggedIn) showBookingScreen(data.username, data.isAdmin);
        else if (authSection) authSection.classList.remove('d-none');
    } catch (err) {
        console.error("Initialization caught by Cold Start handler or Timeout.", err);
        if (initialLoader) initialLoader.classList.add('d-none');
        if (authSection) authSection.classList.remove('d-none');
    }
})();
