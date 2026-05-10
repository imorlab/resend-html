// ============================================================================
// EmailSender.tsx — Componente principal de envio masivo de emails HTML.
// ============================================================================
// Layout: dos columnas en desktop (HTML a la izq, destinatarios/accion a la der)
// Auth: formulario siempre visible. Al pulsar Enviar sin sesion → modal de login.
// ============================================================================

import { type FormEvent, type DragEvent, type KeyboardEvent, type ChangeEvent, useState, useReducer, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UIState, UIAction, SendEmailResponse } from '../types/email';
import type { AppSession } from '../App';

const MAX_RECIPIENTS = 50;
const MAX_HTML_CHARS = 100_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function uiReducer(_state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SEND_START':
      return { type: 'loading' };
    case 'SEND_SUCCESS':
      return { type: 'success', sent: action.sent, total: action.total };
    case 'SEND_PARTIAL':
      return { type: 'partial', sent: action.sent, total: action.total, errors: action.errors };
    case 'SEND_ERROR':
      return { type: 'error', message: action.message, details: action.details };
    case 'RESET':
      return { type: 'idle' };
  }
}

interface EmailSenderProps {
  isAuthenticated: boolean
  accessToken: string
  userEmail: string
  onLogout: () => void
  onLoginSuccess: (session: AppSession) => void
}

