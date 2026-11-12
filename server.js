const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const COURSE_CODES = ['BPA 213', 'BPA 216'];
const FARM = {
  latitude: 7.3025,
  longitude: 5.1520,
  radiusMeters: 250
};

const MASTER_ROSTER = [
  { matric: '13044', name: 'Afe Oluwatamilore John', programme: 'COMPUTER SCIENCE' },
  { matric: '13080', name: 'James Endurance Moses', programme: 'COMPUTER SCIENCE' },
  { matric: '13094', name: 'Olanrewaju Temitope Feyintoluwa', programme: 'COMPUTER SCIENCE' },
  { matric: '13123', name: 'Sunday Mathew Friday', programme: 'COMPUTER SCIENCE' },
  { matric: '13747', name: 'Arowolo Festus Odunayo', programme: 'CHEMISTRY EDUCATION' },
  { matric: '16323', name: 'Muraina Fathia Boluwatife', programme: 'MICROBIOLOGY' },
  { matric: '16432', name: 'Ajayi Samuel Oluwatimilehin', programme: 'LIBRARY AND INFORMATION SCIENCE' },
  { matric: '19830', name: 'Abdulazeez Ameerah Ololade', programme: 'ACCOUNTING' },
  { matric: '19831', name: 'Abdullahi Lateef Olamilekan', programme: 'ACCOUNTING' },
  { matric: '19832', name: 'Abdulsalami Toheeb Oziandu', programme: 'ACCOUNTING' },
  { matric: '21001', name: 'Adebayo Michael Oluwaseun', programme: 'AGRICULTURAL SCIENCE' },
  { matric: '21002', name: 'Olatunji Grace Funmilayo', programme: 'PUBLIC HEALTH' },
  { matric: '21003', name: 'Eze Chidera Blessing', programme: 'CRIMINOLOGY AND SECURITY STUDIES' },
  { matric: '21004', name: 'Balogun Temitope David', programme: 'MASS COMMUNICATION' },
  { matric: '21005', name: 'Ojo Oluwadamilola Mary', programme: 'SCIENCE LABORATORY TECHNOLOGY' }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ registrations: [], attendance: [] }, null, 2));
  }
}

function readStore() {
  ensureDataDir();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function normalizeMatric(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeAbsenceList(registrations, attendance) {
  const present = new Set(attendance.map((entry) => `${entry.matric}|${entry.course}`));
  return registrations
    .filter((reg) => !present.has(`${reg.matric}|${reg.course}`))
    .map((reg) => ({
      course: reg.course,
      matric: reg.matric,
      name: reg.name,
      status: 'Absent (No valid sign-in)'
    }));
}

function buildAdminSummary() {
  const store = readStore();
  const registrations = store.registrations || [];
  const attendance = store.attendance || [];

  const counts = {
    BPA213Registered: registrations.filter((r) => r.course === 'BPA 213').length,
    BPA216Registered: registrations.filter((r) => r.course === 'BPA 216').length,
    BPA213Attendance: attendance.filter((a) => a.course === 'BPA 213').length,
    BPA216Attendance: attendance.filter((a) => a.course === 'BPA 216').length
  };

  return {
    counts,
    registrations,
    attendance,
    absences: computeAbsenceList(registrations, attendance)
  };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/api/roster', (req, res) => {
  const query = sanitizeText(req.query.q || '').toLowerCase();
  let results = MASTER_ROSTER;

  if (query) {
    results = MASTER_ROSTER.filter((student) => {
      return student.matric.toLowerCase().includes(query) || student.name.toLowerCase().includes(query);
    });
  }

  res.json(results.slice(0, 20));
});

app.get('/api/admin', (req, res) => {
  res.json(buildAdminSummary());
});

app.post('/api/reset', (req, res) => {
  writeStore({ registrations: [], attendance: [] });
  res.json({ success: true, message: 'All records cleared.' });
});

app.post('/api/register', (req, res) => {
  const body = req.body || {};
  const matric = normalizeMatric(body.matric);
  const name = sanitizeText(body.name);
  const programme = sanitizeText(body.programme);
  const phone = sanitizeText(body.phone);
  const course = sanitizeText(body.course);
  const photo = sanitizeText(body.photo || '');
  const deviceId = sanitizeText(body.deviceId || 'unknown');

  if (!matric || !name || !programme || !phone || !course) {
    return res.status(400).json({ success: false, message: 'Missing fields. Please complete the form.' });
  }

  if (!COURSE_CODES.includes(course)) {
    return res.status(400).json({ success: false, message: 'Invalid course selected.' });
  }

  const store = readStore();
  const alreadyExists = store.registrations.some((reg) => reg.matric === matric && reg.course === course);
  if (alreadyExists) {
    return res.status(409).json({ success: false, message: 'This student is already registered for the selected course.' });
  }

  const registration = {
    matric,
    name,
    programme,
    phone,
    course,
    photo,
    deviceId,
    createdAt: new Date().toISOString()
  };

  store.registrations.push(registration);
  writeStore(store);

  res.status(201).json({ success: true, registration });
});

app.post('/api/attendance', (req, res) => {
  const body = req.body || {};
  const matric = normalizeMatric(body.matric);
  const course = sanitizeText(body.course);
  const session = sanitizeText(body.session);
  const deviceId = sanitizeText(body.deviceId || '');
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!COURSE_CODES.includes(course)) {
    return res.status(400).json({ success: false, message: 'Invalid course selected.' });
  }

  if (!session) {
    return res.status(400).json({ success: false, message: 'Please select a session.' });
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ success: false, message: 'Location data is required to sign in.' });
  }

  const store = readStore();
  const registration = store.registrations.find((reg) => reg.matric === matric && reg.course === course);

  if (!registration) {
    return res.status(404).json({ success: false, message: 'Student is not registered for this course.' });
  }

  if (registration.deviceId !== deviceId) {
    return res.status(403).json({ success: false, message: 'This student is registered on a different device. Use the approved device only.' });
  }

  const distanceMeters = haversineMeters(FARM.latitude, FARM.longitude, latitude, longitude);
  if (distanceMeters > FARM.radiusMeters) {
    return res.status(403).json({
      success: false,
      message: `You are ${Math.round(distanceMeters)}m away from the BOUESTI farm. Attendance is only allowed within ${FARM.radiusMeters}m.`
    });
  }

  const attendanceEntry = {
    matric: registration.matric,
    name: registration.name,
    programme: registration.programme,
    course,
    session,
    deviceId,
    timestamp: new Date().toISOString(),
    geofenceStatus: 'Within BOUESTI farm radius',
    distanceMeters: Math.round(distanceMeters)
  };

  store.attendance.push(attendanceEntry);
  writeStore(store);

  res.json({ success: true, attendance: attendanceEntry });
});

app.listen(PORT, () => {
  console.log(`BOUESTI attendance server running on http://localhost:${PORT}`);
});
