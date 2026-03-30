// ==========================================
// 🛡️ BULLETPROOF EVENT BINDER
// ==========================================
const safeBind = (id, event, callback) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
};

// Global State
let isLoginMode = true;
let currentEventId = null;
let currentEventPrice = 0; 
let currentEventType = null;
let currentSelectedDate = null; 
let currentSelectedTime = null; 
let allEvents = []; 
let currentCategoryFilter = 'All'; 
let pendingPaymentData = null;
let paymentModalInstance = null;
let finalCheckoutTotal = 0;

let initialEventsPromise = fetch(`/api/events?t=${new Date().getTime()}`)
    .then(res => res.ok ? res.json() : [])
    .catch(() => []);

function formatLocalYYYYMMDD(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// 🚨 4-Day Rolling Window Logic
function getNextFourDays() {
    const dates = [];
    let today = new Date();
    today.setHours(0,0,0,0);
    for(let i = 0; i < 4; i++) {
        let d = new Date(today);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    return dates;
}

const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
    socket.on('seatUpdate', async (data) => {
        if (String(currentEventId) === String(data.eventId) && currentSelectedDate === data.date && currentSelectedTime === data.timeSlot) {
            await loadEventDataForDateAndTime(currentSelectedDate, currentSelectedTime, true); 
        }
    });
    socket.on('eventUpdate', async () => { await refreshGlobalEvents(); });
}

function handlePossibleForceLogout(data) {
    if (data.forceLogout) {
        alert("🚨 Session Terminated: " + data.message);
        document.getElementById('logout-btn')?.click();
        return true;
    }
    return false;
}

function checkEventExpirations() {
    const now = new Date();
    allEvents.forEach(e => {
        const isExpired = now > new Date(e.endDate);
        const cardBtns = document.querySelectorAll(`.event-card[data-id="${e._id}"]`);
        
        cardBtns.forEach(cardBtn => {
            if (isExpired && !cardBtn.classList.contains('expired-card')) {
                cardBtn.classList.add('expired-card');
                const overlay = cardBtn.querySelector('.book-now-btn');
                if(overlay) { 
                    overlay.innerText = 'Ended'; 
                    overlay.classList.replace('btn-danger', 'btn-secondary'); 
                }
                if (currentEventId === String(e._id)) {
                    alert("⏳ Time's up! This event has officially ended.");
                    switchView('booking-section');
                }
            }
        });
    });
}
setInterval(checkEventExpirations, 10000);

async function refreshGlobalEvents() {
    try {
        const res = await fetch(`/api/events?t=${new Date().getTime()}`);
        if (res.ok) {
            allEvents = await res.json(); 
            checkEventExpirations(); 
            applyFilters();
        }
    } catch(err) { console.warn("Live sync failed", err); }
}

const switchView = (viewId) => {
    ['auth-section', 'booking-section', 'profile-section', 'tickets-section', 'action-section', 'ticket-detail-section'].forEach(id => {
        document.getElementById(id)?.classList.add('d-none');
    });
    document.getElementById(viewId)?.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

safeBind('home-logo', 'click', (e) => { e.preventDefault(); switchView('booking-section'); });
safeBind('back-to-events-btn', 'click', (e) => { e.preventDefault(); switchView('booking-section'); });

const setupAuthMode = (isLogin) => {
    isLoginMode = isLogin;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    
    if (title) title.innerText = isLogin ? 'Sign In' : 'Create Account';
    if (btn) btn.innerText = isLogin ? 'Sign In' : 'Sign Up';
    switchView('auth-section');
};

safeBind('nav-signin-btn', 'click', (e) => { e.preventDefault(); setupAuthMode(true); });
safeBind('nav-signup-btn', 'click', (e) => { e.preventDefault(); setupAuthMode(false); });

safeBind('auth-form', 'submit', async (e) => {
    e.preventDefault();
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    const userEl = document.getElementById('username');
    const passEl = document.getElementById('password');
    if(!userEl || !passEl) return;

    try {
        const res = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userEl.value.trim(), password: passEl.value })
        });
        const data = await res.json();
        
        if (data.success) {
            if (isLoginMode) showBookingScreen(data.username, data.isAdmin);
            else {
                alert(data.message); 
                setupAuthMode(true);
                passEl.value = '';
            }
        } else {
            if (data.notFound && isLoginMode) { if (confirm(data.message)) setupAuthMode(false); } 
            else alert(data.message || 'Error occurred');
        }
    } catch (err) { alert("Server error. Please try again."); }
});

