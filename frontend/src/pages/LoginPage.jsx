// login page for users

// tracking input and login state
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  //sends login req to supabase to check if login in valid
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '34px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>TriageFlow</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>Emergency Department Queue System</p>
      </div>

      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '32px 36px', width: '100%', maxWidth: '380px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '22px' }}>Sign in to your account</h2>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@hospital.sg"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={signInBtn}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

        </form>
      </div>

    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: '#64748b',
  marginBottom: '5px',
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '7px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#0f172a',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const signInBtn = {
  padding: '10px',
  background: '#1e293b',
  color: '#fff',
  border: 'none',
  borderRadius: '7px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '4px',
}
