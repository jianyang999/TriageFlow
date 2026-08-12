import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import PatientRecordsPage from './PatientRecordsPage'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const PRIORITY = {
  p1: { label: 'P1 · Resuscitation', color: '#ef4444' },
  p2: { label: 'P2 · Emergency', color: '#f97316' },
  p3: { label: 'P3 · Urgent', color: '#eab308' },
  p4: { label: 'P4 · Non-Urgent', color: '#22c55e' },
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
  // controls whether the patient records is shown
  const [showPatientRecords, setShowPatientRecords] = useState(false)
  // controls whether the add user modal is shown (admins only)
  const [showAddUser, setShowAddUser] = useState(false)
  // dummy state to trigger re-render every minute to update wait times
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // what each role is allowed to do
  const canRegister = role === 'nurse' || role === 'admin'
  const canCallNext = role === 'doctor' || role === 'admin'
  const canMarkSeen = role === 'doctor' || role === 'admin'
  const canRemove   = role === 'admin'
  // nurses and admins can see and dispense medicine orders
  const canDispense = role === 'nurse' || role === 'admin'

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

  // send vitals to backend for AI priority suggestion
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

  // add the patient with priority cfmed by nurse
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
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <StatChip label="Waiting" value={waiting} color="#60a5fa" />
          <StatChip label="Called"  value={called}  color="#fbbf24" />
          <div style={{ borderLeft: '1px solid #334155', paddingLeft: '28px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{user?.email}</span>
              <RoleBadge role={role} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {role === 'admin' && <button onClick={() => setShowAddUser(true)} style={logoutBtn}>Manage Users</button>}
              <button onClick={() => setShowPatientRecords(true)} style={logoutBtn}>Patient Records</button>
              <button onClick={() => supabase.auth.signOut()} style={logoutBtn}>Sign Out</button>
            </div>
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

        {/* nurses and admins */}
        {canDispense && <MedicineDispensePanel />}

        {/* admins */}
        {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} />}

        {/* current patient panel — shows full triage details after calling */}
        {(role === 'doctor' || role === 'admin') && currentPatient && (
          <CurrentPatientCard
            patient={currentPatient}
            user={user}
            role={role}
            onDismiss={() => setCurrentPatient(null)}
          />
        )}

        {/* Queue card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
              Patient Queue&nbsp;
              <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '14px' }}>({waiting} waiting)</span>
            </h2>
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
        {patient.arrived_at && <span style={{ fontSize: '12px', color: '#94a3b8' }}>· {formatWaitTime(patient.arrived_at)}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusBadge status={patient.status} />
                    {canCallNext && patient.status === 'waiting' && (
                      <button onClick={() => handleCallPatient(patient)} style={outlineBtn}>Call</button>
                    )}
                    {canMarkSeen && patient.status !== 'seen' && (
                      <button onClick={() => handleSeen(patient.id)} style={outlineBtn}>Seen</button>
                    )}
                    {canRemove && <button onClick={() => handleRemove(patient.id)} style={dangerBtn}>Remove</button>}
                  </div>
                </div>
              ))
          }
        </Card>

      </main>

      {/* patient records modal */}
      {showPatientRecords && (
        <PatientRecordsPage user={user} role={role} onClose={() => setShowPatientRecords(false)} />
      )}
    </div>
  )
}

