require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
// Supabase client for database connection
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Supabase using credentials from .env
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    return new Date(a.arrived_at) - new Date(b.arrived_at);
  });
}

// Below are the routes

// get sorted queue
app.get('/queue', async (req, res) => {
  const { data, error } = await supabase.from('patients').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ queue: sortQueue(data) });
});

// add new patient to queue
app.post('/queue', async (req, res) => {
  const { name, age, chiefComplaint, priority } = req.body;
  if (!name || !priority || !PRIORITY_LEVELS[priority]) {
    return res.status(400).json({ error: 'name and valid priority are required' });
  }
  // count existing patients to generate next ticket number
  const { count } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });
  const ticketNumber = `T${String((count ?? 0) + 1).padStart(3, '0')}`;

  const { data, error } = await supabase.from('patients').insert([{
    ticket_number: ticketNumber,
    name,
    age: age ?? null,
    chief_complaint: chiefComplaint ?? '',
    priority,
    status: 'waiting',
    arrived_at: new Date().toISOString(),
    called_at: null,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// call a specific patient by ID, change status to called
app.patch('/queue/:id/call', async (req, res) => {
  const { data, error } = await supabase
    .from('patients')
    .update({ status: 'called', called_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// change status to seen
app.patch('/queue/:id/seen', async (req, res) => {
  const { data, error } = await supabase
    .from('patients')
    .update({ status: 'seen' })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// remove patient from queue
app.delete('/queue/:id', async (req, res) => {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// automatic call next
app.post('/queue/next', async (req, res) => {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('status', 'waiting');
  if (error) return res.status(500).json({ error: error.message });
  if (!data.length) return res.status(404).json({ error: 'No waiting patients' });
  const next = sortQueue(data)[0];
  const { data: updated, error: updateError } = await supabase
    .from('patients')
    .update({ status: 'called', called_at: new Date().toISOString() })
    .eq('id', next.id)
    .select().single();
  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json(updated);
});

// queue statistics
app.get('/queue/stats', async (req, res) => {
  const { data, error } = await supabase.from('patients').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    total: data.length,
    waiting: data.filter(p => p.status === 'waiting').length,
    called:  data.filter(p => p.status === 'called').length,
    seen:    data.filter(p => p.status === 'seen').length,
    byPriority: Object.fromEntries(
      Object.keys(PRIORITY_LEVELS).map(k => [k, data.filter(p => p.priority === k && p.status === 'waiting').length])
    ),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`TriageFlow backend running on http://localhost:${PORT}`));