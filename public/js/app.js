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
const guestDisplay = document.getElementById('guest-display');
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
let pendingPaymentData = null;
let paymentModalInstance = null;

let initialEventsPromise = fetch(`/api/events?t=${new Date().getTime()}`).then(res => res.ok ? res.json() : []).catch(() => []);

function formatLocalYYYYMMDD(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDatesInRange(startDate, endDate) {
    const dates = [];
    let curr = new Date(startDate); curr.setHours(0,0,0,0);
    let end = new Date(endDate); end.setHours(0,0,0,0);
    let today = new Date(); today.setHours(0,0,0,0);
    if (curr < today) curr = new Date(today.getTime());
    while(curr <= end) { dates.push(new Date(curr.getTime())); curr.setDate(curr.getDate() + 1); }
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
        const cardBtn = document.querySelector(`.event-card[data-id="${e._id}"]`);

        if (isExpired && cardBtn && !cardBtn.classList.contains('expired-card')) {
            cardBtn.classList.add('expired-card');
            const overlay = cardBtn.querySelector('.book-now-btn');
            if(overlay) { overlay.innerText = 'Ended'; overlay.classList.replace('btn-primary', 'btn-secondary'); }

            if (currentEventId === String(e._id)) {
                alert("⏳ Time's up! This event has officially ended.");
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
        if (authSection.classList.contains('d-none')) {
            profileSection.classList.add('d-none'); ticketsSection.classList.add('d-none');
            actionSection.classList.add('d-none'); bookingSection.classList.remove('d-none'); 
            if (searchBar) { searchBar.value = ''; displayEvents(allEvents); }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

document.getElementById('back-to-events').addEventListener('click', () => homeLogo.click());

toggleAuth.addEventListener('click', (e) => {
    e.preventDefault(); isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Sign In' : 'Create Account'; authBtn.innerText = isLoginMode ? 'Sign In' : 'Sign Up';
    toggleAuth.innerText = isLoginMode ? 'Need an account? Sign up.' : 'Already have an account? Sign in.';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    try {
        const res = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
        });
        const data = await res.json();
        
        if (data.success) {
            if (isLoginMode) showBookingScreen(data.username, data.isAdmin);
            else {
                alert(data.message); isLoginMode = true; authTitle.innerText = 'Sign In'; authBtn.innerText = 'Sign In';
                toggleAuth.innerText = 'Need an account? Sign up.'; passwordInput.value = '';
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
    guestDisplay.classList.add('d-none'); userDisplay.classList.remove('d-none'); 
    usernameBadge.innerText = username;
    
    if (isAdmin && !document.getElementById('admin-btn')) {
        const adminLink = document.createElement('a'); adminLink.id = 'admin-btn';
        adminLink.href = 'admin.html'; adminLink.className = 'text-warning text-decoration-none fw-bold small me-3';
        adminLink.innerText = 'Admin Panel'; userDisplay.insertBefore(adminLink, document.getElementById('my-tickets-link'));
    }
    renderEvents(); 
}

async function renderEvents() {
    try { 
        const container = document.getElementById('events-container');

        if (allEvents.length === 0) {
            container.innerHTML = Array(3).fill(`
                <div class="col-md-4 mb-4">
                    <div class="card border-0 h-100 overflow-hidden" aria-hidden="true">
                        <div class="placeholder-glow"><div class="placeholder w-100" style="height: 200px; background-color: #262626;"></div></div>
                        <div class="card-body p-4 placeholder-glow">
                            <h5 class="card-title placeholder-glow"><span class="placeholder col-8 bg-secondary"></span></h5>
                            <p class="card-text placeholder-glow"><span class="placeholder col-5 bg-secondary"></span></p>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        if (initialEventsPromise) {
            allEvents = await initialEventsPromise; initialEventsPromise = null; 
            checkEventExpirations(); displayEvents(allEvents);
        } else {
            await refreshGlobalEvents(); displayEvents(allEvents);
        }
    } catch (err) { console.error("Error loading events:", err); }
}

if (searchBar) {
    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredEvents = allEvents.filter(ev => 
            ev.title.toLowerCase().includes(searchTerm) || ev.location.toLowerCase().includes(searchTerm)
        );
        displayEvents(filteredEvents);
    });
}

function displayEvents(events) {
    const container = document.getElementById('events-container');
    if (events.length === 0) {
        container.innerHTML = '<div class="col-12"><p class="text-muted fs-5 mt-4">No events found matching your search.</p></div>';
        return;
    }

    const now = new Date();
    container.innerHTML = events.map(e => {
        const isExpired = now > new Date(e.endDate);
        const btnState = isExpired ? 'btn-secondary disabled' : 'btn-primary';
        const btnText = isExpired ? 'Ended' : 'Book Now';
        const imgHtml = e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img" alt="${e.title}">` : '<div class="event-card-img bg-dark"></div>';
        
        let typeColor = e.eventType === 'Seated' ? 'text-info' : 'text-warning';
        let typeIcon = e.eventType === 'Seated' ? '💺' : '🎫';

        return `
        <div class="col-md-4">
            <div class="card event-card h-100" data-id="${e._id}" data-title="${e.title}" data-age="${e.ageLimit || 0}" data-type="${e.eventType}" data-price="${e.price || 0}" data-start="${e.startDate}" data-end="${e.endDate}" data-loc="${e.location}" data-desc="${e.description}">
                <div class="position-relative p-2 pb-0">
                    ${imgHtml}
                    <span class="position-absolute top-0 start-0 m-3 badge bg-dark border border-secondary ${typeColor}">${typeIcon} ${e.eventType}</span>
                </div>
                <div class="card-body mt-2">
                    <h5 class="fw-bold mb-1">${e.title}</h5>
                    <p class="text-muted small mb-3 lh-sm" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${e.description}</p>
                    
                    <div class="d-flex flex-column gap-2 mb-4 small text-muted">
                        <div><span class="me-2">📅</span>${new Date(e.startDate).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</div>
                        <div><span class="me-2">📍</span>${e.location}</div>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-end mt-auto">
                        <div>
                            <span class="text-muted small d-block" style="font-size:10px;">Starting from</span>
                            <span class="fw-bold fs-5">₹${e.price || 0}</span>
                        </div>
                        <button class="btn ${btnState} px-4 book-now-btn">${btnText}</button>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
}

document.getElementById('events-container').addEventListener('click', async (e) => {
    const card = e.target.closest('.event-card');
    if (card && !card.classList.contains('expired-card')) {
        
        const requiredAge = parseInt(card.getAttribute('data-age'));
        currentEventType = card.getAttribute('data-type');
        currentEventPrice = parseFloat(card.getAttribute('data-price')); 
        const eventStart = card.getAttribute('data-start');
        const eventEnd = card.getAttribute('data-end');

        if (requiredAge > 0) {
            const timestamp = new Date().getTime();
            const res = await fetch(`/api/profile?t=${timestamp}`);
            const data = await res.json();
            if (handlePossibleForceLogout(data)) return; 

            if (!data.user.dob) {
                alert(`⚠️ Age Verification Required.\nYou must update your Profile with your Date of Birth before booking this event.`);
                document.getElementById('profile-link').click(); return;
            }
            const userAge = calculateAge(data.user.dob);
            if (userAge < requiredAge) {
                alert(`🛑 Access Denied!\nYou are ${userAge} years old. This event requires age ${requiredAge}+.`); return; 
            }
        }

        currentEventId = card.getAttribute('data-id');
        document.getElementById('selected-event-title').innerText = card.getAttribute('data-title'); 
        
        // Build Top Details Bar
        const d = new Date(eventStart);
        document.getElementById('selected-event-details-bar').innerHTML = `
            <div class="d-flex align-items-center gap-2"><div class="text-muted fs-5">📅</div><div><div class="text-muted" style="font-size:11px;">Date</div><div class="fw-bold small">${d.toLocaleDateString('en-US',{weekday:'short', day:'numeric', month:'short'})}</div></div></div>
            <div class="d-flex align-items-center gap-2"><div class="text-muted fs-5">🕗</div><div><div class="text-muted" style="font-size:11px;">Time</div><div class="fw-bold small">${d.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'})}</div></div></div>
            <div class="d-flex align-items-center gap-2"><div class="text-muted fs-5">📍</div><div><div class="text-muted" style="font-size:11px;">Venue</div><div class="fw-bold small">${card.getAttribute('data-loc')}</div></div></div>
        `;
        
        actionSection.classList.remove('d-none');
        bookingSection.classList.add('d-none');
        seatedView.classList.add('d-none'); generalView.classList.add('d-none');
        
        // Render Date Pills
        const dates = getDatesInRange(eventStart, eventEnd);
        const datesContainer = document.getElementById('date-pills');
        document.getElementById('date-selection-container').classList.remove('d-none');
        
        if (dates.length === 0) {
            datesContainer.innerHTML = '<p class="text-danger w-100 fw-bold mt-2">Event has ended.</p>';
        } else {
            let today = new Date(); today.setHours(0,0,0,0);
            let tomorrow = new Date(today.getTime()); tomorrow.setDate(tomorrow.getDate() + 1);
            const todayStr = formatLocalYYYYMMDD(today); const tomorrowStr = formatLocalYYYYMMDD(tomorrow);

            datesContainer.innerHTML = dates.map(d => {
                const dateStr = formatLocalYYYYMMDD(d);
                let line1 = ""; let line2 = "";
                if (dateStr === todayStr) { line1 = "Today"; line2 = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); } 
                else if (dateStr === tomorrowStr) { line1 = "Tomorrow"; line2 = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); } 
                else { line1 = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); line2 = d.toLocaleDateString('en-US', { weekday: 'short' }); }

                return `<button class="district-date-pill" data-date="${dateStr}">
                            <span class="d-block fw-bold mb-1 pe-none">${line1}</span>
                            <span class="d-block small pe-none" style="font-size:11px;">${line2}</span>
                        </button>`;
            }).join('');

            document.querySelectorAll('.district-date-pill').forEach(pill => {
                pill.addEventListener('click', async (btnEv) => {
                    const targetBtn = btnEv.target.closest('.district-date-pill');
                    document.querySelectorAll('.district-date-pill').forEach(p => p.classList.remove('active'));
                    targetBtn.classList.add('active');
                    
                    currentSelectedDate = targetBtn.getAttribute('data-date');
                    updateOrderSummary(true); // reset summary
                    await loadEventDataForDate(currentSelectedDate, false);
                    targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                });
            });

            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelector('.district-date-pill').click();
        }
    }
});

// CORE UI SYNC FUNCTION (Updates Sidebar instantly)
function updateOrderSummary(reset = false) {
    const checkoutBtn = document.getElementById('sidebar-checkout-btn');
    const seatsList = document.getElementById('summary-seats-list');
    const container = document.getElementById('summary-seats-container');
    const calcText = document.getElementById('summary-calc-text');
    const subtotalText = document.getElementById('summary-subtotal');
    const totalText = document.getElementById('summary-total');

    if (reset) {
        seatsList.innerHTML = ''; container.classList.add('d-none');
        calcText.innerText = `Tickets (0)`; subtotalText.innerText = '0'; totalText.innerText = '0';
        checkoutBtn.disabled = true; return;
    }

    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('.bms-seat.selected')).map(el => el.getAttribute('data-id'));
        const count = selectedSeats.length;
        
        container.classList.toggle('d-none', count === 0);
        seatsList.innerHTML = selectedSeats.map(s => `<span class="seat-pill">${s} <span class="ms-1 text-muted" style="font-size:10px;">×</span></span>`).join('');
        
        calcText.innerText = `Regular (${count} x ₹${currentEventPrice})`;
        const sub = count * currentEventPrice;
        subtotalText.innerText = sub; totalText.innerText = sub;
        checkoutBtn.disabled = count === 0;

    } else {
        const qty = parseInt(document.getElementById('general-qty').value) || 0;
        container.classList.add('d-none');
        calcText.innerText = `General (${qty} x ₹${currentEventPrice})`;
        const sub = qty * currentEventPrice;
        subtotalText.innerText = sub; totalText.innerText = sub;
        checkoutBtn.disabled = qty === 0;
    }
}

// Sidebar Checkout Routing
document.getElementById('sidebar-checkout-btn').addEventListener('click', () => {
    if (!currentSelectedDate) return;
    
    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('.bms-seat.selected')).map(el => el.getAttribute('data-id'));
        const totalAmount = selectedSeats.length * currentEventPrice;
        pendingPaymentData = { type: 'seated', eventId: currentEventId, seats: selectedSeats, selectedDate: currentSelectedDate, amount: totalAmount };
        document.getElementById('payment-amount-display').innerText = totalAmount;
    } else {
        const qty = parseInt(document.getElementById('general-qty').value);
        const totalAmount = qty * currentEventPrice;
        pendingPaymentData = { type: 'general', eventId: currentEventId, qty: qty, selectedDate: currentSelectedDate, amount: totalAmount };
        document.getElementById('payment-amount-display').innerText = totalAmount;
    }

    if(!paymentModalInstance) paymentModalInstance = new bootstrap.Modal(document.getElementById('paymentModal'));
    paymentModalInstance.show();
});

async function loadEventDataForDate(date, isSoftUpdate = false) {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/events/${currentEventId}/availability?date=${date}&t=${timestamp}`);
        const data = await res.json();
        const availableTickets = data.available;

        if (currentEventType === 'Seated') {
            generalView.classList.add('d-none'); seatedView.classList.remove('d-none');
            if (isSoftUpdate) { await renderSeatsForEvent(currentEventId, date); } 
            else { await renderSeatsForEvent(currentEventId, date); }
        } else {
            seatedView.classList.add('d-none'); generalView.classList.remove('d-none');
            const qtyInput = document.getElementById('general-qty');
            
            document.getElementById('tickets-left').innerText = availableTickets;
            qtyInput.max = availableTickets;
            
            if (availableTickets <= 0) {
                qtyInput.value = 0; qtyInput.disabled = true; updateOrderSummary();
            } else {
                if(qtyInput.value == 0 || qtyInput.value > availableTickets) qtyInput.value = 1;
                qtyInput.disabled = false; updateOrderSummary();
            }
        }
    } catch (err) { console.error("Error loading date data:", err); }
}

async function renderSeatsForEvent(eventId, date) {
    try {
        seatMap.innerHTML = '<p class="text-muted text-center">Loading layout...</p>';
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/seats/${eventId}?date=${date}&t=${timestamp}`);
        let seats = await res.json();
        
        seats.sort((a, b) => parseInt(a.seatId.replace(/\D/g, '')) - parseInt(b.seatId.replace(/\D/g, '')));

        const seatsPerRow = 14; const halfRow = seatsPerRow / 2;
        let html = '<div class="d-flex flex-column align-items-center">';

        for (let i = 0; i < seats.length; i += seatsPerRow) {
            const rowSeats = seats.slice(i, i + seatsPerRow);
            const rowLetter = String.fromCharCode(65 + Math.floor(i / seatsPerRow)); 

            html += `<div class="d-flex align-items-center justify-content-center w-100 mb-2">`;
            html += `<div class="text-end me-3 fw-bold text-muted" style="width: 15px; font-size: 11px;">${rowLetter}</div>`;

            for (let j = 0; j < rowSeats.length; j++) {
                if (j === halfRow) html += `<div style="width: 30px;"></div>`; 
                html += generateSeatHTML(rowSeats[j]);
            }
            html += `</div>`;
        }

        html += '</div>';
        seatMap.innerHTML = html;
        updateOrderSummary(); // Trigger update

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
        updateOrderSummary();
    }
});

document.getElementById('general-qty').addEventListener('input', (e) => {
    let val = e.target.value;
    if (val === '') { updateOrderSummary(true); return; }
    let qty = parseInt(val) || 0; const max = parseInt(e.target.max) || 0;
    if (qty > max) { qty = max; e.target.value = max; }
    updateOrderSummary();
});

document.getElementById('general-qty').addEventListener('blur', (e) => {
    const max = parseInt(e.target.max) || 0;
    if (max > 0 && (e.target.value === '' || parseInt(e.target.value) < 1)) { e.target.value = 1; updateOrderSummary(); }
});

// Final Checkout Execution (Inside Modal)
document.getElementById('confirm-payment-btn').addEventListener('click', async (e) => {
    if(!pendingPaymentData) return;

    const btn = e.target;
    if (btn.dataset.processing === "true") return;
    btn.dataset.processing = "true";

    const originalText = "Pay Securely Now";
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    btn.disabled = true;

    setTimeout(async () => {
        try {
            let endpoint = pendingPaymentData.type === 'seated' ? '/api/events/book-seats' : '/api/events/book-general';
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingPaymentData) });
            const data = await res.json();
            
            if (handlePossibleForceLogout(data)) { paymentModalInstance.hide(); return; }

            if (data.success) {
                paymentModalInstance.hide();
                if(pendingPaymentData.type === 'seated') { await renderSeatsForEvent(pendingPaymentData.eventId, pendingPaymentData.selectedDate); } 
                else { document.getElementById('general-qty').value = 1; await loadEventDataForDate(pendingPaymentData.selectedDate, true); }
                setTimeout(() => alert("✅ Payment Successful!\n\n" + data.message), 400);
            } else {
                paymentModalInstance.hide();
                await loadEventDataForDate(pendingPaymentData.selectedDate, true); 
                setTimeout(() => alert("❌ Booking Failed: " + data.message), 400);
            }
        } catch (err) { paymentModalInstance.hide(); alert("Network error during payment processing.");
        } finally { btn.innerText = originalText; btn.disabled = false; btn.dataset.processing = "false"; pendingPaymentData = null; }
    }, 1500); 
});

// NEW: Horizontal List View for Bookings
document.getElementById('my-tickets-link').addEventListener('click', async (e) => {
    e.preventDefault(); 
    bookingSection.classList.add('d-none'); profileSection.classList.add('d-none'); actionSection.classList.add('d-none'); ticketsSection.classList.remove('d-none');
    const container = document.getElementById('my-tickets-container');
    container.innerHTML = '<p class="text-muted">Loading your tickets...</p>';

    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/my-tickets?t=${timestamp}`);
        const tickets = await res.json();
        if (handlePossibleForceLogout(tickets)) return;

        if (tickets.length === 0) { container.innerHTML = '<p class="text-muted p-4 border border-secondary rounded">You have no booked tickets yet.</p>'; return; }

        // Group tickets by Event and Date so we don't spam 10 rows for 10 seats
        const grouped = tickets.reduce((acc, t) => {
            const key = `${t.eventId}-${t.bookingDate}`;
            if(!acc[key]) { acc[key] = { eventTitle: t.eventTitle, date: t.bookingDate, type: t.eventType, count: 0, seats: [], ids: [] }; }
            acc[key].count++;
            acc[key].seats.push(t.seatId);
            acc[key].ids.push({ eventId: t.eventId, seatId: t.seatId, bookingDate: t.bookingDate }); // Keep full ID data for bulk cancel
            return acc;
        }, {});

        container.innerHTML = Object.values(grouped).map(g => {
            const icon = g.type === 'Seated' ? '💺' : '🎫';
            // Since we group them, we don't have individual prices stored in the ticket DB right now. 
            // We just show a confirmed badge to match the exact aesthetic.
            return `
            <div class="booking-list-item">
                <div class="d-flex align-items-center">
                    <div class="booking-icon">${icon}</div>
                    <div>
                        <h6 class="fw-bold mb-1">${g.eventTitle}</h6>
                        <div class="text-muted small">${new Date(g.date).toLocaleDateString('en-US',{weekday:'short', day:'numeric', month:'short'})} • ${g.count} Ticket(s)</div>
                        <div class="text-muted mt-1" style="font-size:10px;">${g.seats.join(', ')}</div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <span class="badge bg-success text-dark bg-opacity-25 border border-success border-opacity-50 px-2 py-1" style="font-size:10px; font-weight:800;">CONFIRMED</span>
                    <button class="btn btn-outline-danger btn-sm cancel-ticket-btn" data-json='${JSON.stringify(g.ids)}'>Cancel</button>
                </div>
            </div>
        `}).join('');
    } catch (err) { container.innerHTML = '<p class="text-danger">Failed to load tickets.</p>'; }
});

document.getElementById('my-tickets-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('cancel-ticket-btn')) {
        const idsToCancel = JSON.parse(e.target.getAttribute('data-json'));
        if (!confirm(`Are you sure you want to cancel these ${idsToCancel.length} ticket(s)?`)) return;
        
        e.target.disabled = true; e.target.innerText = "...";

        try {
            // Loop through and cancel each grouped ticket securely
            for(let idObj of idsToCancel) {
                await fetch('/api/events/cancel-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idObj) });
            }
            document.getElementById('my-tickets-link').click(); 
        } catch (err) { alert('Cancellation failed due to a network error.'); }
    }
});

function calculateAge(dobString) {
    if (!dobString) return '';
    const ageDt = new Date(Date.now() - new Date(dobString).getTime()); 
    return Math.abs(ageDt.getUTCFullYear() - 1970);
}

const dobInput = document.getElementById('profile-dob');
const ageInput = document.getElementById('profile-age');
if(dobInput) dobInput.addEventListener('change', () => { ageInput.value = calculateAge(dobInput.value); });

document.getElementById('profile-link').addEventListener('click', async (e) => {
    e.preventDefault(); document.getElementById('profile-alert').classList.add('d-none');
    bookingSection.classList.add('d-none'); ticketsSection.classList.add('d-none'); profileSection.classList.remove('d-none'); actionSection.classList.add('d-none');
    
    try {
        const timestamp = new Date().getTime(); const res = await fetch(`/api/profile?t=${timestamp}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            document.getElementById('profile-username').value = data.user.username; document.getElementById('profile-fullname').value = data.user.fullName || ''; document.getElementById('profile-email').value = data.user.email || ''; document.getElementById('profile-phone').value = data.user.phone || ''; document.getElementById('profile-address').value = data.user.address || '';
            if (data.user.dob) { const dateString = new Date(data.user.dob).toISOString().split('T')[0]; dobInput.value = dateString; ageInput.value = calculateAge(dateString);
            } else { dobInput.value = ''; ageInput.value = ''; }
        }
    } catch (err) { console.error("Failed to load profile."); }
});

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('profile-submit-btn'); const alertBox = document.getElementById('profile-alert');
    const newUsername = document.getElementById('profile-username').value.trim();
    submitBtn.disabled = true; submitBtn.innerText = "Saving..."; alertBox.classList.add('d-none'); 

    try {
        const res = await fetch('/api/profile', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername, fullName: document.getElementById('profile-fullname').value, email: document.getElementById('profile-email').value, phone: document.getElementById('profile-phone').value, dob: document.getElementById('profile-dob').value, address: document.getElementById('profile-address').value })
        });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;
        
        alertBox.classList.remove('d-none', 'alert-danger', 'alert-success'); alertBox.classList.add(data.success ? 'alert-success' : 'alert-danger'); alertBox.innerText = data.message;
        
        if(data.success) {
            usernameBadge.innerText = data.newUsername || newUsername;
            setTimeout(() => { profileSection.classList.add('d-none'); bookingSection.classList.remove('d-none'); alertBox.classList.add('d-none'); submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }, 1500);
        } else { submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }
    } catch (err) { alertBox.classList.remove('d-none', 'alert-success'); alertBox.classList.add('alert-danger'); alertBox.innerText = "Network error."; submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    bookingSection.classList.add('d-none'); profileSection.classList.add('d-none'); ticketsSection.classList.add('d-none');
    userDisplay.classList.add('d-none'); guestDisplay.classList.remove('d-none'); authSection.classList.remove('d-none'); actionSection.classList.add('d-none');
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    if (searchBar) searchBar.value = '';
    const adminBtn = document.getElementById('admin-btn'); if (adminBtn) adminBtn.remove();
});

(async function initializeApp() {
    try {
        const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 60000); 
        const res = await fetch(`/api/check-session?t=${new Date().getTime()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Server error.");
        const data = await res.json();
        if (initialLoader) initialLoader.classList.add('d-none');
        if (data.loggedIn) showBookingScreen(data.username, data.isAdmin);
        else { authSection.classList.remove('d-none'); guestDisplay.classList.remove('d-none'); }
    } catch (err) {
        if (initialLoader) initialLoader.classList.add('d-none');
        if (authSection) authSection.classList.remove('d-none');
        guestDisplay.classList.remove('d-none');
    }
})();
