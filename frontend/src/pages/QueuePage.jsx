import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const PRIORITY = {
  p1: { label: 'P1 · Resuscitation', color: '#ef4444' },
  p2: { label: 'P2 · Emergency',     color: '#f97316' },
  p3: { label: 'P3 · Urgent',        color: '#eab308' },
  p4: { label: 'P4 · Non-Urgent',    color: '#22c55e' },
}

// user and role are passed in from main.jsx after login
function QueuePage({ user, role }) {
  const [queue, setQueue] = useState([])
  const [form, setForm] = useState({
    name: '', age: '', chiefComplaint: '',
    heartRate: '', systolic: '', diastolic: '',
    spo2: '', temperature: '', respiratoryRate: '', painScale: '',
  })
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [confirmedPriority, setConfirmedPriority] = useState('p4')
  const [triageLoading, setTriageLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [addError, setAddError] = useState(null)
  // tracks which patient the doctor just called
  const [currentPatient, setCurrentPatient] = useState(null)

  // what each role is allowed to do
  const canRegister = role === 'nurse' || role === 'admin'
  const canCallNext = role === 'doctor' || role === 'admin'
  const canMarkSeen = role === 'doctor' || role === 'admin'
  const canRemove   = role === 'admin'

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${API}/queue`)
      if (!res.ok) {
        console.error('Queue fetch failed:', res.status)
        return
      }
      const data = await res.json()
      setQueue(data.queue ?? [])
    } catch (err) {
      console.error('Queue fetch error:', err)
    }
  }

  useEffect(() => {
    fetchQueue()

    // real-time queue updates and refresh using supabase
    const channel = supabase
      .channel('queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, fetchQueue)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Step 1: send vitals to backend, get AI priority suggestion
  const handleTriage = async (e) => {
    e.preventDefault()
    setTriageLoading(true)
    setAiSuggestion(null)
    setAddError(null)
    try {
      const res = await fetch(`${API}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiSuggestion({ error: data.error || 'Triage failed' })
      } else {
        setAiSuggestion(data)
        setConfirmedPriority(data.priority)
      }
    } catch (err) {
      setAiSuggestion({ error: 'Could not reach backend. Is the server running?' })
    }
    setTriageLoading(false)
  }

  // Step 2: add the patient using the nurse-confirmed priority
  const handleConfirmAndAdd = async () => {
    setLoading(true)
    setAddError(null)
    try {
      const res = await fetch(`${API}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          age: form.age ? Number(form.age) : null,
          chiefComplaint: form.chiefComplaint,
          priority: confirmedPriority,
          // send vitals and AI reasoning to database
          heartRate: form.heartRate,
          systolic: form.systolic,
          diastolic: form.diastolic,
          spo2: form.spo2,
          temperature: form.temperature,
          respiratoryRate: form.respiratoryRate,
          painScale: form.painScale,
          aiReasoning: aiSuggestion?.reasoning ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add patient')
        setLoading(false)
        return
      }
      setForm({ name: '', age: '', chiefComplaint: '', heartRate: '', systolic: '', diastolic: '', spo2: '', temperature: '', respiratoryRate: '', painScale: '' })
      setAiSuggestion(null)
      fetchQueue()
    } catch (err) {
      setAddError('Could not reach backend. Is the server running?')
    }
    setLoading(false)
  }

  // handle calling next highest priority patient
  const handleCallNext = async () => {
    const res = await fetch(`${API}/queue/next`, { method: 'POST' })
    const data = await res.json()
    // store called patient so their details can be shown
    if (res.ok) setCurrentPatient(data)
    fetchQueue()
  }

  // handle calling a specific patient from the queue list
  const handleCallPatient = async (patient) => {
    await fetch(`${API}/queue/${patient.id}/call`, { method: 'PATCH' })
    setCurrentPatient({ ...patient, status: 'called', called_at: new Date().toISOString() })
    fetchQueue()
  }

  // handle marking a patient as seen
  const handleSeen = async (id) => {
    await fetch(`${API}/queue/${id}/seen`, { method: 'PATCH' })
    fetchQueue()
  }

  // handle removing a patient from the queue
  const handleRemove = async (id) => {
    await fetch(`${API}/queue/${id}`, { method: 'DELETE' })
    fetchQueue()
  }

  const waiting = queue.filter(p => p.status === 'waiting').length
  const called  = queue.filter(p => p.status === 'called').length

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7' }}>

      {/* Top header bar */}
      <header style={{ background: '#1e293b', padding: '18px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.5px' }}>TriageFlow</h1>
        </div>
        {/* live stats + logged in user info */}
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <StatChip label="Waiting" value={waiting} color="#60a5fa" />
          <StatChip label="Called"  value={called}  color="#fbbf24" />
          <div style={{ borderLeft: '1px solid #334155', paddingLeft: '28px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{user?.email}</span>
              <RoleBadge role={role} />
            </div>
            <button onClick={() => supabase.auth.signOut()} style={logoutBtn}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '880px', margin: '28px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* register form only shown to nurses and admins */}
        {canRegister && <RegisterCard
          form={form}
          setForm={setForm}
          aiSuggestion={aiSuggestion}
          confirmedPriority={confirmedPriority}
          setConfirmedPriority={setConfirmedPriority}
          triageLoading={triageLoading}
          loading={loading}
          addError={addError}
          handleTriage={handleTriage}
          handleConfirmAndAdd={handleConfirmAndAdd}
        />}

        {/* current patient panel — shows full triage details after calling */}
        {(role === 'doctor' || role === 'admin') && currentPatient && <CurrentPatientCard patient={currentPatient} onDismiss={() => setCurrentPatient(null)} />}

        {/* Queue card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
              Patient Queue&nbsp;
              <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '14px' }}>({waiting} waiting)</span>
            </h2>
            {/* only doctors and admins can call patients */}
            {canCallNext && <button onClick={handleCallNext} style={successBtn}>Call Next</button>}
          </div>

          {queue.length === 0
            ? <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '32px 0', fontSize: '14px' }}>No patients in queue</p>
            : queue.map(patient => (
                <div key={patient.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 16px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  background: patient.status === 'seen' ? '#f8fafc' : '#fff',
                  border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${PRIORITY[patient.priority]?.color ?? '#cbd5e1'}`,
                  opacity: patient.status === 'seen' ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', minWidth: '36px' }}>{patient.ticket_number}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                        {patient.full_name}
                        {patient.age && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '13px' }}>, {patient.age}yo</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <PriorityBadge priority={patient.priority} small />
                        {patient.chief_complaint && <span style={{ fontSize: '12px', color: '#94a3b8' }}>· {patient.chief_complaint}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusBadge status={patient.status} />
                    {/* call a specific patient directly instead of using call next */}
                    {canCallNext && patient.status === 'waiting' && (
                      <button onClick={() => handleCallPatient(patient)} style={outlineBtn}>Call</button>
                    )}
                    {/* only doctors and admins can mark as seen */}
                    {canMarkSeen && patient.status !== 'seen' && (
                      <button onClick={() => handleSeen(patient.id)} style={outlineBtn}>Seen</button>
                    )}
                    {/* only admins can remove patients */}
                    {canRemove && <button onClick={() => handleRemove(patient.id)} style={dangerBtn}>Remove</button>}
                  </div>
                </div>
              ))
          }
        </Card>

      </main>
    </div>
  )
}