function showBookingScreen(username, isAdmin = false) {
    switchView('booking-section');
    
    const guestDisplay = document.getElementById('guest-display');
    if(guestDisplay) {
        guestDisplay.classList.remove('d-flex');
        guestDisplay.classList.add('d-none');
    }
    
    const userDisplay = document.getElementById('user-display');
    if(userDisplay) {
        userDisplay.classList.remove('d-none');
        userDisplay.classList.add('d-flex');
    }
    
    const badge = document.getElementById('username-badge');
    if(badge) badge.innerText = username;

    const adminContainer = document.getElementById('admin-link-container');
    if (isAdmin && adminContainer) {
        adminContainer.innerHTML = `<li><a class="dropdown-item fw-bold py-2 text-warning d-flex align-items-center gap-2" href="admin.html" id="nav-admin-link"><span class="fs-6">🛠️</span> Admin Panel</a></li>`;
    } else if (adminContainer) {
        adminContainer.innerHTML = '';
    }

    renderEvents(); 
}

safeBind('logout-btn', 'click', async (e) => {
    e.preventDefault(); 
    await fetch('/api/logout', { method: 'POST' });
    
    const guestDisplay = document.getElementById('guest-display');
    if(guestDisplay) {
        guestDisplay.classList.remove('d-none');
        guestDisplay.classList.add('d-flex');
    }
    
    const userDisplay = document.getElementById('user-display');
    if(userDisplay) {
        userDisplay.classList.remove('d-flex');
        userDisplay.classList.add('d-none');
    }
    
    const adminContainer = document.getElementById('admin-link-container');
    if(adminContainer) adminContainer.innerHTML = '';
    
    const u = document.getElementById('username'); if(u) u.value = '';
    const p = document.getElementById('password'); if(p) p.value = '';
    const s = document.getElementById('event-search-bar'); if(s) s.value = '';
    
    setupAuthMode(true);
});

document.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.category-filter-btn').forEach(b => {
            b.classList.remove('btn-danger');
            b.classList.add('btn-outline-secondary', 'border-dark');
        });
        
        e.target.classList.remove('btn-outline-secondary', 'border-dark');
        e.target.classList.add('btn-danger');

        currentCategoryFilter = e.target.getAttribute('data-cat');
        applyFilters();
    });
});

safeBind('event-search-bar', 'input', () => { applyFilters(); });

function applyFilters() {
    const searchEl = document.getElementById('event-search-bar');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    
    const filteredEvents = allEvents.filter(ev => {
        const safeTitle = ev.title ? ev.title.toLowerCase() : '';
        const safeLoc = ev.location ? ev.location.toLowerCase() : '';
        
        const matchesSearch = safeTitle.includes(searchTerm) || safeLoc.includes(searchTerm);
        const matchesCategory = currentCategoryFilter === 'All' || ev.category === currentCategoryFilter;
        return matchesSearch && matchesCategory;
    });
    displayEvents(filteredEvents);
}

async function renderEvents() {
    const container = document.getElementById('events-container');
    if(!container) return;

    if (allEvents.length === 0) {
        container.innerHTML = Array(3).fill(`
            <div class="col-md-4">
                <div class="card event-card h-100 placeholder-glow">
                    <div class="placeholder w-100" style="height: 200px; background-color: #262626;"></div>
                    <div class="card-body p-4"><span class="placeholder col-8 bg-secondary"></span></div>
                </div>
            </div>
        `).join('');
    }

    if (initialEventsPromise) {
        allEvents = await initialEventsPromise; 
        initialEventsPromise = null; 
        checkEventExpirations(); 
        applyFilters(); 
    } else {
        await refreshGlobalEvents(); 
        applyFilters(); 
    }
}

function displayEvents(events) {
    const container = document.getElementById('events-container');
    if(!container) return;
    if (events.length === 0) {
        container.innerHTML = '<div class="col-12"><p class="text-muted">No events found matching your search.</p></div>'; return;
    }

    const now = new Date();
    container.innerHTML = events.map(e => {
        const isExpired = now > new Date(e.endDate);
        const btnState = isExpired ? 'btn-secondary disabled' : 'btn-danger';
        const btnText = isExpired ? 'Ended' : 'Book Now';
        const imgHtml = e.imageUrl ? `<img src="${e.imageUrl}" class="event-card-img" alt="${e.title}">` : '<div class="event-card-img bg-dark"></div>';
        
        let typeColor = e.eventType === 'Seated' ? 'text-info' : 'text-success';
        let typeIcon = e.eventType === 'Seated' ? '💺' : '🎫';
        let catBadge = e.category ? `<span class="badge bg-dark border border-secondary text-light">${e.category}</span>` : '';

        return `
        <div class="col-md-4">
            <div class="card event-card h-100" data-id="${e._id}" data-title="${e.title}" data-age="${e.ageLimit || 0}" data-type="${e.eventType}" data-price="${e.price || 0}" data-start="${e.startDate}" data-end="${e.endDate}" data-loc="${e.location}">
                <div class="position-relative">${imgHtml}</div>
                <div class="card-body d-flex flex-column p-4">
                    <h5 class="fw-bold mb-2 text-white">${e.title}</h5>
                    <div class="d-flex gap-2 mb-3"><span class="badge bg-dark border border-secondary ${typeColor}">${typeIcon} ${e.eventType}</span>${catBadge}</div>
                    <p class="text-muted small mb-4">${e.description || 'Experience the ultimate event.'}</p>
                    <div class="d-flex flex-column gap-2 mb-4 small" style="color: #a1a1aa;">
                        <div><span class="text-danger me-2">📅</span> ${new Date(e.startDate).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</div>
                        <div><span class="text-danger me-2">📍</span> ${e.location}</div>
                    </div>
                    <div class="d-flex justify-content-between align-items-end mt-auto pt-3 border-top" style="border-color: #262626 !important;">
                        <div><span class="text-muted d-block" style="font-size:11px;">Starting from</span><span class="fw-bold fs-5 text-white">₹${e.price || 0}</span></div>
                        <button class="btn ${btnState} fw-bold px-4 rounded-3 book-now-btn">${btnText}</button>
                    </div>
                </div>
            </div>
        </div>`
    }).join('');
}