// modal for admins to create and remove user accounts
function AddUserModal({ onClose }) {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'nurse' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  // list of existing users shown at the top
  const [users, setUsers] = useState([])
  const [deletingId, setDeletingId] = useState(null)

  // fetch all existing accounts when modal opens
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/admin/users`)
      if (!res.ok) return
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch { }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create user'); setLoading(false); return }
      setSuccess(true)
      setForm({ email: '', password: '', fullName: '', role: 'nurse' })
      fetchUsers()
    } catch {
      setError('Could not reach backend')
    }
    setLoading(false)
  }

  const handleDelete = async (userId) => {
    setDeletingId(userId)
    try {
      const res = await fetch(`${API}/admin/delete-user/${userId}`, { method: 'DELETE' })
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId))
    } catch { }
    setDeletingId(null)
  }

  return (
    // dark overlay behind the modal
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: '14px', padding: '28px 32px', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Manage Users</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>

        {/* existing accounts list */}
        {users.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>Existing Accounts</p>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{u.full_name || u.email}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email} · {u.role}</div>
                </div>
                <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id} style={dangerBtn}>
                  {deletingId === u.id ? '...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>Create New Account</p>

        {success
          ? <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '12px' }}>Account created successfully!</p>
              <button onClick={() => setSuccess(false)} style={primaryBtn}>Create Another</button>
            </div>
          : <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={modalLabelStyle}>Full Name</label>
                <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Dr. John Tan" style={inputStyle} />
              </div>
              <div>
                <label style={modalLabelStyle}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@hospital.sg" required style={inputStyle} />
              </div>
              <div>
                <label style={modalLabelStyle}>Password</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="min. 6 characters" required minLength={6} style={inputStyle} />
              </div>
              <div>
                <label style={modalLabelStyle}>Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                  <option value="nurse">Nurse</option>
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {error && <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>}
              <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Creating...' : 'Create Account'}</button>
            </form>
        }
      </div>
    </div>
  )
}

// nurse-facing panel showing all pending medicine orders for active patients
function MedicineDispensePanel() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [dispensingId, setDispensingId] = useState(null)

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/medicine-orders`)
      if (!res.ok) return
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch (err) {
      console.error('Failed to fetch medicine orders:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    // poll every 15 seconds so nurses see new orders without manual refresh
    const interval = setInterval(fetchOrders, 15000)
    return () => clearInterval(interval)
  }, [])

  // mark order as dispensed and remove it from the list immediately
  const handleDispense = async (orderId) => {
    setDispensingId(orderId)
    try {
      const res = await fetch(`${API}/medicine-orders/${orderId}/dispense`, { method: 'PATCH' })
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.id !== orderId))
      }
    } catch (err) {
      console.error('Failed to dispense order:', err)
    }
    setDispensingId(null)
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
          Medicine Orders&nbsp;
          <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '14px' }}>({orders.length} pending)</span>
        </h2>
        <button onClick={fetchOrders} style={outlineBtn}>Refresh</button>
      </div>

      {loading
        ? <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '20px 0', fontSize: '14px' }}>Loading...</p>
        : orders.length === 0
          ? <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '20px 0', fontSize: '14px' }}>No pending medicine orders</p>
          : orders.map(order => (
              <div key={order.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', marginBottom: '8px', borderRadius: '8px',
                background: '#fff', border: '1px solid #e2e8f0',
              }}>
                <div>
                  {/* patient identifier */}
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                    {order.ticket_number} · {order.patient_name}
                  </div>
                  {/* medicine details */}
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                    {order.medicine_name}
                    <span style={{ fontWeight: 400, color: '#64748b', fontSize: '13px', marginLeft: '8px' }}>{order.dosage}</span>
                  </div>
                  {/* who ordered it and when */}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    Ordered by {order.ordered_by} · {new Date(order.ordered_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => handleDispense(order.id)}
                  disabled={dispensingId === order.id}
                  style={successBtnSmall}
                >
                  {dispensingId === order.id ? 'Dispensing...' : 'Dispensed'}
                </button>
              </div>
            ))
      }
    </Card>
  )
}