// Reusable small components

// shows full patient details after a doctor calls them
function CurrentPatientCard({ patient, onDismiss }) {
  const p = PRIORITY[patient.priority]

  // build list of recorded vitals
  const vitals = [
    patient.heart_rate       && { label: 'Heart Rate',    value: `${patient.heart_rate} bpm` },
    (patient.systolic_bp && patient.diastolic_bp) && { label: 'Blood Pressure', value: `${patient.systolic_bp}/${patient.diastolic_bp} mmHg` },
    patient.spo2             && { label: 'SpO2',           value: `${patient.spo2}%` },
    patient.temperature      && { label: 'Temperature',    value: `${patient.temperature}°C` },
    patient.respiratory_rate && { label: 'Resp. Rate',     value: `${patient.respiratory_rate}/min` },
    patient.pain_scale != null && { label: 'Pain Scale',   value: `${patient.pain_scale}/10` },
  ].filter(Boolean)

  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: `2px solid ${p?.color ?? '#e2e8f0'}`, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Current Patient</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>{patient.ticket_number}</span>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
              {patient.full_name}
              {patient.age && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '15px' }}>, {patient.age}yo</span>}
            </h2>
            <PriorityBadge priority={patient.priority} />
          </div>
          {patient.chief_complaint && (
            <p style={{ marginTop: '6px', fontSize: '14px', color: '#475569' }}>{patient.chief_complaint}</p>
          )}
        </div>
        {/* dismiss button clears current patient panel */}
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {vitals.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>Vitals</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {vitals.map(v => (
              <div key={v.label} style={{ padding: '6px 12px', borderRadius: '7px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8', marginRight: '6px' }}>{v.label}</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{v.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {patient.ai_reasoning && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `3px solid ${p?.color ?? '#e2e8f0'}` }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginRight: '8px' }}>AI Reasoning</span>
          <span style={{ fontSize: '13px', color: '#475569' }}>{patient.ai_reasoning}</span>
        </div>
      )}
    </div>
  )
}