safeBind('events-container', 'click', async (e) => {
    const card = e.target.closest('.event-card');
    if (!card || card.classList.contains('expired-card')) return;
        
    const requiredAge = parseInt(card.getAttribute('data-age'));
    currentEventType = card.getAttribute('data-type');
    currentEventPrice = parseFloat(card.getAttribute('data-price')); 

    if (requiredAge > 0) {
        const res = await fetch(`/api/profile?t=${new Date().getTime()}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return; 
        if (!data.user.dob) {
            alert(`⚠️ Age Verification Required.\nYou must update your Profile with your Date of Birth before booking this event.`);
            document.getElementById('profile-link-btn')?.click(); return;
        }
        const userAge = Math.abs(new Date(Date.now() - new Date(data.user.dob).getTime()).getUTCFullYear() - 1970);
        if (userAge < requiredAge) { alert(`🛑 Access Denied!\nThis event requires age ${requiredAge}+.`); return; }
    }

    currentEventId = card.getAttribute('data-id');
    const titleEl = document.getElementById('selected-event-title');
    if(titleEl) titleEl.innerText = card.getAttribute('data-title'); 
    
    switchView('action-section');
    document.getElementById('seated-view')?.classList.add('d-none');
    document.getElementById('general-view')?.classList.add('d-none');
    
    const dates = getNextFourDays();
    const datesContainer = document.getElementById('date-pills');
    document.getElementById('date-selection-container')?.classList.remove('d-none');
    
    let timeSlotContainer = document.getElementById('time-slot-container');
    if(timeSlotContainer) {
        timeSlotContainer.innerHTML = '';
    }
    
    if(datesContainer) {
        datesContainer.innerHTML = dates.map(d => {
            const dateStr = formatLocalYYYYMMDD(d);
            const isToday = d.getDate() === new Date().getDate();
            const line1 = isToday ? "Today" : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            const line2 = d.toLocaleDateString('en-US', { weekday: 'short' });

            return `<button class="district-date-pill" data-date="${dateStr}" aria-label="${line1}, ${line2}">
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
                currentSelectedTime = null; 
                updateOrderSummary(true); 
                document.getElementById('seated-view')?.classList.add('d-none');
                document.getElementById('general-view')?.classList.add('d-none');
                
                await fetchAndRenderTimeSlots(currentSelectedDate);
                targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            });
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('.district-date-pill')?.click(); 
    }
});

function getStatusClass(available, capacity) {
    const percentage = (available / capacity) * 100;
    if (available === 0) return 'status-sold-out';
    if (percentage >= 50) return 'status-green';
    if (percentage >= 10) return 'status-yellow';
    return 'status-red';
}

async function fetchAndRenderTimeSlots(dateStr) {
    const timeContainer = document.getElementById('time-slot-container');
    if(!timeContainer) return;
    
    timeContainer.innerHTML = '<span class="text-muted small">Loading showtimes...</span>';
    
    try {
        const res = await fetch(`/api/events/${currentEventId}/timeslots-availability?date=${dateStr}&t=${new Date().getTime()}`);
        const slotsData = await res.json();
        
        if (slotsData.length === 0) {
            timeContainer.innerHTML = '<span class="text-muted small">No showtimes configured for this event.</span>';
            return;
        }

        timeContainer.innerHTML = slotsData.map(slot => {
            const statusClass = getStatusClass(slot.available, slot.capacity);
            let statusText = statusClass.includes('green') ? 'Plenty available' : statusClass.includes('yellow') ? 'Filling fast' : 'Almost full';
            if(slot.available === 0) statusText = 'Sold out';

            return `
            <button class="time-slot-pill ${statusClass}" data-time="${slot.time}">
                <span class="fw-bold">${slot.time}</span>
                <span class="sr-only">${statusText}. ${slot.available} seats left.</span>
            </button>`;
        }).join('');

        document.querySelectorAll('.time-slot-pill').forEach(pill => {
            pill.addEventListener('click', async (e) => {
                 if(e.target.closest('.time-slot-pill').classList.contains('status-sold-out')) return;
                 
                 document.querySelectorAll('.time-slot-pill').forEach(p => p.classList.remove('active'));
                 const btn = e.target.closest('.time-slot-pill');
                 btn.classList.add('active');
                 
                 currentSelectedTime = btn.getAttribute('data-time');
                 updateOrderSummary(true);
                 await loadEventDataForDateAndTime(currentSelectedDate, currentSelectedTime, false);
            });
        });
    } catch (err) {
        timeContainer.innerHTML = '<span class="text-danger small">Failed to load showtimes.</span>';
    }
}