// show full patient details after calling
function CurrentPatientCard({ patient, user, role, onDismiss }) {
  const p = PRIORITY[patient.priority]

  // medicine order state
  const [orders, setOrders] = useState([])
  const [medForm, setMedForm] = useState({ medicineName: '', dosage: '' })
  const [medLoading, setMedLoading] = useState(false)
  const [medError, setMedError] = useState(null)
  const [showMedForm, setShowMedForm] = useState(false)

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API}/medicine-orders?patientId=${patient.id}`)
        if (!res.ok) return
        const data = await res.json()
        setOrders(data.orders ?? [])
      } catch (err) {
        console.error('Failed to fetch medicine orders:', err)
      }
    }
    fetchOrders()
  }, [patient.id])

  const handleOrderMedicine = async (e) => {
    e.preventDefault()
    setMedLoading(true)
    setMedError(null)
    try {
      const res = await fetch(`${API}/medicine-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          medicineName: medForm.medicineName,
          dosage: medForm.dosage,
          orderedBy: user?.email,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMedError(data.error || 'Failed to place order')
        setMedLoading(false)
        return
      }
      // prepend new order to top of list
      setOrders(prev => [data, ...prev])
      setMedForm({ medicineName: '', dosage: '' })
      setShowMedForm(false)
    } catch (err) {
      setMedError('Could not reach backend. Is the server running?')
    }
    setMedLoading(false)
  }

  // build list of recorded vitals
  const vitals = [
    patient.heart_rate       && { label: 'Heart Rate',    value: `${patient.heart_rate} bpm` },
    (patient.systolic_bp && patient.diastolic_bp) && { label: 'Blood Pressure', value: `${patient.systolic_bp}/${patient.diastolic_bp} mmHg` },
    patient.spo2             && { label: 'SpO2',           value: `${patient.spo2}%` },
    patient.temperature      && { label: 'Temperature',    value: `${patient.temperature}°C` },
    patient.respiratory_rate && { label: 'Resp. Rate',     value: `${patient.respiratory_rate}/min` },
    patient.pain_scale != null && { label: 'Pain Scale',   value: `${patient.pain_scale}/10` },
  ].filter(Boolean)

  const canOrderMedicine = role === 'doctor' || role === 'admin'

  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: `2px solid ${p?.color ?? '#e2e8f0'}`, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>

      {/* Patient header */}
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
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {/* Vitals */}
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

      {/* AI Reasoning */}
      {patient.ai_reasoning && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `3px solid ${p?.color ?? '#e2e8f0'}`, marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginRight: '8px' }}>AI Reasoning</span>
          <span style={{ fontSize: '13px', color: '#475569' }}>{patient.ai_reasoning}</span>
        </div>
      )}

      {/* doctors and admins */}
      {canOrderMedicine && (
        <div style={{ marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Medicine Orders {orders.length > 0 && <span style={{ color: '#64748b' }}>({orders.length})</span>}
            </p>
            <button onClick={() => setShowMedForm(!showMedForm)} style={showMedForm ? outlineBtnSmall : primaryBtnSmall}>
              {showMedForm ? 'Cancel' : '+ Order Medicine'}
            </button>
          </div>

          {/* new order form */}
          {showMedForm && (
            <form onSubmit={handleOrderMedicine} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Medicine Name *</label>
                <input
                  placeholder="e.g. Paracetamol"
                  value={medForm.medicineName}
                  onChange={e => setMedForm({ ...medForm, medicineName: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Dosage *</label>
                <input
                  placeholder="e.g. 500mg"
                  value={medForm.dosage}
                  onChange={e => setMedForm({ ...medForm, dosage: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>
              <button type="submit" disabled={medLoading} style={{ ...successBtnSmall, marginBottom: '1px' }}>
                {medLoading ? 'Saving...' : 'Confirm'}
              </button>
            </form>
          )}
          {medError && <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{medError}</p>}

          {/* existing orders list */}
          {orders.length === 0
            ? <p style={{ fontSize: '13px', color: '#cbd5e1', padding: '10px 0' }}>No medicine orders yet</p>
            : orders.map(order => (
                <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '6px', borderRadius: '7px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>{order.medicine_name}</span>
                    <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '8px' }}>{order.dosage}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{order.ordered_by}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(order.ordered_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
          }
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

const modalLabelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: '#64748b',
  marginBottom: '5px',
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

const primaryBtnSmall = {
  padding: '5px 12px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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

const successBtnSmall = {
  padding: '8px 14px',
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const outlineBtnSmall = {
  padding: '5px 12px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
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

// calculates how long patient has been waiting
function formatWaitTime(arrivedAt) {
  const mins = Math.floor((Date.now() - new Date(arrivedAt)) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

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