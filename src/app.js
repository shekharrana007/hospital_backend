const express = require('express');
const path = require('path');
const { nanoid } = require('nanoid');
const { db } = require('./db');
const config = require('./config');
const {
  allocateToken,
  cancelToken,
  markNoShow,
  getSchedule
} = require('./allocationService');

const app = express();
app.use(express.json());

// --- Serve static files (CSS, JS, images) ---
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));

// --- Simple middleware to log each request (helps understanding flow) ---
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// --- Root endpoint - serve HTML UI ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- API Info endpoint ---
app.get('/api', (req, res) => {
  res.json({
    message: 'OPD Token Allocation Engine API',
    version: '1.0.0',
    endpoints: {
      ui: 'GET /',
      health: 'GET /api/health',
      stats: 'GET /api/stats',
      doctors: {
        list: 'GET /api/doctors',
        create: 'POST /api/doctors',
        schedule: 'GET /api/doctors/:id/schedule?date=YYYY-MM-DD'
      },
      tokens: {
        allocate: 'POST /api/tokens/allocate',
        cancel: 'POST /api/tokens/:id/cancel',
        noShow: 'POST /api/tokens/:id/no-show'
      },
      simulation: 'POST /api/simulate/day'
    }
  });
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Simple stats for UI/dashboard ---
app.get('/api/stats', (req, res) => {
  const doctors = db.data.doctors.length;
  const slots = db.data.slots.length;
  const tokens = db.data.tokens.length;

  const tokensByStatus = db.data.tokens.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    doctors,
    slots,
    tokens,
    tokensByStatus
  });
});

// --- Doctor management ---

// Create a doctor with working hours and slot configuration.
app.post('/api/doctors', async (req, res) => {
  const { name, startTime, endTime, slotDurationMinutes, maxPatientsPerSlot } =
    req.body;

  if (!name || !startTime || !endTime || !slotDurationMinutes || !maxPatientsPerSlot) {
    return res
      .status(400)
      .json({ message: 'name, startTime, endTime, slotDurationMinutes, maxPatientsPerSlot are required' });
  }

  const doctor = {
    id: nanoid(),
    name,
    startTime,
    endTime,
    slotDurationMinutes,
    maxPatientsPerSlot
  };

  db.data.doctors.push(doctor);
  await db.write();

  res.status(201).json(doctor);
});

app.get('/api/doctors', (req, res) => {
  res.json(db.data.doctors);
});

// --- Token allocation & management ---

// Allocate a token (normal or emergency).
app.post('/api/tokens/allocate', async (req, res) => {
  const { doctorId, date, source, patientName, emergency } = req.body;

  if (!doctorId || !date || !patientName) {
    return res
      .status(400)
      .json({ message: 'doctorId, date (YYYY-MM-DD), and patientName are required' });
  }

  try {
    const token = allocateToken({
      doctorId,
      date,
      source,
      patientName,
      emergency: Boolean(emergency)
    });

    if (!token) {
      return res
        .status(409)
        .json({ message: 'No available slot for this request, even after reallocation' });
    }

    await db.write();
    res.status(201).json(token);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Cancel a token.
app.post('/api/tokens/:id/cancel', async (req, res) => {
  const updated = cancelToken(req.params.id);
  if (!updated) {
    return res.status(404).json({ message: 'Token not found or not cancellable' });
  }
  await db.write();
  res.json(updated);
});

// Mark as no-show.
app.post('/api/tokens/:id/no-show', async (req, res) => {
  const updated = markNoShow(req.params.id);
  if (!updated) {
    return res.status(404).json({ message: 'Token not found or not markable as no-show' });
  }
  await db.write();
  res.json(updated);
});

// View schedule for a doctor for a day.
app.get('/api/doctors/:id/schedule', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
  }
  const doctor = db.data.doctors.find((d) => d.id === req.params.id);
  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }
  const schedule = getSchedule(req.params.id, date);
  res.json({ doctor, date, schedule });
});

