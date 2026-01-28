// API Base URL
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('token-date').value = today;
    document.getElementById('schedule-date').value = today;
    document.getElementById('simulate-date').value = today;
    document.getElementById('today-date').textContent = today;

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.getAttribute('data-page');
            showPage(page);
        });
    });

    // Forms
    document.getElementById('doctor-form').addEventListener('submit', handleAddDoctor);
    document.getElementById('token-form').addEventListener('submit', handleAllocateToken);
    document.getElementById('schedule-form').addEventListener('submit', handleViewSchedule);
    document.getElementById('simulate-form').addEventListener('submit', handleSimulate);

    // Load initial data
    loadDoctors();
    updateDashboard();
}

function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    document.getElementById(`${pageName}-page`).classList.add('active');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-page') === pageName) {
            btn.classList.add('active');
        }
    });

    // Load data for specific pages
    if (pageName === 'doctors') {
        loadDoctors();
    } else if (pageName === 'schedule') {
        loadDoctorsForSelect('schedule-doctor');
    } else if (pageName === 'allocate') {
        loadDoctorsForSelect('token-doctor');
    } else if (pageName === 'dashboard') {
        updateDashboard();
    }
}

// API Functions
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'An error occurred');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// Dashboard
async function updateDashboard() {
    try {
        const stats = await apiCall('/stats');
        document.getElementById('total-doctors').textContent = stats.doctors ?? 0;
        document.getElementById('total-tokens').textContent = stats.tokens ?? 0;
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

// Doctors
async function loadDoctors() {
    try {
        const doctors = await apiCall('/doctors');
        displayDoctors(doctors);
        loadDoctorsForSelect('token-doctor');
        loadDoctorsForSelect('schedule-doctor');
    } catch (error) {
        showResult('doctors-list', 'Error loading doctors: ' + error.message, 'error');
    }
}

async function loadDoctorsForSelect(selectId) {
    try {
        const doctors = await apiCall('/doctors');
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Select a doctor...</option>';
        doctors.forEach(doctor => {
            const option = document.createElement('option');
            option.value = doctor.id;
            option.textContent = doctor.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading doctors for select:', error);
    }
}

function displayDoctors(doctors) {
    const container = document.getElementById('doctors-list');
    
    if (doctors.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No doctors registered yet. Add one above!</p></div>';
        return;
    }

    container.innerHTML = doctors.map(doctor => `
        <div class="doctor-card">
            <h4>${escapeHtml(doctor.name)}</h4>
            <div class="doctor-info">⏰ ${doctor.startTime} - ${doctor.endTime}</div>
            <div class="doctor-info">⏱️ Slot Duration: ${doctor.slotDurationMinutes} minutes</div>
            <div class="doctor-info">👥 Max Patients per Slot: ${doctor.maxPatientsPerSlot}</div>
        </div>
    `).join('');
}

async function handleAddDoctor(e) {
    e.preventDefault();
    
    const doctor = {
        name: document.getElementById('doctor-name').value,
        startTime: document.getElementById('doctor-start-time').value,
        endTime: document.getElementById('doctor-end-time').value,
        slotDurationMinutes: parseInt(document.getElementById('doctor-slot-duration').value),
        maxPatientsPerSlot: parseInt(document.getElementById('doctor-max-patients').value)
    };

    try {
        const result = await apiCall('/doctors', {
            method: 'POST',
            body: JSON.stringify(doctor)
        });

        showResult('doctor-form', 'Doctor added successfully!', 'success');
        document.getElementById('doctor-form').reset();
        loadDoctors();
        updateDashboard();
    } catch (error) {
        showResult('doctor-form', 'Error: ' + error.message, 'error');
    }
}

// Token Allocation
async function handleAllocateToken(e) {
    e.preventDefault();
    
    const tokenData = {
        doctorId: document.getElementById('token-doctor').value,
        date: document.getElementById('token-date').value,
        patientName: document.getElementById('token-patient-name').value,
        source: document.getElementById('token-source').value,
        emergency: document.getElementById('token-emergency').checked
    };

    try {
        const result = await apiCall('/tokens/allocate', {
            method: 'POST',
            body: JSON.stringify(tokenData)
        });

        const resultBox = document.getElementById('token-result');
        resultBox.className = 'result-box success';
        resultBox.innerHTML = `
            <h4>✅ Token Allocated Successfully!</h4>
            <p><strong>Token ID:</strong> ${result.id}</p>
            <p><strong>Patient:</strong> ${escapeHtml(result.patientName)}</p>
            <p><strong>Source:</strong> ${result.source}</p>
            <p><strong>Status:</strong> ${result.status}</p>
            <p><strong>Priority Score:</strong> ${result.priorityScore}</p>
        `;

        document.getElementById('token-form').reset();
        document.getElementById('token-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('token-emergency').checked = false;
        loadDoctorsForSelect('token-doctor');
        updateDashboard();
    } catch (error) {
        const resultBox = document.getElementById('token-result');
        resultBox.className = 'result-box error';
        resultBox.innerHTML = `<p><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
    }
}

// Schedule
async function handleViewSchedule(e) {
    e.preventDefault();
    
    const doctorId = document.getElementById('schedule-doctor').value;
    const date = document.getElementById('schedule-date').value;

    try {
        const result = await apiCall(`/doctors/${doctorId}/schedule?date=${date}`);
        displaySchedule(result);
    } catch (error) {
        const resultBox = document.getElementById('schedule-result');
        resultBox.innerHTML = `<div class="result-box error"><p><strong>Error:</strong> ${escapeHtml(error.message)}</p></div>`;
    }
}

function displaySchedule(data) {
    const container = document.getElementById('schedule-result');
    
    if (!data.schedule || data.schedule.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No schedule available for this date.</p></div>';
        return;
    }

    let html = `
        <div class="schedule-doctor-info">
            <h3>${escapeHtml(data.doctor.name)}</h3>
            <p><strong>Date:</strong> ${data.date}</p>
            <p><strong>Working Hours:</strong> ${data.doctor.startTime} - ${data.doctor.endTime}</p>
        </div>
        <div class="slots-list">
    `;

    data.schedule.forEach(slot => {
        html += `
            <div class="slot-card">
                <div class="slot-header">
                    <span class="slot-time">${slot.startTime} - ${slot.endTime}</span>
                    <span class="slot-capacity">${slot.booked}/${slot.capacity} booked</span>
                </div>
                <div class="tokens-list">
        `;

        if (slot.tokens && slot.tokens.length > 0) {
            slot.tokens.forEach(token => {
                const badgeClass = getBadgeClass(token.source);
                html += `
                    <div class="token-item">
                        <div class="token-info">
                            <div class="token-name">${escapeHtml(token.patientName)}</div>
                            <div class="token-source">${token.source} • Priority: ${token.priorityScore}</div>
                        </div>
                        <div class="token-badges">
                            <span class="badge ${badgeClass}">${token.source}</span>
                            ${token.status !== 'SCHEDULED' ? `<span class="badge badge-danger">${token.status}</span>` : ''}
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div class="empty-state"><p>No tokens allocated</p></div>';
        }

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Simulation
async function handleSimulate(e) {
    e.preventDefault();
    
    const date = document.getElementById('simulate-date').value;

    try {
        const result = await apiCall('/simulate/day', {
            method: 'POST',
            body: JSON.stringify({ date })
        });

        displaySimulationResults(result);
        loadDoctors();
        updateDashboard();
    } catch (error) {
        const resultBox = document.getElementById('simulate-result');
        resultBox.className = 'result-box error';
        resultBox.innerHTML = `<p><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
    }
}

function displaySimulationResults(data) {
    const container = document.getElementById('simulate-result');
    
    let html = `
        <div class="result-box success">
            <h3>✅ Simulation Completed Successfully!</h3>
            <p><strong>Date:</strong> ${data.date}</p>
            <p><strong>Total Events:</strong> ${data.events.length}</p>
        </div>
        <div class="simulation-results">
            <h3>Events Summary</h3>
            <div class="event-list">
    `;

    // Group events by type
    const eventsByType = {};
    data.events.forEach(event => {
        if (!eventsByType[event.type]) {
            eventsByType[event.type] = [];
        }
        eventsByType[event.type].push(event);
    });

    Object.keys(eventsByType).forEach(type => {
        html += `
            <div class="event-item">
                <div class="event-type">${type} (${eventsByType[type].length})</div>
            </div>
        `;
    });

    html += `
            </div>
            <h3 style="margin-top: 30px;">Schedules</h3>
    `;

    data.schedules.forEach(schedule => {
        html += `
            <div class="schedule-doctor-info" style="margin-top: 20px;">
                <h3>${escapeHtml(schedule.doctor.name)}</h3>
            </div>
        `;

        schedule.schedule.forEach(slot => {
            html += `
                <div class="slot-card">
                    <div class="slot-header">
                        <span class="slot-time">${slot.startTime} - ${slot.endTime}</span>
                        <span class="slot-capacity">${slot.booked}/${slot.capacity} booked</span>
                    </div>
                    <div class="tokens-list">
            `;

            if (slot.tokens && slot.tokens.length > 0) {
                slot.tokens.forEach(token => {
                    const badgeClass = getBadgeClass(token.source);
                    html += `
                        <div class="token-item">
                            <div class="token-info">
                                <div class="token-name">${escapeHtml(token.patientName)}</div>
                                <div class="token-source">${token.source}</div>
                            </div>
                            <div class="token-badges">
                                <span class="badge ${badgeClass}">${token.source}</span>
                            </div>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
        });
    });

    html += '</div>';
    container.innerHTML = html;
}

// Helper Functions
function showResult(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const resultBox = document.createElement('div');
    resultBox.className = `result-box ${type}`;
    resultBox.innerHTML = `<p>${escapeHtml(message)}</p>`;
    
    // Remove existing result boxes
    const existing = element.querySelector('.result-box');
    if (existing) {
        existing.remove();
    }
    
    element.appendChild(resultBox);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        resultBox.remove();
    }, 5000);
}

function getBadgeClass(source) {
    const classes = {
        'EMERGENCY': 'badge-emergency',
        'PAID': 'badge-paid',
        'ONLINE': 'badge-online',
        'WALK_IN': 'badge-walkin',
        'FOLLOW_UP': 'badge-followup'
    };
    return classes[source] || '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make showPage available globally
window.showPage = showPage;
