import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import QueuePage from './pages/QueuePage'
import LoginPage from './pages/LoginPage'
import { supabase } from './supabaseClient'
import './index.css'

function App() {
  // session = currently logged in user OR undefined bef checking
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)

  useEffect(() => {
    // check if user is already logged in when page loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })

    // keeps checking for logins or logouts, then updates state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setRole(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // look up user's role from supabase
  const fetchRole = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (data) setRole(data.role)
  }

  // render nth while still checking for login status
  if (session === undefined) return null

  return (
    <BrowserRouter>
      <Routes>
        {/* redirect home if alr logged in, otherwise show login page */}
        <Route path="/login" element={session ? <Navigate to="/" /> : <LoginPage />} />
        {/* redirect to login if not logged in, otherwise show queue */}
        <Route path="/" element={session ? <QueuePage user={session.user} role={role} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
