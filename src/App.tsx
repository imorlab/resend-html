import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import EmailSender from './components/EmailSender'

export interface AppSession {
  access_token: string
  email: string
}

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar que la sesion almacenada realmente es valida
    supabase.auth.getSession().then(async ({ data: { session: storedSession } }) => {
      if (storedSession) {
        const { data: { user }, error } = await supabase.auth.getUser(storedSession.access_token)
        if (user && !error) {
          setSession({
            access_token: storedSession.access_token,
            email: user.email ?? '',
          })
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, authSession) => {
      if (authSession) {
        const { data: { user } } = await supabase.auth.getUser(authSession.access_token)
        if (user) {
          setSession({
            access_token: authSession.access_token,
            email: user.email ?? '',
          })
          return
        }
      }
      setSession(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  const handleLoginSuccess = (newSession: AppSession) => {
    setSession(newSession)
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

  return (
    <EmailSender
      isAuthenticated={!!session}
      accessToken={session?.access_token ?? ''}
      userEmail={session?.email ?? ''}
      onLogout={handleLogout}
      onLoginSuccess={handleLoginSuccess}
    />
  )
}