// register patient form — only rendered when canRegister is true
function RegisterCard({ form, setForm, aiSuggestion, confirmedPriority, setConfirmedPriority, triageLoading, loading, addError, handleTriage, handleConfirmAndAdd }) {
  return (
    <Card>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '20px' }}>Register Patient</h2>
      <form onSubmit={handleTriage}>

        {/* Patient info section */}
        <SectionDivider label="Patient Information" />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <Field label="Full Name *">
            <input placeholder="e.g. John Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="Age *">
            <input type="number" placeholder="e.g. 45" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} required style={inputStyle} />
          </Field>
        </div>
        <Field label="Chief Complaint *">
          <input placeholder="e.g. chest pain, difficulty breathing" value={form.chiefComplaint} onChange={e => setForm({ ...form, chiefComplaint: e.target.value })} required style={inputStyle} />
        </Field>

        {/* Vital signs section */}
        <SectionDivider label="Vital Signs" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <Field label="Heart Rate (bpm)">
            <input type="number" placeholder="e.g. 80" value={form.heartRate} onChange={e => setForm({ ...form, heartRate: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="SpO2 (%)">
            <input type="number" placeholder="e.g. 98" value={form.spo2} onChange={e => setForm({ ...form, spo2: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="Temperature (°C)">
            <input type="number" step="0.1" placeholder="e.g. 37.0" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="Systolic BP (mmHg)">
            <input type="number" placeholder="e.g. 120" value={form.systolic} onChange={e => setForm({ ...form, systolic: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="Diastolic BP (mmHg)">
            <input type="number" placeholder="e.g. 80" value={form.diastolic} onChange={e => setForm({ ...form, diastolic: e.target.value })} required style={inputStyle} />
          </Field>
          <Field label="Respiratory Rate (/min)">
            <input type="number" placeholder="e.g. 16" value={form.respiratoryRate} onChange={e => setForm({ ...form, respiratoryRate: e.target.value })} required style={inputStyle} />
          </Field>
        </div>
        <Field label="Pain Scale (0 – 10)">
          <input type="number" min="0" max="10" placeholder="e.g. 4" value={form.painScale} onChange={e => setForm({ ...form, painScale: e.target.value })} required style={{ ...inputStyle, maxWidth: '180px' }} />
        </Field>

        <button type="submit" disabled={triageLoading} style={{ ...primaryBtn, marginTop: '20px' }}>
          {triageLoading ? 'Assessing...' : 'Triage'}
        </button>

        {/* AI suggestion panel — appears after triage */}
        {aiSuggestion && (
          aiSuggestion.error
            ? <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
                {aiSuggestion.error}
              </div>
            : <div style={{ marginTop: '16px', padding: '16px 18px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `4px solid ${PRIORITY[aiSuggestion.priority]?.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>AI Assessment</span>
                  <PriorityBadge priority={aiSuggestion.priority} />
                </div>
                <p style={{ fontSize: '13px', color: '#475569', marginBottom: '14px' }}>{aiSuggestion.reasoning}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>Override:</span>
                  <select value={confirmedPriority} onChange={e => setConfirmedPriority(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                    {Object.entries(PRIORITY).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleConfirmAndAdd} disabled={loading} style={successBtn}>
                    {loading ? 'Adding...' : 'Confirm & Add'}
                  </button>
                </div>
                {addError && <p style={{ marginTop: '10px', color: '#dc2626', fontSize: '13px' }}>{addError}</p>}
              </div>
        )}
      </form>
    </Card>
  )
}

function Card({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {children}
    </div>
  )
}

function SectionDivider({ label }) {
  return (
    <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '16px 0 10px' }}>
      {label}
    </p>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '32px', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    </div>
  )
}

function PriorityBadge({ priority, small }) {
  const p = PRIORITY[priority]
  if (!p) return null
  return (
    <span style={{
      padding: small ? '1px 7px' : '3px 10px',
      borderRadius: '999px',
      fontSize: small ? '11px' : '12px',
      fontWeight: 600,
      background: p.color + '18',
      color: p.color,
      border: `1px solid ${p.color}30`,
      whiteSpace: 'nowrap',
    }}>{p.label}</span>
  )
}

function StatusBadge({ status }) {
  const map = {
    waiting: { color: '#3b82f6', bg: '#eff6ff' },
    called:  { color: '#f59e0b', bg: '#fffbeb' },
    seen:    { color: '#22c55e', bg: '#f0fdf4' },
  }
  const s = map[status] ?? { color: '#94a3b8', bg: '#f1f5f9' }
  return (
    <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

// Shared styles

const inputStyle = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: '7px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#0f172a',
  fontSize: '14px',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

const primaryBtn = {
  padding: '9px 24px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '7px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

const successBtn = {
  padding: '8px 16px',
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  borderRadius: '7px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const outlineBtn = {
  padding: '6px 13px',
  background: 'transparent',
  color: '#3b82f6',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}

const dangerBtn = {
  padding: '6px 13px',
  background: 'transparent',
  color: '#ef4444',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}

const logoutBtn = {
  padding: '4px 12px',
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: '5px',
  fontSize: '11px',
  fontWeight: 500,
  cursor: 'pointer',
}

// coloured badge showing the user's role in the header
function RoleBadge({ role }) {
  const map = {
    nurse:  { label: 'Nurse',  color: '#3b82f6', bg: '#1e40af22' },
    doctor: { label: 'Doctor', color: '#a855f7', bg: '#7e22ce22' },
    admin:  { label: 'Admin',  color: '#f59e0b', bg: '#92400e22' },
  }
  const r = map[role]
  if (!r) return null
  return (
    <span style={{ padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: r.bg, color: r.color, border: `1px solid ${r.color}44` }}>
      {r.label}
    </span>
  )
}

export default QueuePage