export default function EmailSender({ isAuthenticated, accessToken, userEmail, onLogout, onLoginSuccess }: EmailSenderProps) {
  // ---- HTML ----
  const [htmlContent, setHtmlContent] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'textarea' | 'dropzone'>('textarea');

  // ---- Recipients ----
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // ---- Subject + UI ----
  const [subject, setSubject] = useState('');
  const [uiState, dispatch] = useReducer(uiReducer, { type: 'idle' });
  const [showPreview, setShowPreview] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // ---- Login modal ----
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSubmitRef = useRef(false);

  // ---- Auto-dismiss del popup de exito ----
  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET' });
    setHtmlContent('');
    setRecipients([]);
    setSubject('');
    setEmailInput('');
    setEmailError(null);
    setDragError(null);
    setShowErrorDetails(false);
    setInputMode('textarea');
  }, []);

  useEffect(() => {
    if (uiState.type === 'success') {
      autoDismissRef.current = setTimeout(resetForm, 3500);
      return () => clearTimeout(autoDismissRef.current);
    }
  }, [uiState.type, resetForm]);

  // ---- HTML Content Handlers ----

  const handleHtmlChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_HTML_CHARS) {
      setHtmlContent(value);
    }
    if (value.length > 0) {
      setInputMode('textarea');
    }
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateAndLoadFile = useCallback((file: File) => {
    setDragError(null);
    const validMime = file.type === 'text/html';
    const validExt = file.name.toLowerCase().endsWith('.html');
    if (!validMime || !validExt) {
      setDragError('Solo se aceptan archivos .html');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setHtmlContent(text.slice(0, MAX_HTML_CHARS));
        setInputMode('dropzone');
      }
    };
    reader.onerror = () => setDragError('Error al leer el archivo');
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) validateAndLoadFile(e.dataTransfer.files[0]!);
  }, [validateAndLoadFile]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) validateAndLoadFile(e.target.files[0]!);
    e.target.value = '';
  }, [validateAndLoadFile]);

  // ---- Recipient Handlers ----

  const addRecipient = useCallback((raw: string) => {
    const email = raw.trim();
    if (!email) return;
    if (recipients.length >= MAX_RECIPIENTS) { setEmailError(`Maximo ${MAX_RECIPIENTS} destinatarios`); return; }
    if (!EMAIL_REGEX.test(email)) { setEmailError('Email no valido'); return; }
    if (recipients.includes(email)) { setEmailError('Email ya agregado'); return; }
    setEmailError(null);
    setRecipients((prev) => [...prev, email]);
    setEmailInput('');
  }, [recipients]);

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }, []);

  const handleEmailKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipient(emailInput); }
    if (e.key === 'Backspace' && emailInput === '' && recipients.length > 0) {
      removeRecipient(recipients[recipients.length - 1]!);
    }
  }, [emailInput, addRecipient, recipients, removeRecipient]);

  const handleEmailPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData('text');
    if (pasteData.includes(',')) {
      e.preventDefault();
      const emails = pasteData.split(',').map((s) => s.trim()).filter(Boolean);
      let added = 0;
      for (const email of emails) {
        if (recipients.length + added >= MAX_RECIPIENTS) break;
        if (EMAIL_REGEX.test(email) && !recipients.includes(email)) { setRecipients((prev) => [...prev, email]); added++; }
      }
      if (added === 0 && emails.length > 0) setEmailError('Ningun email valido en la lista pegada');
      else setEmailError(null);
    }
  }, [recipients]);

  // ---- Submit Handler ----

  const executeSend = useCallback(async (token: string) => {
    dispatch({ type: 'SEND_START' });
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ html: htmlContent, recipients, subject: subject.trim() }),
      });
      const data: SendEmailResponse = await res.json();
      if (!res.ok) {
        if (res.status === 429) dispatch({ type: 'SEND_ERROR', message: 'Limite de envios alcanzado. Intenta de nuevo en unos minutos.', details: 'Rate limit de Resend (429)' });
        else if (res.status === 422) dispatch({ type: 'SEND_ERROR', message: data.errors?.[0]?.error ?? 'Emails con formato invalido', details: JSON.stringify(data.errors) });
        else dispatch({ type: 'SEND_ERROR', message: data.errors?.[0]?.error ?? 'Error interno del servidor', details: JSON.stringify(data.errors) });
        return;
      }
      if (data.failed === 0) dispatch({ type: 'SEND_SUCCESS', sent: data.sent, total: recipients.length });
      else if (data.sent > 0) dispatch({ type: 'SEND_PARTIAL', sent: data.sent, total: recipients.length, errors: data.errors });
      else dispatch({ type: 'SEND_ERROR', message: 'Todos los envios fallaron', details: JSON.stringify(data.errors) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de conexion';
      dispatch({ type: 'SEND_ERROR', message: `Error de red: ${message}` });
    }
  }, [htmlContent, recipients, subject]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (htmlContent.trim().length === 0 || recipients.length === 0 || subject.trim().length === 0) return;

    if (isAuthenticated) {
      await executeSend(accessToken);
      return;
    }

    // No autenticado: mostrar modal de login
    pendingSubmitRef.current = true;
    setLoginEmail(userEmail || '');
    setLoginPassword('');
    setLoginError(null);
    setShowLoginModal(true);
  }, [htmlContent, recipients, subject, isAuthenticated, accessToken, userEmail, executeSend]);

  // ---- Login modal handlers ----

  const handleLoginSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return;

    setLoginLoading(true);
    setLoginError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    setLoginLoading(false);

    if (authError) {
      setLoginError(authError.message);
      return;
    }

    if (data.session) {
      const token = data.session.access_token;
      const email = data.session.user?.email ?? loginEmail;
      onLoginSuccess({ access_token: token, email });
      setShowLoginModal(false);

      // Si el usuario pulso Enviar antes de loguearse, ejecutar el envio ahora
      if (pendingSubmitRef.current) {
        pendingSubmitRef.current = false;
        await executeSend(token);
      }
    }
  }, [loginEmail, loginPassword, onLoginSuccess, executeSend]);

  const closeLoginModal = useCallback(() => {
    setShowLoginModal(false);
    pendingSubmitRef.current = false;
  }, []);

  // ---- Derived ----

  const canSubmit =
    uiState.type === 'idle' &&
    htmlContent.trim().length > 0 &&
    recipients.length > 0 &&
    subject.trim().length > 0;

  const isTextareaDisabled = inputMode === 'dropzone';
  const isDropzoneDisabled = inputMode === 'textarea' && htmlContent.length > 0;
  const popupVisible = uiState.type === 'success' || uiState.type === 'partial' || uiState.type === 'error';

  // ---- Refs comunes para tailwind ----
  const inputClass = 'w-full rounded-[14px] bg-[var(--neo-bg)] px-4 py-3 text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out';
  const btnBase = 'rounded-[14px] bg-[var(--neo-bg)] transition-shadow duration-150 ease-in-out shadow-neo-raised hover:shadow-neo-raised-sm active:shadow-neo-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none';

  // ---- Render ----

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ================================================================ */}
      {/* HEADER                                                            */}
      {/* ================================================================ */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--neo-text-primary)]">Resend HTML</h1>
          {userEmail ? (
            <p className="mt-0.5 text-sm text-[var(--neo-text-muted)]">{userEmail}</p>
          ) : (
            <p className="mt-0.5 text-sm text-[var(--neo-text-muted)]">
              Inicia sesión para enviar — puedes escribir el HTML sin registrarte
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button type="button" onClick={onLogout} className={`${btnBase} px-4 py-2.5 text-sm font-medium text-[var(--neo-text-muted)] hover:text-[var(--neo-text-primary)]`}>
              Cerrar sesion
            </button>
          ) : (
            <button type="button" onClick={() => { setLoginEmail(''); setLoginPassword(''); setLoginError(null); setShowLoginModal(true); }} className={`${btnBase} px-4 py-2.5 text-sm font-medium text-[var(--neo-accent)]`}>
              Iniciar sesion
            </button>
          )}
        </div>
      </header>

      {/* ================================================================ */}
      {/* FORM: Dos columnas en desktop                                     */}
      {/* ================================================================ */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 rounded-[20px] bg-[var(--neo-surface)] p-6 shadow-neo-raised lg:grid-cols-[5fr_4fr] lg:gap-8 lg:p-8" noValidate>

        {/* ============================================================ */}
        {/* COLUMNA IZQUIERDA: Contenido HTML                             */}
        {/* ============================================================ */}
        <div className="flex flex-col">
          <h2 className="mb-4 text-lg font-semibold text-[var(--neo-text-primary)]">Contenido HTML</h2>

          {/* Textarea */}
          <div className={isTextareaDisabled ? 'pointer-events-none opacity-40' : ''}>
            <label htmlFor="html-textarea" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Escribe o edita tu HTML
            </label>
            <textarea
              id="html-textarea"
              rows={14}
              maxLength={MAX_HTML_CHARS}
              value={htmlContent}
              onChange={handleHtmlChange}
              placeholder="<html><body><h1>Hola</h1></body></html>"
              className="w-full rounded-[16px] bg-[var(--neo-bg)] p-4 font-mono text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out"
              disabled={isTextareaDisabled}
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--neo-text-muted)]">
              <span>{htmlContent.length.toLocaleString()} / {MAX_HTML_CHARS.toLocaleString()} caracteres</span>
              {htmlContent.length >= MAX_HTML_CHARS && (
                <span className="font-medium text-amber-600 dark:text-amber-400">Limite alcanzado</span>
              )}
            </div>
          </div>

          {/* Separador */}
          <div className="my-4 flex items-center gap-3">
            <hr className="flex-1 border-[var(--neo-text-muted)] opacity-40" />
            <span className="text-xs font-medium uppercase text-[var(--neo-text-muted)]">o</span>
            <hr className="flex-1 border-[var(--neo-text-muted)] opacity-40" />
          </div>

          {/* Dropzone */}
          <div className={`flex flex-col ${isDropzoneDisabled ? 'pointer-events-none opacity-40' : ''}`}>
            <label className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Arrastra un archivo .html
            </label>
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !isDropzoneDisabled && fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              role="button"
              tabIndex={isDropzoneDisabled ? -1 : 0}
              aria-label="Zona para arrastrar archivo HTML"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed p-6 text-center transition-shadow duration-150 ease-in-out ${
                dragActive
                  ? 'border-[var(--neo-accent)]/60 bg-[var(--neo-bg)] shadow-neo-raised'
                  : 'border-[var(--neo-shadow-dark)]/30 bg-[var(--neo-bg)] shadow-neo-inset'
              } ${isDropzoneDisabled ? 'cursor-not-allowed' : ''}`}
            >
              <svg className="mb-2 h-7 w-7 text-[var(--neo-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-[var(--neo-text-muted)]">{dragActive ? 'Suelta el archivo aqui' : 'Arrastra un archivo .html o haz clic'}</p>
              <p className="mt-1 text-xs text-[var(--neo-text-muted)] opacity-70">Solo .html (max. {MAX_HTML_CHARS.toLocaleString()} chars)</p>
              {dragError && <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400" role="alert">{dragError}</p>}
            </div>
            <input ref={fileInputRef} type="file" accept=".html,text/html" onChange={handleFileSelect} className="hidden" aria-hidden="true" />
          </div>

          {/* Vista previa */}
          <div className="mt-4">
            <button type="button" onClick={() => setShowPreview(true)} disabled={htmlContent.trim().length === 0}
              className={`${btnBase} px-5 py-2.5 text-sm font-medium text-[var(--neo-text-primary)]`}>
              Vista previa
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMNA DERECHA: Destinatarios + Asunto + Enviar              */}
        {/* ============================================================ */}
        <div className="flex flex-col">
          {/* Destinatarios */}
          <h2 className="mb-4 text-lg font-semibold text-[var(--neo-text-primary)]">
            Destinatarios <span className="text-sm font-normal text-[var(--neo-text-muted)]">({recipients.length}/{MAX_RECIPIENTS})</span>
          </h2>

          {recipients.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label="Lista de destinatarios">
              {recipients.map((email) => (
                <li key={email} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--neo-bg)] px-3.5 py-2 text-sm font-medium text-[var(--neo-text-primary)] shadow-neo-raised-sm transition-shadow duration-150 ease-in-out">
                  <span>{email}</span>
                  <button type="button" onClick={() => removeRecipient(email)} aria-label={`Eliminar ${email}`}
                    className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--neo-text-muted)] transition-colors hover:text-[var(--neo-accent)]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="email-input" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">Anade destinatarios</label>
            <input
              id="email-input" type="text"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); if (emailError) setEmailError(null); }}
              onKeyDown={handleEmailKeyDown}
              onPaste={handleEmailPaste}
              placeholder="email@ejemplo.com — Enter o coma para anadir"
              disabled={recipients.length >= MAX_RECIPIENTS}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              className={`${inputClass} ${emailError ? 'outline outline-2 outline-red-500/50' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
            />
            {emailError && <p id="email-error" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{emailError}</p>}
            <p className="mt-2 text-xs text-[var(--neo-text-muted)]">
              Presiona <kbd className="rounded-[12px] bg-[var(--neo-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--neo-text-muted)] shadow-neo-raised-sm">Enter</kbd> o <kbd className="rounded-[12px] bg-[var(--neo-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--neo-text-muted)] shadow-neo-raised-sm">,</kbd> para anadir. Soporta pegado multiple.
            </p>
          </div>

          {/* Asunto */}
          <div className="mt-5">
            <label htmlFor="subject-input" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">Asunto del email</label>
            <input
              id="subject-input" type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del correo electronico"
              className={inputClass}
            />
          </div>

          {/* Boton Enviar */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--neo-bg)] px-7 py-3 text-sm font-semibold shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${
                isAuthenticated ? 'text-[var(--neo-accent)]' : 'text-[var(--neo-text-primary)]'
              }`}
            >
              {uiState.type === 'loading' ? (
                <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Enviando...</>
              ) : isAuthenticated ? 'Enviar' : 'Iniciar sesion para enviar'}
            </button>
          </div>
        </div>
      </form>

      {/* ================================================================ */}
      {/* MODAL: Login                                                      */}
      {/* ================================================================ */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--neo-shadow-dark)]/60 p-4 backdrop-blur-sm"
          onClick={closeLoginModal} role="dialog" aria-modal="true" aria-label="Iniciar sesion">
          <div className="animate-popup-in relative w-full max-w-sm rounded-[24px] bg-[var(--neo-surface)] p-8 shadow-neo-raised" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
                <svg className="h-6 w-6 text-[var(--neo-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-[var(--neo-text-primary)]">Inicia sesion para enviar</h2>
            </div>
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">Email</label>
                <input id="login-email" type="email" value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                  placeholder="tu@email.com" autoComplete="email" className={inputClass} />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">Contrasena</label>
                <input id="login-password" type="password" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                  placeholder="••••••••" autoComplete="current-password" className={inputClass} />
              </div>
              {loginError && (
                <p className="rounded-[12px] bg-[var(--neo-bg)] px-4 py-3 text-center text-sm font-medium text-red-600 dark:text-red-400 shadow-neo-inset" role="alert">{loginError}</p>
              )}
              <button type="submit" disabled={loginLoading || !loginEmail || !loginPassword}
                className={`${btnBase} w-full px-6 py-3 text-sm font-semibold text-[var(--neo-accent)]`}>
                {loginLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Iniciando sesion...
                  </span>
                ) : 'Iniciar sesion y enviar'}
              </button>
              <button type="button" onClick={closeLoginModal}
                className="w-full rounded-[14px] bg-[var(--neo-bg)] px-6 py-3 text-sm font-medium text-[var(--neo-text-muted)] shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed">
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* POPUP: Feedback                                                   */}
      {/* ================================================================ */}
      {popupVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--neo-shadow-dark)]/60 p-4 backdrop-blur-sm"
          role="dialog" aria-modal="true"
          aria-label={uiState.type === 'success' ? 'Envio exitoso' : uiState.type === 'partial' ? 'Envio parcial' : 'Error en el envio'}>
          <div className="animate-popup-in relative flex w-full max-w-md flex-col items-center rounded-[24px] bg-[var(--neo-surface)] p-8 shadow-neo-raised text-center">
            {uiState.type === 'success' && (
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
                <svg className="h-8 w-8 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
            )}
            {uiState.type === 'partial' && (
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
                <svg className="h-8 w-8 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
            )}
            {uiState.type === 'error' && (
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
                <svg className="h-8 w-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
            )}
            {uiState.type === 'success' && <h2 className="text-xl font-bold text-[var(--neo-text-primary)]">Envio exitoso</h2>}
            {uiState.type === 'partial' && <h2 className="text-xl font-bold text-[var(--neo-text-primary)]">Envio parcial</h2>}
            {uiState.type === 'error' && <h2 className="text-xl font-bold text-[var(--neo-text-primary)]">Error</h2>}
            {uiState.type === 'success' && <p className="mt-2 text-[var(--neo-text-muted)]">Enviado a {uiState.sent} destinatario{uiState.sent !== 1 ? 's' : ''}</p>}
            {uiState.type === 'partial' && <p className="mt-2 text-[var(--neo-text-muted)]">Enviado a {uiState.sent} de {uiState.total} destinatarios</p>}
            {uiState.type === 'error' && <p className="mt-2 text-[var(--neo-text-muted)]">{uiState.message}</p>}

            {(uiState.type === 'partial' && uiState.errors.length > 0) && (
              <details className="mt-4 w-full text-left">
                <summary className="cursor-pointer text-sm font-medium text-[var(--neo-text-muted)] hover:text-[var(--neo-text-primary)] transition-colors">Ver detalle de {uiState.errors.length} error{uiState.errors.length !== 1 ? 'es' : ''}</summary>
                <ul className="mt-3 space-y-1.5">
                  {uiState.errors.map((err) => (
                    <li key={err.email} className="rounded-[12px] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--neo-text-muted)] shadow-neo-inset">
                      <span className="font-mono font-medium text-[var(--neo-text-primary)]">{err.email}</span><span className="mx-2 opacity-40">→</span>{err.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {uiState.type === 'error' && uiState.details && (
              <details className="mt-4 w-full text-left">
                <summary className="cursor-pointer text-sm font-medium text-[var(--neo-text-muted)] hover:text-[var(--neo-text-primary)] transition-colors" onClick={() => setShowErrorDetails((prev) => !prev)}>
                  {showErrorDetails ? 'Ocultar' : 'Ver'} detalles tecnicos
                </summary>
                {showErrorDetails && <pre className="mt-3 overflow-x-auto rounded-[12px] bg-[var(--neo-bg)] p-3 text-xs leading-relaxed text-[var(--neo-text-muted)] shadow-neo-inset">{uiState.details}</pre>}
              </details>
            )}

            <div className="mt-7 flex w-full flex-col gap-3">
              {uiState.type === 'success' ? (
                <>
                  <p className="text-xs text-[var(--neo-text-muted)] opacity-50 animate-pulse">Este mensaje se cerrara automaticamente</p>
                  <button type="button" onClick={resetForm} className={`${btnBase} px-6 py-2.5 text-sm font-semibold text-[var(--neo-accent)]`}>Nuevo envio</button>
                </>
              ) : (
                <div className="flex gap-3">
                  {uiState.type === 'error' && (
                    <button type="button" onClick={() => dispatch({ type: 'RESET' })} className={`${btnBase} flex-1 px-5 py-2.5 text-sm font-medium text-[var(--neo-text-primary)]`}>OK</button>
                  )}
                  {uiState.type === 'partial' && (
                    <button type="button" onClick={() => dispatch({ type: 'RESET' })} className={`${btnBase} flex-1 px-5 py-2.5 text-sm font-semibold text-[var(--neo-accent)]`}>Entendido</button>
                  )}
                  <button type="button" onClick={resetForm} className={`${btnBase} flex-1 px-5 py-2.5 text-sm font-medium text-[var(--neo-text-primary)]`}>Nuevo envio</button>
                </div>
              )}
            </div>
            {uiState.type === 'success' && (
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[var(--neo-bg)] shadow-neo-inset">
                <div className="h-full rounded-full bg-green-400 dark:bg-green-500 animate-[shrink_3.5s_ease-in_forwards]" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: Vista previa                                               */}
      {/* ================================================================ */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--neo-shadow-dark)]/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPreview(false)} role="dialog" aria-modal="true" aria-label="Vista previa del HTML">
          <div className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-[20px] bg-[var(--neo-surface)] shadow-neo-raised" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-[20px] px-6 py-5">
              <h2 className="text-lg font-semibold text-[var(--neo-text-primary)]">Vista previa del email</h2>
              <button type="button" onClick={() => setShowPreview(false)} aria-label="Cerrar vista previa"
                className="rounded-[14px] p-2 text-[var(--neo-text-muted)] shadow-neo-raised-sm transition-shadow duration-150 ease-in-out hover:text-[var(--neo-text-primary)] hover:shadow-neo-pressed">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-[20px]">
              <iframe ref={previewFrameRef} srcDoc={htmlContent} sandbox="allow-same-origin" title="Vista previa del email" className="h-full w-full border-0 bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