// --- Simulation endpoint ---
// This creates 3 doctors and simulates a full OPD day with mixed bookings,
// cancellations, no-shows, and emergency insertions.

app.post('/api/simulate/day', async (req, res) => {
  // Reset DB to a clean state
  db.data.doctors = [];
  db.data.slots = [];
  db.data.tokens = [];

  // Create three doctors with simple 9-11 schedule (two hours) and 15-min slots.
  const doctors = [
    {
      id: nanoid(),
      name: 'Dr. A - General Physician',
      startTime: '09:00',
      endTime: '11:00',
      slotDurationMinutes: 15,
      maxPatientsPerSlot: 4
    },
    {
      id: nanoid(),
      name: 'Dr. B - Orthopedics',
      startTime: '09:00',
      endTime: '11:00',
      slotDurationMinutes: 15,
      maxPatientsPerSlot: 3
    },
    {
      id: nanoid(),
      name: 'Dr. C - Pediatrics',
      startTime: '10:00',
      endTime: '12:00',
      slotDurationMinutes: 15,
      maxPatientsPerSlot: 4
    }
  ];
  db.data.doctors.push(...doctors);

  const today = req.body.date || new Date().toISOString().slice(0, 10);

  const events = [];

  function logEvent(type, payload) {
    events.push({ type, ...payload });
  }

  // Morning online bookings
  for (let i = 0; i < 8; i++) {
    const token = allocateToken({
      doctorId: doctors[0].id,
      date: today,
      source: 'ONLINE',
      patientName: `Online Patient G${i + 1}`
    });
    logEvent('ONLINE_BOOKING', { doctor: doctors[0].name, token });
  }

  // Paid priority patients
  for (let i = 0; i < 3; i++) {
    const token = allocateToken({
      doctorId: doctors[1].id,
      date: today,
      source: 'PAID',
      patientName: `Paid Ortho P${i + 1}`
    });
    logEvent('PAID_BOOKING', { doctor: doctors[1].name, token });
  }

  // Walk-ins
  for (let i = 0; i < 5; i++) {
    const doc = i % 2 === 0 ? doctors[0] : doctors[2];
    const token = allocateToken({
      doctorId: doc.id,
      date: today,
      source: 'WALK_IN',
      patientName: `Walk-in ${i + 1}`
    });
    logEvent('WALK_IN', { doctor: doc.name, token });
  }

  // Follow-up patients
  for (let i = 0; i < 4; i++) {
    const token = allocateToken({
      doctorId: doctors[2].id,
      date: today,
      source: 'FOLLOW_UP',
      patientName: `Follow-up Child ${i + 1}`
    });
    logEvent('FOLLOW_UP', { doctor: doctors[2].name, token });
  }

  // Cancellations and no-shows: cancel first token, mark second as no-show.
  if (db.data.tokens.length >= 2) {
    const cancelled = cancelToken(db.data.tokens[0].id);
    logEvent('CANCEL', { token: cancelled });
    const noShow = markNoShow(db.data.tokens[1].id);
    logEvent('NO_SHOW', { token: noShow });
  }

  // Emergency patients: these may bump lower-priority patients.
  for (let i = 0; i < 3; i++) {
    const doc = i % 2 === 0 ? doctors[0] : doctors[1];
    const token = allocateToken({
      doctorId: doc.id,
      date: today,
      source: 'PAID', // base source
      patientName: `Emergency Case ${i + 1}`,
      emergency: true
    });
    logEvent('EMERGENCY', { doctor: doc.name, token });
  }

  await db.write();

  const schedules = doctors.map((d) => ({
    doctor: d,
    schedule: getSchedule(d.id, today)
  }));

  res.json({
    date: today,
    events,
    schedules
  });
});

// Fallback 404 handler for unknown routes.
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

module.exports = app;


