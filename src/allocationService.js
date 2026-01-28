const dayjs = require('dayjs');
const { nanoid } = require('nanoid');
const { db } = require('./db');
const config = require('./config');

// Helper: create time slots for a doctor for a given day if they don't exist yet.
function generateSlotsForDay(doctor, date) {
  const dateStr = date;
  const existing = db.data.slots.filter(
    (s) => s.doctorId === doctor.id && s.date === dateStr
  );
  if (existing.length > 0) return existing;

  const start = dayjs(`${dateStr}T${doctor.startTime}`);
  const end = dayjs(`${dateStr}T${doctor.endTime}`);
  const slots = [];
  let current = start;

  while (current.isBefore(end)) {
    const slotEnd = current.add(doctor.slotDurationMinutes, 'minute');
    slots.push({
      id: nanoid(),
      doctorId: doctor.id,
      date: dateStr,
      startTime: current.format('HH:mm'),
      endTime: slotEnd.format('HH:mm'),
      capacity: doctor.maxPatientsPerSlot
    });
    current = slotEnd;
  }

  db.data.slots.push(...slots);
  return slots;
}

function getPriorityScore(source) {
  return config.priorities[source] || 0;
}

function getDoctorById(doctorId) {
  return db.data.doctors.find((d) => d.id === doctorId);
}

function getSlotsForDoctorDay(doctorId, date) {
  return db.data.slots
    .filter((s) => s.doctorId === doctorId && s.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getTokensForSlot(slotId) {
  return db.data.tokens
    .filter((t) => t.slotId === slotId && t.status === 'SCHEDULED')
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

// Core allocation logic for normal and emergency bookings.
function allocateToken({ doctorId, date, source, patientName, emergency = false }) {
  const normalizedSource = emergency ? 'EMERGENCY' : source;
  if (!config.tokenSources.includes(normalizedSource)) {
    throw new Error('Invalid token source');
  }

  const doctor = getDoctorById(doctorId);
  if (!doctor) {
    throw new Error('Doctor not found');
  }

  // Ensure slots exist for the requested day.
  generateSlotsForDay(doctor, date);
  const slots = getSlotsForDoctorDay(doctorId, date);

  const priorityScore = getPriorityScore(normalizedSource);

  // Helper that actually creates and stores a token in a given slot.
  const createTokenInSlot = (slot) => {
    const token = {
      id: nanoid(),
      doctorId,
      slotId: slot.id,
      date,
      patientName,
      source: normalizedSource,
      priorityScore,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString()
    };
    db.data.tokens.push(token);
    return token;
  };

  // First try simple allocation into the earliest slot with free capacity.
  for (const slot of slots) {
    const scheduled = getTokensForSlot(slot.id);
    if (scheduled.length < slot.capacity) {
      return createTokenInSlot(slot);
    }
  }

  // If not emergency, we stop here: OPD is fully booked.
  if (!emergency) {
    return null;
  }

  // Emergency path: try to bump a lower-priority token to a later slot.
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const scheduled = getTokensForSlot(slot.id);
    if (scheduled.length < slot.capacity) {
      // rare case if capacity freed since previous loop
      return createTokenInSlot(slot);
    }

    // Find lowest-priority token in this slot.
    const lowest = scheduled[scheduled.length - 1];
    if (!lowest || lowest.priorityScore >= priorityScore) {
      continue; // cannot bump equal or higher priority
    }

    // Search later slots for a place to move the bumped token.
    for (let j = i + 1; j < slots.length; j++) {
      const laterSlot = slots[j];
      const laterScheduled = getTokensForSlot(laterSlot.id);
      if (laterScheduled.length < laterSlot.capacity) {
        // Move lowest-priority token to later slot.
        lowest.slotId = laterSlot.id;
        // Now there is room in the original slot for the emergency.
        return createTokenInSlot(slot);
      }
    }
  }

  // No way to squeeze emergency patient.
  return null;
}

// When a token is cancelled or marked no-show, we try to pull the
// highest-priority later token into this earlier free slot.
function rebalanceAfterFreeSlot(doctorId, date, freedSlotId) {
  const slots = getSlotsForDoctorDay(doctorId, date);
  const freedIndex = slots.findIndex((s) => s.id === freedSlotId);
  if (freedIndex === -1) return;

  for (let i = freedIndex + 1; i < slots.length; i++) {
    const laterSlot = slots[i];
    const laterTokens = getTokensForSlot(laterSlot.id);
    if (!laterTokens.length) continue;

    // Pick the highest-priority token from later slot.
    const candidate = laterTokens[0];
    candidate.slotId = freedSlotId;
    return;
  }
}

function cancelToken(tokenId) {
  const token = db.data.tokens.find((t) => t.id === tokenId);
  if (!token || token.status !== 'SCHEDULED') {
    return null;
  }
  token.status = 'CANCELLED';
  rebalanceAfterFreeSlot(token.doctorId, token.date, token.slotId);
  return token;
}

function markNoShow(tokenId) {
  const token = db.data.tokens.find((t) => t.id === tokenId);
  if (!token || token.status !== 'SCHEDULED') {
    return null;
  }
  token.status = 'NO_SHOW';
  rebalanceAfterFreeSlot(token.doctorId, token.date, token.slotId);
  return token;
}

function getSchedule(doctorId, date) {
  const slots = getSlotsForDoctorDay(doctorId, date);
  return slots.map((slot) => {
    const scheduled = getTokensForSlot(slot.id);
    return {
      slotId: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: slot.capacity,
      booked: scheduled.length,
      tokens: scheduled.map((t) => ({
        id: t.id,
        patientName: t.patientName,
        source: t.source,
        priorityScore: t.priorityScore,
        status: t.status
      }))
    };
  });
}

module.exports = {
  allocateToken,
  cancelToken,
  markNoShow,
  getSchedule,
  generateSlotsForDay
};


