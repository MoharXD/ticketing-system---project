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
let currentEventType = null;
let currentSelectedDate = null; 
let allEvents = []; 
let pendingPaymentData = null;
let paymentModalInstance = null;

// PRICING STATE
let priceRegular = 0;
let priceVip = 0;
let selectedSeatMap = new Map(); // Stores { "C11": "regular", "A1": "vip" }

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

async function refreshGlobalEvents() {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/events?t=${timestamp}`);
        if (!res.ok) throw new Error("Server error");
        allEvents = await res.json(); 
        displayEvents(allEvents);
    } catch(err) { console.error("Live sync failed", err); }
}

if (homeLogo) {
    homeLogo.addEventListener('click', (e) => {
        e.preventDefault();
        authSection.classList.add('d-none'); profileSection.classList.add('d-none');
        ticketsSection.classList.add('d-none'); actionSection.classList.add('d-none'); 
        bookingSection.classList.remove('d-none'); 
        if (searchBar) { searchBar.value = ''; displayEvents(allEvents); }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

document.getElementById('nav-login-btn').addEventListener('click', () => {
    bookingSection.classList.add('d-none');
    authSection.classList.remove('d-none');
});

toggleAuth.addEventListener('click', (e) => {
    e.preventDefault(); isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? 'Welcome Back' : 'Create Account'; 
    authBtn.innerText = isLoginMode ? 'Sign In' : 'Sign Up';
    toggleAuth.innerText = isLoginMode ? 'Need an account? Sign up' : 'Already have an account? Sign In';
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
                alert(data.message); isLoginMode = true; authTitle.innerText = 'Welcome Back'; authBtn.innerText = 'Sign In';
                toggleAuth.innerText = 'Need an account? Sign up'; passwordInput.value = '';
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
    document.getElementById('auth-buttons').classList.add('d-none');
    
    if (isAdmin && !document.getElementById('admin-btn')) {
        const adminLink = document.createElement('a'); adminLink.id = 'admin-btn';
        adminLink.href = 'admin.html'; adminLink.className = 'nav-link-custom text-warning ms-3';
        adminLink.innerText = 'Admin Portal'; document.querySelector('.d-md-flex').appendChild(adminLink);
    }
    renderEvents(); 
}

async function renderEvents() {
    try { 
        if (initialEventsPromise) {
            allEvents = await initialEventsPromise;
            initialEventsPromise = null; 
            displayEvents(allEvents);
        } else {
            await refreshGlobalEvents(); 
        }
    } catch (err) { console.error("Error loading events:", err); }
}

if (searchBar) {
    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        displayEvents(allEvents.filter(ev => 
            ev.title.toLowerCase().includes(searchTerm) || ev.location.toLowerCase().includes(searchTerm) || ev.description.toLowerCase().includes(searchTerm)
        ));
    });
}

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        // Visual simulation only for this example
    });
});

function displayEvents(events) {
    const container = document.getElementById('events-container');
    if (events.length === 0) { container.innerHTML = '<div class="col-12"><p class="text-muted text-center py-5">No events found.</p></div>'; return; }

    const now = new Date();
    container.innerHTML = events.map(e => {
        const isExpired = now > new Date(e.endDate);
        const btnHtml = isExpired 
            ? `<button class="btn btn-outline w-100 disabled py-2">Event Ended</button>`
            : `<button class="btn btn-primary w-100 py-2 select-event-btn" 
                data-id="${e._id}" data-title="${e.title}" data-desc="${e.description}" data-loc="${e.location}" 
                data-age="${e.ageLimit}" data-type="${e.eventType}" data-price="${e.price}"
                data-start="${e.startDate}" data-end="${e.endDate}">Book Now</button>`;

        return `
        <div class="col-md-4 mb-4">
            <div class="card h-100 border-0 shadow-sm" style="background-color: var(--surface-dark);">
                <div class="position-relative">
                    ${e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img" alt="${e.title}">` : `<div class="event-card-img d-flex align-items-center justify-content-center"><i class="text-muted fs-1">🎟️</i></div>`}
                    <span class="position-absolute top-0 start-0 m-3 badge-custom bg-dark border border-secondary text-info">${e.eventType}</span>
                </div>
                <div class="card-body d-flex flex-column p-4">
                    <h5 class="card-title text-white mb-2">${e.title}</h5>
                    <p class="card-text text-muted small mb-4 line-clamp-2">${e.description || "Join us for this spectacular event."}</p>
                    
                    <div class="mb-4 small text-muted">
                        <div class="mb-2">📅 ${new Date(e.startDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'})}</div>
                        <div class="mb-2">🕒 ${new Date(e.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div>📍 ${e.location}</div>
                    </div>
                    
                    <div class="mt-auto d-flex justify-content-between align-items-end">
                        <div>
                            <small class="text-muted d-block">Starting from</small>
                            <span class="text-white fw-bold fs-5">₹${e.price || 0}</span>
                        </div>
                        <div style="width: 120px;">${btnHtml}</div>
                    </div>
                </div>
            </div>
        </div>`
    }).join('');
}

// ==========================================
// 🛒 BOOKING VIEW & SIDEBAR LOGIC
// ==========================================

document.getElementById('events-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('select-event-btn') && !e.target.disabled) {
        
        currentEventId = e.target.getAttribute('data-id');
        currentEventType = e.target.getAttribute('data-type');
        
        // Define Pricing (Rows A-B are roughly 2x price of Regular)
        priceRegular = parseFloat(e.target.getAttribute('data-price')) || 0; 
        priceVip = priceRegular > 0 ? priceRegular + 400 : 0; 
        
        const title = e.target.getAttribute('data-title');
        const desc = e.target.getAttribute('data-desc');
        const loc = e.target.getAttribute('data-loc');
        const eventStart = e.target.getAttribute('data-start');
        const eventEnd = e.target.getAttribute('data-end');

        // Check Login
        const res = await fetch(`/api/check-session?t=${new Date().getTime()}`);
        const data = await res.json();
        if(!data.loggedIn) { alert("Please sign in to book tickets."); document.getElementById('nav-login-btn').click(); return; }

        // Setup Header
        document.getElementById('selected-event-title').innerText = title; 
        document.getElementById('selected-event-desc').innerText = desc; 
        document.getElementById('detail-type-badge').innerText = currentEventType;

        // Reset State
        selectedSeatMap.clear();
        updateOrderSummary();

        bookingSection.classList.add('d-none');
        actionSection.classList.remove('d-none');
        
        // Render Dates
        const dates = getDatesInRange(eventStart, eventEnd);
        const datesContainer = document.getElementById('date-pills');
        document.getElementById('date-selection-container').classList.remove('d-none');
        
        if (dates.length === 0) {
            datesContainer.innerHTML = '<p class="text-danger">Event has ended.</p>';
        } else {
            const todayStr = formatLocalYYYYMMDD(new Date());
            datesContainer.innerHTML = dates.map(d => {
                const dateStr = formatLocalYYYYMMDD(d);
                const display = dateStr === todayStr ? "Today" : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                return `<button class="district-date-pill" data-date="${dateStr}">${display}</button>`;
            }).join('');

            document.querySelectorAll('.district-date-pill').forEach(pill => {
                pill.addEventListener('click', async (btnEv) => {
                    document.querySelectorAll('.district-date-pill').forEach(p => p.classList.remove('active'));
                    btnEv.target.classList.add('active');
                    currentSelectedDate = btnEv.target.getAttribute('data-date');
                    
                    // Update Info Grid Cards
                    const dObj = new Date(currentSelectedDate);
                    document.getElementById('event-info-grid').innerHTML = `
                        <div class="col-md-3"><div class="info-box"><i>📅</i><div><small class="text-muted d-block">Date</small><span class="fw-bold text-white">${dObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short'})}</span></div></div></div>
                        <div class="col-md-3"><div class="info-box"><i>🕒</i><div><small class="text-muted d-block">Time</small><span class="fw-bold text-white">${new Date(eventStart).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</span></div></div></div>
                        <div class="col-md-3"><div class="info-box"><i>📍</i><div><small class="text-muted d-block">Venue</small><span class="fw-bold text-white line-clamp-1">${loc}</span></div></div></div>
                        <div class="col-md-3"><div class="info-box"><i>👥</i><div><small class="text-muted d-block">Available</small><span class="fw-bold text-white" id="grid-available">Loading...</span></div></div></div>
                    `;

                    selectedSeatMap.clear();
                    updateOrderSummary();
                    await loadEventDataForDate(currentSelectedDate, false);
                });
            });
            document.querySelector('.district-date-pill').click();
        }
    }
});

async function loadEventDataForDate(date, isSoftUpdate = false) {
    try {
        const res = await fetch(`/api/events/${currentEventId}/availability?date=${date}&t=${new Date().getTime()}`);
        const data = await res.json();
        
        const availEl = document.getElementById('grid-available');
        if(availEl) availEl.innerText = `${data.available} seats`;

        if (currentEventType === 'Seated') {
            generalView.classList.add('d-none'); seatedView.classList.remove('d-none');
            await renderSeatsForEvent(currentEventId, date); 
        } else {
            seatedView.classList.add('d-none'); generalView.classList.remove('d-none');
            const qtyInput = document.getElementById('general-qty');
            document.getElementById('tickets-left').innerText = data.available;
            qtyInput.max = data.available;
            
            if (data.available <= 0) {
                qtyInput.value = 0; qtyInput.disabled = true; 
            } else {
                qtyInput.value = 1; qtyInput.disabled = false;
                selectedSeatMap.set('GA', 'regular'); // Fake a regular seat for general admission pricing
                updateOrderSummary();
            }
        }
    } catch (err) { console.error(err); }
}

document.getElementById('general-qty').addEventListener('input', (e) => {
    let qty = parseInt(e.target.value) || 0;
    const max = parseInt(e.target.max) || 0;
    if (qty > max) { qty = max; e.target.value = max; }
    
    selectedSeatMap.clear();
    for(let i=0; i<qty; i++) selectedSeatMap.set(`GA-${i}`, 'regular');
    updateOrderSummary();
});

async function renderSeatsForEvent(eventId, date) {
    try {
        const res = await fetch(`/api/seats/${eventId}?date=${date}&t=${new Date().getTime()}`);
        let seats = await res.json();
        
        seats.sort((a, b) => parseInt(a.seatId.replace(/\D/g, '')) - parseInt(b.seatId.replace(/\D/g, '')));

        const seatsPerRow = 14; const halfRow = seatsPerRow / 2;
        let html = '';

        for (let i = 0; i < seats.length; i += seatsPerRow) {
            const rowSeats = seats.slice(i, i + seatsPerRow);
            const rowLetter = String.fromCharCode(65 + Math.floor(i / seatsPerRow)); 
            const isVipRow = (rowLetter === 'A' || rowLetter === 'B'); // First two rows are VIP

            html += `<div class="d-flex align-items-center justify-content-center w-100 mb-2">`;
            html += `<div class="text-end me-3 fw-bold text-muted" style="width: 20px; font-size: 12px;">${rowLetter}</div>`;

            for (let j = 0; j < rowSeats.length; j++) {
                if (j === halfRow) html += `<div style="width: 30px;"></div>`; 
                
                const s = rowSeats[j];
                const isBooked = s.status === 'Booked';
                const isSelected = selectedSeatMap.has(s.seatId);
                
                let classes = `bms-seat ${isVipRow ? 'vip' : 'regular'}`;
                if (isBooked) classes += ' booked';
                if (isSelected) classes += ' selected';

                let displayNum = s.seatId.replace(/\D/g, '');
                html += `<button class="${classes}" data-id="${s.seatId}" data-type="${isVipRow ? 'vip' : 'regular'}">${displayNum}</button>`;
            }
            html += `<div class="ms-3 fw-bold text-muted" style="width: 20px; font-size: 12px;">${rowLetter}</div></div>`;
        }

        document.getElementById('seat-map').innerHTML = html;
        updateOrderSummary();
    } catch (err) { console.error(err); }
}

document.getElementById('seat-map').addEventListener('click', (e) => {
    const btn = e.target.closest('.bms-seat');
    if (!btn || btn.classList.contains('booked')) return;

    const seatId = btn.getAttribute('data-id');
    const type = btn.getAttribute('data-type');

    if (selectedSeatMap.has(seatId)) {
        selectedSeatMap.delete(seatId);
        btn.classList.remove('selected');
    } else {
        if(selectedSeatMap.size >= 10) { alert("Maximum 10 seats allowed per booking."); return; }
        selectedSeatMap.set(seatId, type);
        btn.classList.add('selected');
    }
    updateOrderSummary();
});

// Remove pill logic
document.getElementById('selected-seat-pills').addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
        const seatId = e.target.parentElement.getAttribute('data-id');
        selectedSeatMap.delete(seatId);
        const seatBtn = document.querySelector(`.bms-seat[data-id="${seatId}"]`);
        if(seatBtn) seatBtn.classList.remove('selected');
        updateOrderSummary();
    }
});

document.getElementById('clear-all-seats').addEventListener('click', () => {
    selectedSeatMap.clear();
    document.querySelectorAll('.bms-seat.selected').forEach(btn => btn.classList.remove('selected'));
    if(currentEventType === 'General') document.getElementById('general-qty').value = 0;
    updateOrderSummary();
});

function updateOrderSummary() {
    const pillsContainer = document.getElementById('selected-seat-pills');
    const checkoutBtn = document.getElementById('book-checkout-btn');
    
    let countReg = 0; let countVip = 0;

    if (selectedSeatMap.size === 0) {
        pillsContainer.innerHTML = '<span class="text-muted small fst-italic">No seats selected</span>';
        document.getElementById('row-regular').classList.add('d-none');
        document.getElementById('row-vip').classList.add('d-none');
        document.getElementById('val-fee').innerText = '₹0';
        document.getElementById('val-total').innerText = '₹0';
        checkoutBtn.disabled = true;
        return;
    }

    let pillsHtml = '';
    selectedSeatMap.forEach((type, seatId) => {
        if(type === 'vip') countVip++; else countReg++;
        if(currentEventType === 'Seated') {
            pillsHtml += `<div class="seat-pill" data-id="${seatId}">${seatId} <span title="Remove">&times;</span></div>`;
        }
    });

    if(currentEventType === 'General') pillsHtml = `<div class="seat-pill">General x${countReg}</div>`;
    pillsContainer.innerHTML = pillsHtml;

    const totalReg = countReg * priceRegular;
    const totalVip = countVip * priceVip;
    const subtotal = totalReg + totalVip;
    const fee = Math.floor(subtotal * 0.02); // 2% Convenience Fee
    const grandTotal = subtotal + fee;

    const rowReg = document.getElementById('row-regular');
    const rowVip = document.getElementById('row-vip');

    if (countReg > 0) {
        rowReg.classList.remove('d-none');
        document.getElementById('label-regular').innerText = `Regular (${countReg} x ₹${priceRegular})`;
        document.getElementById('val-regular').innerText = `₹${totalReg}`;
    } else { rowReg.classList.add('d-none'); }

    if (countVip > 0) {
        rowVip.classList.remove('d-none');
        document.getElementById('label-vip').innerText = `VIP (${countVip} x ₹${priceVip})`;
        document.getElementById('val-vip').innerText = `₹${totalVip}`;
    } else { rowVip.classList.add('d-none'); }

    document.getElementById('val-fee').innerText = `₹${fee}`;
    document.getElementById('val-total').innerText = `₹${grandTotal}`;
    
    checkoutBtn.disabled = false;
    checkoutBtn.setAttribute('data-total', grandTotal);
}

// ==========================================
// 💳 PAYMENT & CHECKOUT API
// ==========================================

document.getElementById('book-checkout-btn').addEventListener('click', (e) => {
    if (selectedSeatMap.size === 0 || !currentSelectedDate) return;

    const totalAmount = e.target.getAttribute('data-total');
    
    if (currentEventType === 'Seated') {
        const seatsArray = Array.from(selectedSeatMap.keys());
        pendingPaymentData = { type: 'seated', eventId: currentEventId, seats: seatsArray, selectedDate: currentSelectedDate };
    } else {
        pendingPaymentData = { type: 'general', eventId: currentEventId, qty: selectedSeatMap.size, selectedDate: currentSelectedDate };
    }

    document.getElementById('payment-amount-display').innerText = totalAmount;
    if(!paymentModalInstance) paymentModalInstance = new bootstrap.Modal(document.getElementById('paymentModal'));
    paymentModalInstance.show();
});

document.getElementById('confirm-payment-btn').addEventListener('click', async (e) => {
    if(!pendingPaymentData) return;

    const btn = e.target;
    if (btn.dataset.processing === "true") return;
    btn.dataset.processing = "true";

    const originalText = "Pay Securely Now";
    btn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div> Processing...';
    btn.disabled = true;

    setTimeout(async () => {
        try {
            const endpoint = pendingPaymentData.type === 'seated' ? '/api/events/book-seats' : '/api/events/book-general';
            const res = await fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pendingPaymentData)
            });
            const data = await res.json();
            
            if (handlePossibleForceLogout(data)) { paymentModalInstance.hide(); return; }

            if (data.success) {
                paymentModalInstance.hide();
                selectedSeatMap.clear();
                updateOrderSummary();
                await loadEventDataForDate(pendingPaymentData.selectedDate, true); 
                setTimeout(() => alert("✅ Booking Confirmed!\n\n" + data.message), 400);
            } else {
                paymentModalInstance.hide();
                await loadEventDataForDate(pendingPaymentData.selectedDate, true); 
                setTimeout(() => alert("❌ Booking Failed: " + data.message), 400);
            }
        } catch (err) { 
            paymentModalInstance.hide(); alert("Network error during payment processing.");
        } finally { 
            btn.innerText = originalText; btn.disabled = false; btn.dataset.processing = "false"; pendingPaymentData = null; 
        }
    }, 1500); 
});

// ==========================================
// 🎟️ MY TICKETS & PROFILE
// ==========================================

document.getElementById('my-tickets-link').addEventListener('click', async (e) => {
    e.preventDefault();
    bookingSection.classList.add('d-none'); profileSection.classList.add('d-none'); actionSection.classList.add('d-none'); ticketsSection.classList.remove('d-none');
    const container = document.getElementById('my-tickets-container');
    container.innerHTML = '<p class="text-center text-muted py-5">Loading your secure tickets...</p>';

    try {
        const res = await fetch(`/api/my-tickets?t=${new Date().getTime()}`);
        const tickets = await res.json();
        if (handlePossibleForceLogout(tickets)) return;

        if (tickets.length === 0) { container.innerHTML = '<p class="text-center text-muted py-5">You have no active bookings.</p>'; return; }

        container.innerHTML = tickets.map(t => `
            <div class="card bg-dark border border-secondary shadow-sm p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="d-flex align-items-center gap-3 mb-1">
                            <i class="fs-4 text-muted">🎫</i>
                            <h5 class="fw-bold text-white m-0">${t.eventTitle}</h5>
                        </div>
                        <p class="text-muted small mb-2 ms-5">${new Date(t.bookingDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'})} • ${t.location}</p>
                        <div class="ms-5 d-flex gap-2">
                            <span class="badge bg-success bg-opacity-25 text-success border border-success">Confirmed</span>
                            ${t.eventType === 'Seated' ? `<span class="badge bg-secondary text-light border border-secondary">Seat: ${t.seatId}</span>` : `<span class="badge bg-secondary text-light border border-secondary">Gen Admission</span>`}
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="qr-code-box bg-white p-1 rounded mb-2" id="qr-${t.seatId}"></div>
                        <button class="btn btn-outline-danger btn-sm cancel-ticket-btn" style="font-size: 10px;" data-eventid="${t.eventId}" data-seatid="${t.seatId}" data-date="${t.bookingDate}">Cancel</button>
                    </div>
                </div>
            </div>
        `).join('');

        tickets.forEach(t => {
            const qrContainer = document.getElementById(`qr-${t.seatId}`);
            if (qrContainer && typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, { text: `TicketHub\n${t.eventTitle}\nSeat: ${t.seatId}`, width: 60, height: 60, colorDark : "#000", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.L });
            }
        });
    } catch (err) { container.innerHTML = '<p class="text-danger py-5">Failed to load tickets.</p>'; }
});

document.getElementById('my-tickets-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('cancel-ticket-btn')) {
        const eventId = e.target.getAttribute('data-eventid');
        const seatId = e.target.getAttribute('data-seatid');
        const bookingDate = e.target.getAttribute('data-date'); 

        if (!confirm('Are you sure you want to cancel this ticket?')) return;
        e.target.disabled = true; e.target.innerText = "Cancelling...";

        try {
            const res = await fetch('/api/events/cancel-booking', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, seatId, bookingDate })
            });
            const data = await res.json();
            if (handlePossibleForceLogout(data)) return;

            if (data.success) document.getElementById('my-tickets-link').click(); 
            else { alert(data.message); e.target.disabled = false; e.target.innerText = "Cancel"; }
        } catch (err) { alert('Cancellation failed.'); e.target.disabled = false; e.target.innerText = "Cancel"; }
    }
});

document.getElementById('profile-link').addEventListener('click', async (e) => {
    e.preventDefault(); 
    document.getElementById('profile-alert').classList.add('d-none');
    bookingSection.classList.add('d-none'); ticketsSection.classList.add('d-none'); actionSection.classList.add('d-none'); profileSection.classList.remove('d-none'); 
    
    try {
        const res = await fetch(`/api/profile?t=${new Date().getTime()}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            document.getElementById('profile-username').value = data.user.username;
            if (data.user.dob) document.getElementById('profile-dob').value = new Date(data.user.dob).toISOString().split('T')[0];
        }
    } catch (err) { console.error("Failed to load profile."); }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.reload(); // Hard reset SPA state
});

(async function initializeApp() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); 
        const res = await fetch(`/api/check-session?t=${new Date().getTime()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error("Boot error.");
        const data = await res.json();
        
        if (initialLoader) initialLoader.classList.add('d-none');
        if (data.loggedIn) showBookingScreen(data.username, data.isAdmin);
        else document.getElementById('events-container').innerHTML = '<p class="text-center text-muted w-100 py-5">Please Sign In to view and book events.</p>';
    } catch (err) {
        if (initialLoader) initialLoader.classList.add('d-none');
    }
})();