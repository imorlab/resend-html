import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import EmailSender from './components/EmailSender'

export default function App() {
  const [session, setSession] = useState<{ access_token: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Al montar: restaurar sesion existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession({ access_token: session.access_token })
      }
      setLoading(false)
    })

    // Suscribirse a cambios de autenticacion (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession({ access_token: session.access_token })
      } else {
        setSession(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-[var(--neo-text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!session) {
    return <Login onLogin={() => {}} />
  }

  return <EmailSender accessToken={session.access_token} onLogout={handleLogout} />
}
