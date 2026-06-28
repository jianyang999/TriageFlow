import { useState, useEffect } from 'react'

const API = import.meta.env.DEV
  ? 'http://localhost:3001'
  : import.meta.env.VITE_API_URL

// user and role passed in from main.jsx after login
function PatientRecordsPage({ user, role, onClose }) {
  const [records, setRecords] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    fullName: '', nric: '', age: '', gender: '',
    contactInfo: '', address: '', allergies: '', notes: '',
  })
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)

// API call to fetch patient records
  const fetchRecords = async (query = '') => {
    setLoading(true)
    try {
      const url = query ? `${API}/patient-records?search=${encodeURIComponent(query)}` : `${API}/patient-records`
      const res = await fetch(url)
      if (!res.ok) {
        console.error('Patient records fetch failed:', res.status)
        setLoading(false)
        return
      }
      // failsafe to prevent error if there are no patients
      const data = await res.json()
      setRecords(data.patients ?? [])
    } catch (err) {
      console.error('Patient records fetch error:', err)
    }
    setLoading(false)
  }

  // initialize patient records
  useEffect(() => {
    fetchRecords()
  }, [])

  // buffer timer to prevent instant API calls everytime a new character is typed
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecords(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // API call to add new patient record
  const handleAddRecord = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    // error handling
    try {
      const res = await fetch(`${API}/patient-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add patient record')
        setAddLoading(false)
        return
      }
      setForm({ fullName: '', nric: '', age: '', gender: '', contactInfo: '', address: '', allergies: '', notes: '' })
      setShowAddForm(false)
      fetchRecords(searchQuery)
    } catch (err) {
      setAddError('Could not reach backend. Is the server running?')
    }
    setAddLoading(false)
  }

  // the chunk below is the design for the patient records modal
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>

        {/* Top header bar, matches QueuePage styling */}
        <header style={{ background: '#1e293b', padding: '18px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '14px 14px 0 0' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.5px' }}>TriageFlow</h1>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Patient Records</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{user?.email}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </header>

        <main style={{ maxWidth: '880px', margin: '28px auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                Patient Records&nbsp;
                <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '14px' }}>({records.length})</span>
              </h2>
              <button onClick={() => setShowAddForm(!showAddForm)} style={primaryBtn}>
                {showAddForm ? 'Cancel' : '+ Add Patient'}
              </button>
            </div>

            {/* search bar */}
            <input
              type="text"
              placeholder="Search by name or NRIC..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, marginBottom: '18px' }}
            />

            {/* add patient form, toggled by button above */}
            {showAddForm && (
              <form onSubmit={handleAddRecord} style={{ padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <Field label="Full Name *">
                    <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required style={inputStyle} />
                  </Field>
                  <Field label="NRIC *">
                    <input value={form.nric} onChange={e => setForm({ ...form, nric: e.target.value })} required style={inputStyle} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <Field label="Age *">
                    <input type="number" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} required style={inputStyle} />
                  </Field>
                  <Field label="Gender *">
                    <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} required style={inputStyle}>
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <Field label="Contact Info">
                    <input value={form.contactInfo} onChange={e => setForm({ ...form, contactInfo: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="Address">
                    <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} />
                  </Field>
                </div>
                <Field label="Allergies *">
                  <input placeholder="e.g. Penicillin, or 'None known'" value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} required style={inputStyle} />
                </Field>
                <div style={{ marginTop: '12px' }}>
                  <Field label="Additional Notes">
                    <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
                  </Field>
                </div>

                {addError && <p style={{ marginTop: '10px', color: '#dc2626', fontSize: '13px' }}>{addError}</p>}

                <button type="submit" disabled={addLoading} style={{ ...successBtn, marginTop: '14px' }}>
                  {addLoading ? 'Saving...' : 'Save Patient Record'}
                </button>
              </form>
            )}

            {/* results list */}
            {loading
              ? <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '32px 0', fontSize: '14px' }}>Loading...</p>
              : records.length === 0
                ? <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '32px 0', fontSize: '14px' }}>No patient records found</p>
                : records.map(patient => (
                    <div key={patient.id} style={{
                      padding: '13px 16px',
                      marginBottom: '8px',
                      borderRadius: '8px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                            {patient.full_name}
                            <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '13px' }}>, {patient.age}yo · {patient.gender}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>NRIC: {patient.nric}</div>
                          {patient.contact_info && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Contact: {patient.contact_info}</div>}
                          {patient.address && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Address: {patient.address}</div>}
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', whiteSpace: 'nowrap' }}>
                          ⚠ {patient.allergies}
                        </span>
                      </div>
                      {patient.notes && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '7px', background: '#f8fafc', fontSize: '12px', color: '#475569' }}>
                          {patient.notes}
                        </div>
                      )}
                    </div>
                  ))
            }
          </Card>

        </main>
      </div>
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {children}
    </div>
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

// dark backdrop covering the full screen behind the modal
const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(15, 23, 42, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px',
}

// the floating pop-out card itself
const modalStyle = {
  background: '#eef2f7',
  borderRadius: '14px',
  width: '100%',
  maxWidth: '920px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
}

const inputStyle = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: '7px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#0f172a',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const primaryBtn = {
  padding: '9px 18px',
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
}

export default PatientRecordsPage