async function loadEventDataForDateAndTime(date, time, isSoftUpdate = false) {
    try {
        const res = await fetch(`/api/events/${currentEventId}/availability?date=${date}&timeSlot=${time}&t=${new Date().getTime()}`);
        const data = await res.json();
        
        const gView = document.getElementById('general-view');
        const sView = document.getElementById('seated-view');

        if (currentEventType === 'Seated') {
            if(gView) gView.classList.add('d-none'); 
            if(sView) sView.classList.remove('d-none');
            await renderSeatsForEvent(currentEventId, date, time);
        } else {
            if(sView) sView.classList.add('d-none'); 
            if(gView) gView.classList.remove('d-none');
            
            const qtyInput = document.getElementById('general-qty');
            const leftTxt = document.getElementById('tickets-left');
            if(leftTxt) leftTxt.innerText = data.available;
            
            if(qtyInput) {
                qtyInput.max = data.available;
                if (data.available <= 0) { qtyInput.value = 0; qtyInput.disabled = true; } 
                else { if(qtyInput.value == 0 || qtyInput.value > data.available) qtyInput.value = 1; qtyInput.disabled = false; }
            }
            updateOrderSummary();
        }
    } catch (err) { console.error("Data error."); }
}

async function renderSeatsForEvent(eventId, date, time) {
    const seatMapEl = document.getElementById('seat-map');
    if(!seatMapEl) return;

    try {
        seatMapEl.innerHTML = '<p class="text-muted text-center mt-3">Loading layout...</p>';
        const res = await fetch(`/api/seats/${eventId}?date=${date}&timeSlot=${time}&t=${new Date().getTime()}`);
        let seats = await res.json();
        
        const seatsPerRow = 14; const halfRow = seatsPerRow / 2;
        const rowsHtmlArray = [];

        for (let i = 0; i < seats.length; i += seatsPerRow) {
            const rowSeats = seats.slice(i, i + seatsPerRow);
            const rowLetter = String.fromCharCode(65 + Math.floor(i / seatsPerRow)); 
            
            let rowHtml = `<div class="d-flex align-items-center justify-content-center w-100 mb-2">`;
            rowHtml += `<div class="text-end me-3 fw-bold text-muted" style="width: 15px; font-size: 11px;">${rowLetter}</div>`;
            
            for (let j = 0; j < rowSeats.length; j++) {
                if (j === halfRow) rowHtml += `<div style="width: 30px;"></div>`; 
                let classes = 'bms-seat ' + (rowSeats[j].status === 'Available' ? 'available' : 'booked disabled');
                let dNum = rowSeats[j].seatId.replace(/\D/g, ''); 
                if(dNum.length === 1) dNum = '0' + dNum;
                rowHtml += `<button class="${classes}" data-id="${rowSeats[j].seatId}">${dNum}</button>`;
            }
            rowHtml += `</div>`;
            rowsHtmlArray.push(rowHtml);
        }
        
        seatMapEl.innerHTML = `<div class="d-flex flex-column align-items-center">${rowsHtmlArray.join('')}</div>`;
        updateOrderSummary();
    } catch (err) { 
        seatMapEl.innerHTML = '<p class="text-danger text-center">Failed to load layout.</p>';
    }
}

