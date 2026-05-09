import { type FormEvent, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface LoginProps {
  onLogin: () => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    onLogin()
  }, [email, password, onLogin])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[24px] bg-[var(--neo-surface)] p-8 shadow-neo-raised">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
            <svg className="h-7 w-7 text-[var(--neo-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--neo-text-primary)]">Resend HTML</h1>
          <p className="mt-1 text-sm text-[var(--neo-text-muted)]">
            Inicia sesion para enviar emails
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="tu@email.com"
              autoComplete="email"
              className="w-full rounded-[14px] bg-[var(--neo-bg)] px-4 py-3 text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Contrasena
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-[14px] bg-[var(--neo-bg)] px-4 py-3 text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-[12px] bg-[var(--neo-bg)] px-4 py-3 text-center text-sm font-medium text-red-600 dark:text-red-400 shadow-neo-inset" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-[14px] bg-[var(--neo-bg)] px-6 py-3 text-sm font-semibold text-[var(--neo-accent)] shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Iniciando sesion...
              </span>
            ) : (
              'Iniciar sesion'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
