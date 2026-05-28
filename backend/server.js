const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let queue = [];
let nextId = 1;
let nextTicket = 1;

//Priority levels based on PACS(Sg standard)
const PRIORITY_LEVELS = {
  p1: { label: 'P1 - Resuscitation', order: 1 },
  p2: { label: 'P2 - Emergency',     order: 2 },
  p3: { label: 'P3 - Urgent',        order: 3 },
  p4: { label: 'P4 - Non-Urgent',    order: 4 },
};

// Sort queue by priority and arrival time
function sortQueue(q) {
  return [...q].sort((a, b) => {
    const pa = PRIORITY_LEVELS[a.priority]?.order ?? 99;
    const pb = PRIORITY_LEVELS[b.priority]?.order ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.arrivedAt) - new Date(b.arrivedAt);
  });
}

// Below are the routes

// get sorted queue
app.get('/queue', (req, res) => {
  res.json({ queue: sortQueue(queue) });
});

// add new patient to queue
app.post('/queue', (req, res) => {
  const { name, age, chiefComplaint, priority } = req.body;
  if (!name || !priority || !PRIORITY_LEVELS[priority]) {
    return res.status(400).json({ error: 'name and valid priority are required' });
  }
  const patient = {
    id: nextId++,
    ticketNumber: `T${String(nextTicket++).padStart(3, '0')}`,
    name, age: age ?? null, chiefComplaint: chiefComplaint ?? '',
    priority, status: 'waiting',
    arrivedAt: new Date().toISOString(), calledAt: null,
  };
  queue.push(patient);
  res.status(201).json(patient);
});

// call a specific patient by ID, change status to called
app.patch('/queue/:id/call', (req, res) => {
  const patient = queue.find(p => p.id === Number(req.params.id));
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  patient.status = 'called';
  patient.calledAt = new Date().toISOString();
  res.json(patient);
});

// change status to seen
app.patch('/queue/:id/seen', (req, res) => {
  const patient = queue.find(p => p.id === Number(req.params.id));
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  patient.status = 'seen';
  res.json(patient);
});

// remove patient from queue
app.delete('/queue/:id', (req, res) => {
  const idx = queue.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Patient not found' });
  queue.splice(idx, 1);
  res.json({ ok: true });
});

// automatic call next
app.post('/queue/next', (req, res) => {
  const sorted = sortQueue(queue.filter(p => p.status === 'waiting'));
  if (!sorted.length) return res.status(404).json({ error: 'No waiting patients' });
  const next = sorted[0];
  next.status = 'called';
  next.calledAt = new Date().toISOString();
  res.json(next);
});

// queue statistics
app.get('/queue/stats', (req, res) => {
  res.json({
    total: queue.length,
    waiting: queue.filter(p => p.status === 'waiting').length,
    called:  queue.filter(p => p.status === 'called').length,
    seen:    queue.filter(p => p.status === 'seen').length,
    byPriority: Object.fromEntries(
      Object.keys(PRIORITY_LEVELS).map(k => [k, queue.filter(p => p.priority === k && p.status === 'waiting').length])
    ),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`TriageFlow backend running on http://localhost:${PORT}`));