function updateOrderSummary(reset = false) {
    const checkoutBtn = document.getElementById('sidebar-checkout-btn');
    const seatsList = document.getElementById('summary-seats-list');
    const container = document.getElementById('summary-seats-container');
    const calcText = document.getElementById('summary-calc-text');
    const subtotalText = document.getElementById('summary-subtotal');
    const totalText = document.getElementById('summary-total');
    
    if(!checkoutBtn || !totalText) return; 

    if (reset) {
        if(seatsList) seatsList.innerHTML = ''; 
        if(container) container.classList.add('d-none');
        if(calcText) calcText.innerText = `Tickets (0)`; 
        if(subtotalText) subtotalText.innerText = '0'; 
        totalText.innerText = '0'; checkoutBtn.disabled = true; return;
    }

    let sub = 0; let count = 0;

    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('#seat-map .bms-seat.selected'))
            .map(el => el.getAttribute('data-id'))
            .filter(id => id != null && id !== 'null' && id !== '');
            
        count = selectedSeats.length;
        if(container) container.classList.toggle('d-none', count === 0);
        if(seatsList) seatsList.innerHTML = selectedSeats.map(s => `<span class="seat-pill">${s}</span>`).join('');
        if(calcText) calcText.innerText = `Regular (${count} x ₹${currentEventPrice})`;
        sub = count * currentEventPrice;
        checkoutBtn.disabled = count === 0;
    } else {
        const qtyEl = document.getElementById('general-qty');
        count = parseInt(qtyEl ? qtyEl.value : 0) || 0;
        if(container) container.classList.add('d-none');
        if(calcText) calcText.innerText = `General (${count} x ₹${currentEventPrice})`;
        sub = count * currentEventPrice;
        checkoutBtn.disabled = count === 0;
    }

    const finalTotal = sub;
    finalCheckoutTotal = finalTotal; 
    if(subtotalText) subtotalText.innerText = sub;
    totalText.innerText = finalTotal;
}

safeBind('seat-map', 'click', (e) => {
    if (e.target.classList.contains('bms-seat') && e.target.classList.contains('available')) {
        e.target.classList.toggle('selected');
        updateOrderSummary();
    }
});

safeBind('general-qty', 'input', (e) => {
    if (e.target.value === '') { updateOrderSummary(true); return; }
    let qty = parseInt(e.target.value) || 0; const max = parseInt(e.target.max) || 0;
    if (qty > max) { qty = max; e.target.value = max; }
    updateOrderSummary();
});

safeBind('general-qty', 'blur', (e) => {
    const max = parseInt(e.target.max) || 0;
    if (max > 0 && (e.target.value === '' || parseInt(e.target.value) < 1)) { e.target.value = 1; updateOrderSummary(); }
});

safeBind('sidebar-checkout-btn', 'click', () => {
    if (!currentSelectedDate || !currentSelectedTime) return;
    if (currentEventType === 'Seated') {
        const selectedSeats = Array.from(document.querySelectorAll('#seat-map .bms-seat.selected'))
            .map(el => el.getAttribute('data-id'))
            .filter(id => id != null && id !== 'null' && id !== '');
            
        if (selectedSeats.length === 0) {
            alert("Please select at least one valid seat before checking out.");
            return;
        }    
            
        pendingPaymentData = { type: 'seated', eventId: currentEventId, seats: selectedSeats, selectedDate: currentSelectedDate, timeSlot: currentSelectedTime };
    } else {
        const qty = parseInt(document.getElementById('general-qty').value);
        pendingPaymentData = { type: 'general', eventId: currentEventId, qty: qty, selectedDate: currentSelectedDate, timeSlot: currentSelectedTime };
    }

    const amtDisplay = document.getElementById('payment-amount-display');
    if(amtDisplay) amtDisplay.innerText = finalCheckoutTotal;

    if(!paymentModalInstance) {
        const pModal = document.getElementById('paymentModal');
        if(pModal && typeof bootstrap !== 'undefined') paymentModalInstance = new bootstrap.Modal(pModal);
    }
    if(paymentModalInstance) paymentModalInstance.show();
});

safeBind('confirm-payment-btn', 'click', async (e) => {
    if(!pendingPaymentData) return;
    const btn = e.target;
    if (btn.dataset.processing === "true") return;
    btn.dataset.processing = "true";

    const originalText = "Pay Securely Now";
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    btn.disabled = true;

    setTimeout(async () => {
        try {
            const endpoint = pendingPaymentData.type === 'seated' ? '/api/events/book-seats' : '/api/events/book-general';
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingPaymentData) });
            const data = await res.json();
            
            if (handlePossibleForceLogout(data)) { if(paymentModalInstance) paymentModalInstance.hide(); return; }

            if (data.success) {
                if(paymentModalInstance) paymentModalInstance.hide();
                if(pendingPaymentData.type === 'seated') { await renderSeatsForEvent(pendingPaymentData.eventId, pendingPaymentData.selectedDate, pendingPaymentData.timeSlot); } 
                else { const q = document.getElementById('general-qty'); if(q) q.value = 1; await loadEventDataForDateAndTime(pendingPaymentData.selectedDate, pendingPaymentData.timeSlot, true); }
                setTimeout(() => alert("✅ Payment Successful!\n\n" + data.message), 400);
            } else {
                if(paymentModalInstance) paymentModalInstance.hide();
                await loadEventDataForDateAndTime(pendingPaymentData.selectedDate, pendingPaymentData.timeSlot, true); 
                setTimeout(() => alert("❌ Booking Failed: " + data.message), 400);
            }
        } catch (err) { if(paymentModalInstance) paymentModalInstance.hide(); alert("Network error during payment processing.");
        } finally { btn.innerText = originalText; btn.disabled = false; btn.dataset.processing = "false"; pendingPaymentData = null; }
    }, 1500); 
});

