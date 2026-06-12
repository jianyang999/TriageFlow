import { useState, useEffect } from 'react'

// for copy pasting purposes
const API = 'http://localhost:3001'

// Priority levels based on PACS(Sg standard)
const PRIORITY = {
  p1: { label: 'P1 - Resuscitation', color: '#ff2d2d' },
  p2: { label: 'P2 - Emergency',     color: '#ff8c00' },
  p3: { label: 'P3 - Urgent',        color: '#ffd700' },
  p4: { label: 'P4 - Non-Urgent',    color: '#52c41a' },
}

function QueuePage() {
  // initialising empty queue
  const [queue, setQueue] = useState([])

  // form state for adding a new patient
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

  // fetch queue data from backend, convert to json, save patient into queue
  const fetchQueue = () => {
    fetch(`${API}/queue`)
      .then(res => res.json())
      .then(data => setQueue(data.queue))
  }

  useEffect(() => { fetchQueue() }, [])

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
    await fetch(`${API}/queue/next`, { method: 'POST' })
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

  // logic to display queue
  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
      <h1 style={{ textAlign: 'center' }}>TriageFlow</h1>
      <p style={{ textAlign: 'center', marginBottom: '32px' }}>Patient Queue</p>

      {/* Add patient form */}
      <form onSubmit={handleTriage} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px', padding: '24px', border: '1px solid var(--border)', borderRadius: '8px' }}>
        <h2 style={{ margin: '0 0 8px' }}>Add Patient</h2>

        <input
          placeholder="Patient name *"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          required
          style={inputStyle}
        />
        <input
          placeholder="Age"
          type="number"
          value={form.age}
          onChange={e => setForm({ ...form, age: e.target.value })}
          required
          style={inputStyle}
        />
        <input
          placeholder="Chief complaint"
          value={form.chiefComplaint}
          onChange={e => setForm({ ...form, chiefComplaint: e.target.value })}
          required
          style={inputStyle}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <input placeholder="Heart rate (bpm)" type="number" value={form.heartRate} onChange={e => setForm({ ...form, heartRate: e.target.value })} required style={inputStyle} />
          <input placeholder="SpO2 (%)" type="number" value={form.spo2} onChange={e => setForm({ ...form, spo2: e.target.value })} required style={inputStyle} />
          <input placeholder="Systolic BP (mmHg)" type="number" value={form.systolic} onChange={e => setForm({ ...form, systolic: e.target.value })} required style={inputStyle} />
          <input placeholder="Diastolic BP (mmHg)" type="number" value={form.diastolic} onChange={e => setForm({ ...form, diastolic: e.target.value })} required style={inputStyle} />
          <input placeholder="Temperature (°C)" type="number" step="0.1" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} required style={inputStyle} />
          <input placeholder="Respiratory rate (/min)" type="number" value={form.respiratoryRate} onChange={e => setForm({ ...form, respiratoryRate: e.target.value })} required style={inputStyle} />
        </div>
        <input placeholder="Pain scale (0–10)" type="number" min="0" max="10" value={form.painScale} onChange={e => setForm({ ...form, painScale: e.target.value })} required style={inputStyle} />

        <button type="submit" disabled={triageLoading} style={btnStyle('#6366f1')}>
          {triageLoading ? 'Assessing...' : 'Triage'}
        </button>

        {/* AI suggestion panel — appears after triage call */}
        {aiSuggestion && (
          aiSuggestion.error
            ? <div style={{ padding: '12px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', fontSize: '14px' }}>
                AI error: {aiSuggestion.error}
              </div>
            : <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--code-bg)', border: `2px solid ${PRIORITY[aiSuggestion.priority]?.color}` }}>
                <strong>AI Suggestion: </strong>
                <span style={{ color: PRIORITY[aiSuggestion.priority]?.color }}>{PRIORITY[aiSuggestion.priority]?.label}</span>
                <p style={{ margin: '8px 0', fontSize: '14px' }}>{aiSuggestion.reasoning}</p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '14px' }}>Override:</span>
                  <select value={confirmedPriority} onChange={e => setConfirmedPriority(e.target.value)} style={inputStyle}>
                    {Object.entries(PRIORITY).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleConfirmAndAdd} disabled={loading} style={btnStyle('#16a34a')}>
                    {loading ? 'Adding...' : 'Confirm & Add to Queue'}
                  </button>
                </div>
                {addError && (
                  <p style={{ margin: '8px 0 0', color: '#dc2626', fontSize: '13px' }}>Error: {addError}</p>
                )}
              </div>
        )}
      </form>

      {/* Call next patient button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Current Queue ({queue.filter(p => p.status === 'waiting').length} waiting)</h2>
        <button onClick={handleCallNext} style={btnStyle('#16a34a')}>Call Next</button>
      </div>

      {/* Patient list */}
      {queue.length === 0
        ? <p>No patients in queue</p>
        : queue.map(patient => (
            <div key={patient.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              marginBottom: '10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              borderLeft: `4px solid ${PRIORITY[patient.priority]?.color ?? '#ccc'}`,
              opacity: patient.status === 'seen' ? 0.5 : 1,
            }}>
              <div>
                {/* ticket_number is snake_case from Supabase */}
                <strong>{patient.ticket_number}</strong> — {patient.full_name}
                {patient.age && <span style={{ color: 'var(--text)' }}>, {patient.age}yo</span>}
                <br />
                <small style={{ color: PRIORITY[patient.priority]?.color }}>
                  {PRIORITY[patient.priority]?.label ?? patient.priority}
                </small>
                {patient.chief_complaint && <small style={{ color: 'var(--text)' }}> · {patient.chief_complaint}</small>}
              </div>

              {/* Status badge + action buttons */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '999px', background: statusColor(patient.status), color: '#fff' }}>
                  {patient.status}
                </span>
                {patient.status !== 'seen' && (
                  <button onClick={() => handleSeen(patient.id)} style={btnStyle('#6366f1', true)}>Seen</button>
                )}
                <button onClick={() => handleRemove(patient.id)} style={btnStyle('#dc2626', true)}>Remove</button>
              </div>
            </div>
          ))
      }
    </div>
  )
}

// helper: colour for status badge
function statusColor(status) {
  if (status === 'waiting') return '#6366f1'
  if (status === 'called')  return '#f59e0b'
  if (status === 'seen')    return '#16a34a'
  return '#999'
}

// reusable input style
const inputStyle = {
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--code-bg)',
  color: 'var(--text-h)',
  fontSize: '16px',
}

// reusable button style
const btnStyle = (color, small = false) => ({
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: small ? '6px 12px' : '10px 20px',
  fontSize: small ? '13px' : '15px',
  cursor: 'pointer',
})

export default QueuePage