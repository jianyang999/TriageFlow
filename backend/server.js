require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Supabase client for database connection
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Supabase using credentials from .env
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// AI triage: takes patient vitals + complaint, returns suggested priority and reasoning
app.post('/triage', async (req, res) => {
  const { chiefComplaint, age, heartRate, systolic, diastolic, spo2, temperature, respiratoryRate, painScale } = req.body;

  // Only include vitals the nurse actually filled in — sending "not provided" confuses the AI
  const vitals = [];
  if (heartRate)                    vitals.push(`- Heart rate: ${heartRate} bpm`);
  if (systolic && diastolic)        vitals.push(`- Blood pressure: ${systolic}/${diastolic} mmHg`);
  if (spo2)                         vitals.push(`- SpO2: ${spo2}%`);
  if (temperature)                  vitals.push(`- Temperature: ${temperature} degrees Celsius`);
  if (respiratoryRate)              vitals.push(`- Respiratory rate: ${respiratoryRate} breaths/min`);
  const vitalsText = vitals.length > 0 ? vitals.join('\n') : 'No vitals recorded.';

  const prompt = `
You are an experienced emergency department triage nurse at a Singapore hospital, following the PACS triage system.

Assess the patient HOLISTICALLY using ALL information provided — the chief complaint, the pain scale, and the vitals together. Do not ignore the chief complaint or pain scale just because vitals are missing or normal.

CHIEF COMPLAINT RULES (apply even if vitals are absent or normal):
- Immediately P1: "not breathing", "cardiac arrest", "unconscious", "unresponsive", "choking"
- At least P2: "chest pain", "difficulty breathing", "shortness of breath", "stroke", "facial droop", "seizure", "severe bleeding", "overdose", "anaphylaxis", "cannot speak", "severe headache", "worst headache of life"
- At least P3: "abdominal pain", "vomiting blood", "head injury", "arm or leg weakness", "high fever", "back pain with numbness", "eye injury"

PAIN SCALE RULES:
- 9 or 10 out of 10: at least P2 regardless of other findings
- 7 or 8 out of 10: at least P3
- 5 or 6 out of 10: P3 or P4 depending on the complaint
- 4 or below: P4 unless vitals or complaint say otherwise

VITAL SIGN THRESHOLDS (use when vitals are provided):
- P1: SpO2 below 85%, HR below 40 or above 180, systolic BP below 70
- P2: SpO2 85-90%, HR 140-180, systolic BP 70-90 or above 220, temperature above 40 Celsius
- P3: SpO2 90-94%, HR 100-140, systolic BP 90-100 or 180-220, temperature 38.5-40 Celsius
- P4: all vitals normal or not measured, and complaint is mild

Missing vitals means they were not measured — not that they are abnormal. When vitals are absent, rely on the complaint and pain scale to decide.

Always assign the HIGHEST priority warranted by ANY single factor.

Patient:
- Age: ${age || 'unknown'}
- Chief complaint: ${chiefComplaint || 'not stated'}
- Pain scale: ${painScale !== '' && painScale != null ? `${painScale}/10` : 'not stated'}
${vitalsText}

Respond with ONLY valid JSON and nothing else:
{"priority": "p1|p2|p3|p4", "reasoning": "one sentence that references the specific complaint, pain score, or vital that drove the decision"}
`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    if (!['p1', 'p2', 'p3', 'p4'].includes(parsed.priority)) {
      return res.status(500).json({ error: 'AI returned an invalid priority' });
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    full_name: name,
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