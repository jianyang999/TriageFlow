require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Supabase client for database connection
const { createClient } = require('@supabase/supabase-js');
// Groq SDK for AI triaging for suggested priority level
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Supabase using credentials from .env
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Connect to Groq using API key from .env
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

// AI triage: takes patient vitals + complaint, returns suggested priority
app.post('/triage', async (req, res) => {
  const { chiefComplaint, age, heartRate, systolic, diastolic, spo2, temperature, respiratoryRate, painScale } = req.body;

  // Only include vitals the nurse actually filled in
  const vitals = [];
  if (heartRate)                    vitals.push(`- Heart rate: ${heartRate} bpm`);
  if (systolic && diastolic)        vitals.push(`- Blood pressure: ${systolic}/${diastolic} mmHg`);
  if (spo2)                         vitals.push(`- SpO2: ${spo2}%`);
  if (temperature)                  vitals.push(`- Temperature: ${temperature} degrees Celsius`);
  if (respiratoryRate)              vitals.push(`- Respiratory rate: ${respiratoryRate} breaths/min`);
  const vitalsText = vitals.length > 0 ? vitals.join('\n') : 'No vitals recorded.';
// Prompt for AI to determine priority to assign
  const prompt = `
You are an experienced emergency department triage nurse at a Singapore hospital, following the PACS triage system.

All patient fields are fully provided. Assess ALL of them together — do not let one factor alone override a clear overall picture. Use vitals to confirm or downgrade what the complaint suggests.

VITAL SIGN THRESHOLDS (always check these first):
- P1: SpO2 below 85%, HR below 40 or above 180, systolic BP below 70
- P2: SpO2 85-93%, HR 130-180, systolic BP 70-90 or above 220, temperature above 40 Celsius, RR above 30
- P3: SpO2 94-95%, HR 100-130, systolic BP 90-100 or 180-220, temperature 38.5-40 Celsius, RR 24-30
- P4: all vitals normal (SpO2 96%+, HR 60-99, systolic BP 100-179, temp below 38.5 Celsius, RR 12-23)

CHIEF COMPLAINT GUIDELINES (starting point — always adjust based on vitals and pain):
- Always P1: "cardiac arrest", "not breathing", "unconscious", "unresponsive", "choking"
- Always at least P2 regardless of vitals: "seizure", "worst headache of life", "severe uncontrolled bleeding", "anaphylaxis", "overdose", "cannot speak", "facial droop"
- P2 if vitals are abnormal, P3 if all vitals are normal: "chest pain", "shortness of breath", "difficulty breathing", "stroke symptoms"
- Always at least P3 regardless of vitals: "vomiting blood", "head injury with loss of consciousness", "arm or leg weakness", "eye injury"
- P3 if pain is 6 or above or vitals are mildly abnormal, otherwise P4: "abdominal pain", "chest tightness", "back pain with numbness", "dizziness with vomiting", "head injury without loss of consciousness"
- P4 by default unless vitals or pain say otherwise: "headache", "fever", "nausea", "minor cut", "back pain", "mild abdominal discomfort", "cough", "sore throat"

PAIN SCALE — use to adjust priority relative to the complaint, not to independently force a priority:
- 9 or 10: raise the complaint baseline by one level (P4 becomes P3, P3 becomes P2)
- 7 or 8: at least P3
- 4 or below with normal vitals: lean towards P4 even for moderate complaints

EXAMPLES to guide you:
- Shortness of breath, SpO2 96%, RR 18, all vitals normal, pain 3 → P3 (complaint alone, vitals do not confirm P2)
- Shortness of breath, SpO2 88%, RR 29 → P2 (vitals confirm respiratory distress)
- Chest pain, all vitals normal, pain 4 → P3 (normal vitals and low pain keep it at P3)
- Chest pain, HR 145, pain 8 → P2 (abnormal HR and high pain escalate it)
- Abdominal pain, all vitals normal, pain 3 → P4
- Abdominal pain, temp 38.9, pain 7 → P3

Patient:
- Age: ${age}
- Chief complaint: ${chiefComplaint}
- Pain scale: ${painScale}/10
${vitalsText}

Respond with ONLY valid JSON and nothing else:
{"priority": "p1|p2|p3|p4", "reasoning": "one sentence referencing the specific vitals, pain score, and complaint that drove the decision"}
`;
// Actual sending of prompt to AI and returning response
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
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
  // also pull vitals and AI reasoning from the request now
  const { name, age, chiefComplaint, priority, heartRate, systolic, diastolic, spo2, temperature, respiratoryRate, painScale, aiReasoning } = req.body;
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
    // save vitals so doctors can see them when the patient is called
    heart_rate: heartRate ? Number(heartRate) : null,
    systolic_bp: systolic ? Number(systolic) : null,
    diastolic_bp: diastolic ? Number(diastolic) : null,
    spo2: spo2 ? Number(spo2) : null,
    temperature: temperature ? Number(temperature) : null,
    respiratory_rate: respiratoryRate ? Number(respiratoryRate) : null,
    pain_scale: painScale ? Number(painScale) : null,
    ai_reasoning: aiReasoning ?? null,
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

// get patient records
app.get('/patient-records', async (req, res) => {
  const { search } = req.query;
  let query = supabase.from('patient_records').select('*');

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,nric.ilike.%${search}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ patients: data ?? [] });
});

// post add new patient record
app.post('/patient-records', async (req, res) => {
  const { fullName, nric, age, gender, contactInfo, address, allergies, notes } = req.body;
  if (!fullName || !nric || !age || !gender || !allergies) {
    return res.status(400).json({ error: 'fullName, nric, age, gender, and allergies are required' });
  }

  const { data, error } = await supabase.from('patient_records').insert([{
    full_name: fullName,
    nric,
    age: Number(age),
    gender,
    contact_info: contactInfo ?? null,
    address: address ?? null,
    allergies,
    notes: notes ?? null,
  }]).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.listen(PORT, () => console.log(`TriageFlow backend running on http://localhost:${PORT}`));