// ==========================================
// 📋 MY BOOKINGS & PROFILE
// ==========================================
safeBind('nav-bookings-link', 'click', async (e) => {
    e.preventDefault(); switchView('tickets-section');
    const container = document.getElementById('my-tickets-container');
    if(!container) return;
    container.innerHTML = '<p class="text-muted">Loading your tickets...</p>';

    try {
        const res = await fetch(`/api/my-tickets?t=${new Date().getTime()}`);
        const tickets = await res.json();
        if (handlePossibleForceLogout(tickets)) return;

        if (tickets.length === 0) { 
            container.innerHTML = '<p class="text-muted p-4 border border-secondary rounded">You have no booked tickets yet.</p>'; 
            return; 
        }

        const grouped = tickets.reduce((acc, t) => {
            const key = `${t.eventId}-${t.bookingDate}-${t.timeSlot}`;
            if(!acc[key]) { 
                const hash = Math.abs(key.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16).toUpperCase().substring(0, 8);
                
                acc[key] = { 
                    eventTitle: t.eventTitle, 
                    date: t.bookingDate, 
                    time: t.timeSlot, 
                    location: t.location,
                    type: t.eventType, 
                    price: t.price || 0,
                    count: 0, 
                    seats: [], 
                    ids: [],
                    bookingRef: `BKM${hash}D1`
                }; 
            }
            acc[key].count++; 
            acc[key].seats.push(t.seatId); 
            acc[key].ids.push({ eventId: t.eventId, seatId: t.seatId, bookingDate: t.bookingDate, timeSlot: t.timeSlot }); 
            return acc;
        }, {});

        container.innerHTML = Object.values(grouped).map(g => {
            const totalAmount = g.price * g.count;
            const dateStr = new Date(g.date).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
            
            let seatPills = '';
            if (g.seats.length > 15) {
                seatPills = g.seats.slice(0, 15).map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ') +
                            ` <span class="seat-pill-sm" style="background: var(--brand-primary); border-color: var(--brand-primary);">+${g.seats.length - 15} more</span>`;
            } else {
                seatPills = g.seats.map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ');
            }

            return `
            <div class="card bg-transparent border mb-4 ticket-card-ui">
                <div class="d-flex flex-column flex-md-row">
                    <div class="d-flex flex-column align-items-center justify-content-center p-4 ticket-qr-section">
                        <div class="bg-white p-2 rounded mb-3" style="aspect-ratio: 1; width: 110px;">
                            <div class="qr-code-target" data-ref="${g.bookingRef}" style="width: 100%; height: 100%;"></div>
                        </div>
                        <span class="text-muted fw-bold" style="font-size: 11px; letter-spacing: 0.5px;">${g.bookingRef}</span>
                    </div>
                    <div class="p-4 flex-grow-1 position-relative" style="background-color: #0a0a0a;">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <div class="d-flex align-items-center flex-wrap gap-2">
                                <h5 class="fw-bold mb-0 text-white">${g.eventTitle}</h5>
                                <span class="badge" style="background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 10px; border-radius: 6px; padding: 4px 8px;">confirmed</span>
                            </div>
                            <div class="d-flex flex-column align-items-end">
                                <button class="btn btn-link text-white fw-bold p-0 m-0 text-decoration-none view-ticket-btn" data-ticket="${encodeURIComponent(JSON.stringify(g))}">View Ticket &gt;</button>
                                <button class="btn btn-link text-danger p-0 mt-2 small text-decoration-none cancel-ticket-btn" data-json="${encodeURIComponent(JSON.stringify(g.ids))}" style="font-size: 12px; opacity: 0.8;">Cancel</button>
                            </div>
                        </div>
                        <div class="text-muted small mb-4 d-flex flex-column gap-2" style="font-size: 13px;">
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">📅</span> ${dateStr}</div>
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">🕒</span> ${g.time}</div>
                            <div class="d-flex align-items-center"><span class="me-3 fs-6">📍</span> ${g.location}</div>
                        </div>
                        <div class="d-flex gap-5">
                            <div>
                                <div class="text-muted mb-2" style="font-size: 12px;">Seats</div>
                                <div class="d-flex flex-wrap gap-2">${seatPills}</div>
                            </div>
                            <div>
                                <div class="text-muted mb-2" style="font-size: 12px;">Amount</div>
                                <div class="fw-bold text-danger fs-5">₹${totalAmount.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
        }).join('');

        setTimeout(() => {
            const qrObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        if (el.innerHTML === "") {
                            new QRCode(el, { text: el.getAttribute('data-ref'), width: 94, height: 94, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
                        }
                        observer.unobserve(el); 
                    }
                });
            }, { rootMargin: "100px" }); 

            document.querySelectorAll('.qr-code-target').forEach(el => qrObserver.observe(el));
        }, 50);

    } catch (err) { container.innerHTML = '<p class="text-danger">Failed to load tickets.</p>'; }
});

safeBind('my-tickets-container', 'click', async (e) => {
    const cancelBtn = e.target.closest('.cancel-ticket-btn');
    if (cancelBtn) {
        const idsToCancel = JSON.parse(decodeURIComponent(cancelBtn.getAttribute('data-json')));
        if (!confirm(`Are you sure you want to cancel these ${idsToCancel.length} ticket(s)?`)) return;
        
        cancelBtn.disabled = true; cancelBtn.innerText = "Cancelling...";
        try {
            for(let idObj of idsToCancel) { await fetch('/api/events/cancel-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idObj) }); }
            document.getElementById('nav-bookings-link')?.click(); 
        } catch (err) { alert('Cancellation failed due to a network error.'); }
        return; 
    }

    const viewBtn = e.target.closest('.view-ticket-btn');
    if (viewBtn) {
        const ticketData = JSON.parse(decodeURIComponent(viewBtn.getAttribute('data-ticket')));
        showTicketDetail(ticketData);
    }
});

function showTicketDetail(ticketData) {
    switchView('ticket-detail-section');
    const container = document.getElementById('ticket-detail-container');
    if (!container) return;
    
    const dateStr = new Date(ticketData.date).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
    const totalAmount = ticketData.price * ticketData.count;
    const seatPills = ticketData.seats.map(s => `<span class="seat-pill-sm">${s.replace('GA-', '')}</span>`).join(' ');
    
    const usernameBadge = document.getElementById('username-badge');
    const username = usernameBadge ? usernameBadge.innerText : 'User';
    const bookedOnStr = new Date(ticketData.date).toLocaleDateString('en-GB');

    container.innerHTML = `
    <div class="ticket-detail-wrapper shadow-lg" id="pdf-target-wrapper">
        <div class="ticket-detail-header">
            <div><div style="font-size: 13px; opacity: 0.9; margin-bottom: 2px;">Booking ID</div><h4 class="mb-0 fw-bold">${ticketData.bookingRef}</h4></div>
            <span class="badge bg-white text-danger px-4 py-2 border-0" style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">CONFIRMED</span>
        </div>
        <div class="ticket-detail-body d-flex flex-column flex-md-row gap-5 align-items-center align-items-md-start">
            <div class="d-flex flex-column align-items-center">
                <div class="ticket-detail-qr-container mb-3" style="width: 150px; height: 150px;"><div id="full-ticket-qr" style="width: 100%; height: 100%;"></div></div>
                <span class="text-muted small">Scan at venue entry</span>
            </div>
            <div class="flex-grow-1 w-100">
                <h3 class="fw-bold text-white mb-4">${ticketData.eventTitle}</h3>
                <div class="text-muted mb-4 d-flex flex-column gap-3" style="font-size: 15px;">
                    <div class="d-flex align-items-center"><span class="me-3 text-danger fs-5">📅</span> ${dateStr}</div>
                    <div class="d-flex align-items-center"><span class="me-3 text-danger fs-5">🕒</span> ${ticketData.time}</div>
                    <div class="d-flex align-items-center"><span class="me-3 text-danger fs-5">📍</span> ${ticketData.location}</div>
                </div>
                <div class="mb-4"><div class="text-muted mb-2 small">Seats</div><div class="d-flex flex-wrap gap-2">${seatPills}</div></div>
                <div class="d-flex justify-content-between align-items-center mt-5 p-4 rounded" style="background-color: rgba(255,255,255,0.03);">
                    <span class="text-muted">Total Paid</span><span class="fw-bold text-danger fs-3">₹${totalAmount.toLocaleString()}</span>
                </div>
            </div>
        </div>
    </div>
    
    <div class="d-flex justify-content-center gap-3 mb-5 pb-5 mt-4">
        <button id="download-pdf-btn" class="btn btn-outline-secondary text-white border-dark px-4 py-2 fw-bold d-flex align-items-center gap-2"><span class="fs-5">📥</span> Download PDF</button>
        <button id="detail-back-home-btn" class="btn btn-dark px-4 py-2 fw-bold border-secondary d-flex align-items-center gap-2"><span>🏠</span> Back to Home</button>
    </div>`;

    setTimeout(() => {
        const qrContainer = document.getElementById('full-ticket-qr');
        if (qrContainer) {
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, { text: ticketData.bookingRef, width: 126, height: 126, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.M });
        }
    }, 50);

    safeBind('download-pdf-btn', 'click', () => {
        if (typeof html2pdf === 'undefined') {
            alert("PDF engine is still loading. Please wait a second and try again.");
            return;
        }

        const btn = document.getElementById('download-pdf-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Generating PDF...';
        btn.disabled = true;

        const element = document.getElementById('pdf-target-wrapper');
        const opt = {
            margin:       0.2,
            filename:     `TicketHub_${ticketData.bookingRef}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#121212' },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    });

    safeBind('detail-back-home-btn', 'click', () => { document.getElementById('home-logo')?.click(); });
}

safeBind('profile-link-btn', 'click', async (e) => {
    e.preventDefault(); switchView('profile-section');
    const alertBox = document.getElementById('profile-alert'); if(alertBox) alertBox.classList.add('d-none');
    try {
        const res = await fetch(`/api/profile?t=${new Date().getTime()}`);
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;

        if (data.success) {
            const u = document.getElementById('profile-username'); if(u) u.value = data.user.username; 
            const f = document.getElementById('profile-fullname'); if(f) f.value = data.user.fullName || ''; 
            const em = document.getElementById('profile-email'); if(em) em.value = data.user.email || ''; 
            const p = document.getElementById('profile-phone'); if(p) p.value = data.user.phone || ''; 
            const a = document.getElementById('profile-address'); if(a) a.value = data.user.address || '';
            const dob = document.getElementById('profile-dob'); const age = document.getElementById('profile-age');
            if (data.user.dob && age) {
                const dateString = new Date(data.user.dob).toISOString().split('T')[0];
                dob.value = dateString; age.value = Math.abs(new Date(Date.now() - new Date(dateString).getTime()).getUTCFullYear() - 1970);
            } else if (dob && age) { dob.value = ''; age.value = ''; }
        }
    } catch (err) {}
});

safeBind('profile-form', 'submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('profile-submit-btn'); const alertBox = document.getElementById('profile-alert');
    const userEl = document.getElementById('profile-username'); if(!userEl) return;
    if(submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Saving..."; }
    
    try {
        const payload = { username: userEl.value.trim(), fullName: document.getElementById('profile-fullname')?.value, email: document.getElementById('profile-email')?.value, phone: document.getElementById('profile-phone')?.value, dob: document.getElementById('profile-dob')?.value, address: document.getElementById('profile-address')?.value };
        const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (handlePossibleForceLogout(data)) return;
        
        if(alertBox) { alertBox.classList.remove('d-none', 'alert-danger', 'alert-success'); alertBox.classList.add(data.success ? 'alert-success' : 'alert-danger'); alertBox.innerText = data.message; }
        if(data.success) {
            const badge = document.getElementById('username-badge'); if(badge) badge.innerText = data.newUsername || userEl.value.trim();
            setTimeout(() => { switchView('booking-section'); if(submitBtn){submitBtn.disabled = false; submitBtn.innerText = "Save Changes";} }, 1500);
        } else if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Save Changes"; }
    } catch (err) {}
});

safeBind('profile-dob', 'change', (e) => {
    const ageInput = document.getElementById('profile-age');
    if(ageInput && e.target.value) ageInput.value = Math.abs(new Date(Date.now() - new Date(e.target.value).getTime()).getUTCFullYear() - 1970);
});

// ==========================================
// 📱 MOBILE NAVBAR AUTO-CLOSE FIX
// ==========================================
document.addEventListener('click', (event) => {
    const mobileNavbar = document.getElementById('mobileNavbar');
    const toggler = document.querySelector('.navbar-toggler');
    
    // If the menu is open and the click was outside both the menu and the toggler button
    if (mobileNavbar && mobileNavbar.classList.contains('show')) {
        if (!mobileNavbar.contains(event.target) && !toggler.contains(event.target)) {
            // Use Bootstrap's native collapse API to hide it smoothly
            if (typeof bootstrap !== 'undefined') {
                const bsCollapse = bootstrap.Collapse.getInstance(mobileNavbar);
                if (bsCollapse) {
                    bsCollapse.hide();
                } else {
                    mobileNavbar.classList.remove('show');
                }
            }
        }
    }
});

(async function initializeApp() {
    const initLoader = document.getElementById('initial-loader');
    const hideLoader = () => { if (initLoader) { initLoader.style.display = 'none'; initLoader.classList.add('d-none'); } };

    try {
        const controller = new AbortController(); 
        const timeoutId = setTimeout(() => controller.abort(), 15000); 
        const res = await fetch(`/api/check-session?t=${new Date().getTime()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Server error.");
        
        const data = await res.json();
        hideLoader();
        if (data.loggedIn) showBookingScreen(data.username, data.isAdmin);
        else { switchView('auth-section'); }
    } catch (err) {
        hideLoader(); switchView('auth-section');
    }
})();
