// ============================================================================
// EmailSender.tsx — Componente principal de envío masivo de emails HTML.
// ============================================================================
// Sistema de diseño neomorfico:
//   - Sombras definen profundidad (no se usa border decorativo)
//   - Superficies comparten --neo-bg / --neo-surface
//   - --neo-accent solo en boton primario y :focus-visible
//   - Todos los interactivos tienen transition-shadow duration-150 ease-in-out
//   - border-radius minimo 12px en todo elemento
// ============================================================================

import { type FormEvent, type DragEvent, type KeyboardEvent, type ChangeEvent, useState, useReducer, useRef, useCallback } from 'react';
import type { UIState, UIAction, SendEmailResponse } from '../types/email';

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

export default function EmailSender() {
  const [htmlContent, setHtmlContent] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'textarea' | 'dropzone'>('textarea');

  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const [subject, setSubject] = useState('');

  const [uiState, dispatch] = useReducer(uiReducer, { type: 'idle' });
  const [showPreview, setShowPreview] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

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

  // Drag & Drop
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
        const trimmed = text.slice(0, MAX_HTML_CHARS);
        setHtmlContent(trimmed);
        setInputMode('dropzone');
      }
    };
    reader.onerror = () => {
      setDragError('Error al leer el archivo');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndLoadFile(files[0]!);
    }
  }, [validateAndLoadFile]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndLoadFile(files[0]!);
    }
    e.target.value = '';
  }, [validateAndLoadFile]);

  // ---- Recipient Handlers ----

  const addRecipient = useCallback((raw: string) => {
    const email = raw.trim();
    if (!email) return;

    if (recipients.length >= MAX_RECIPIENTS) {
      setEmailError(`Maximo ${MAX_RECIPIENTS} destinatarios`);
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Email no valido');
      return;
    }

    if (recipients.includes(email)) {
      setEmailError('Email ya agregado');
      return;
    }

    setEmailError(null);
    setRecipients((prev) => [...prev, email]);
    setEmailInput('');
  }, [recipients]);

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }, []);

  const handleEmailKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipient(emailInput);
    }
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
        if (EMAIL_REGEX.test(email) && !recipients.includes(email)) {
          setRecipients((prev) => [...prev, email]);
          added++;
        }
      }
      if (added === 0 && emails.length > 0) {
        setEmailError('Ningun email valido en la lista pegada');
      } else {
        setEmailError(null);
      }
    }
  }, [recipients]);

  // ---- Submit Handler ----

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();

    if (htmlContent.trim().length === 0) return;
    if (recipients.length === 0) return;
    if (subject.trim().length === 0) return;

    dispatch({ type: 'SEND_START' });

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/send-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            html: htmlContent,
            recipients,
            subject: subject.trim(),
          }),
        }
      );

      const data: SendEmailResponse = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          dispatch({ type: 'SEND_ERROR', message: 'Limite de envios alcanzado. Intenta de nuevo en unos minutos.', details: 'Rate limit de Resend (429)' });
        } else if (res.status === 422) {
          dispatch({ type: 'SEND_ERROR', message: data.errors?.[0]?.error ?? 'Emails con formato invalido', details: JSON.stringify(data.errors) });
        } else {
          dispatch({ type: 'SEND_ERROR', message: data.errors?.[0]?.error ?? 'Error interno del servidor', details: JSON.stringify(data.errors) });
        }
        return;
      }

      if (data.failed === 0) {
        dispatch({ type: 'SEND_SUCCESS', sent: data.sent, total: recipients.length });
      } else if (data.sent > 0) {
        dispatch({ type: 'SEND_PARTIAL', sent: data.sent, total: recipients.length, errors: data.errors });
      } else {
        dispatch({ type: 'SEND_ERROR', message: 'Todos los envios fallaron', details: JSON.stringify(data.errors) });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de conexion';
      dispatch({ type: 'SEND_ERROR', message: `Error de red: ${message}` });
    }
  }, [htmlContent, recipients, subject]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
    setHtmlContent('');
    setRecipients([]);
    setSubject('');
    setEmailInput('');
    setEmailError(null);
    setDragError(null);
    setInputMode('textarea');
  }, []);

  const canSubmit =
    uiState.type === 'idle' &&
    htmlContent.trim().length > 0 &&
    recipients.length > 0 &&
    subject.trim().length > 0;

  const isTextareaDisabled = inputMode === 'dropzone';
  const isDropzoneDisabled = inputMode === 'textarea' && htmlContent.length > 0;

  // ---- Render ----

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--neo-text-primary)]">
          Envio masivo de emails HTML
        </h1>
        <p className="mt-1 text-sm text-[var(--neo-text-muted)]">
          Redacta tu HTML, añade destinatarios y envia hasta {MAX_RECIPIENTS} emails a traves de Resend.
        </p>
      </header>

      {/* Contenedor principal con efecto neomorfico elevado */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-[20px] bg-[var(--neo-surface)] p-8 shadow-neo-raised"
        noValidate
      >

        {/* ============================================================ */}
        {/* SECCION A: Contenido HTML                                     */}
        {/* ============================================================ */}
        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-[var(--neo-text-primary)]">
            Contenido HTML
          </legend>

          {/* ---- Textarea ---- */}
          <div className={isTextareaDisabled ? 'pointer-events-none opacity-40' : ''}>
            <label htmlFor="html-textarea" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Escribe o edita tu HTML
            </label>
            <textarea
              id="html-textarea"
              rows={10}
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
                <span className="text-amber-600 dark:text-amber-400 font-medium">Limite alcanzado</span>
              )}
            </div>
          </div>

          {/* ---- Separador ---- */}
          <div className="my-5 flex items-center gap-3">
            <hr className="flex-1 border-[var(--neo-text-muted)] opacity-40" />
            <span className="text-xs font-medium uppercase text-[var(--neo-text-muted)]">o</span>
            <hr className="flex-1 border-[var(--neo-text-muted)] opacity-40" />
          </div>

          {/* ---- Zona Drag & Drop ---- */}
          <div className={isDropzoneDisabled ? 'pointer-events-none opacity-40' : ''}>
            <label className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Arrastra un archivo .html
            </label>
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !isDropzoneDisabled && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={isDropzoneDisabled ? -1 : 0}
              aria-label="Zona para arrastrar archivo HTML"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed p-8 text-center transition-shadow duration-150 ease-in-out ${
                dragActive
                  ? 'border-[var(--neo-accent)]/60 bg-[var(--neo-bg)] shadow-neo-raised'
                  : 'border-[var(--neo-shadow-dark)]/30 bg-[var(--neo-bg)] shadow-neo-inset'
              } ${isDropzoneDisabled ? 'cursor-not-allowed' : ''}`}
            >
              <svg className="mb-2 h-8 w-8 text-[var(--neo-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-[var(--neo-text-muted)]">
                {dragActive ? 'Suelta el archivo aqui' : 'Arrastra un archivo .html o haz clic para seleccionar'}
              </p>
              <p className="mt-1 text-xs text-[var(--neo-text-muted)] opacity-70">
                Solo archivos .html (max. {MAX_HTML_CHARS.toLocaleString()} caracteres)
              </p>
              {dragError && (
                <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400" role="alert">{dragError}</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,text/html"
              onChange={handleFileSelect}
              className="hidden"
              aria-hidden="true"
            />
          </div>

          {/* ---- Boton Vista Previa ---- */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={htmlContent.trim().length === 0}
              className="rounded-[14px] bg-[var(--neo-bg)] px-5 py-2.5 text-sm font-medium text-[var(--neo-text-primary)] shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Vista previa
            </button>
          </div>
        </fieldset>

        {/* ============================================================ */}
        {/* SECCION B: Destinatarios                                      */}
        {/* ============================================================ */}
        <fieldset>
          <legend className="mb-3 text-lg font-semibold text-[var(--neo-text-primary)]">
            Destinatarios
            <span className="ml-2 text-sm font-normal text-[var(--neo-text-muted)]">
              ({recipients.length}/{MAX_RECIPIENTS})
            </span>
          </legend>

          {/* ---- Tags ---- */}
          {recipients.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label="Lista de destinatarios">
              {recipients.map((email) => (
                <li
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--neo-bg)] px-3.5 py-2 text-sm font-medium text-[var(--neo-text-primary)] shadow-neo-raised-sm transition-shadow duration-150 ease-in-out"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    aria-label={`Eliminar ${email}`}
                    className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--neo-text-muted)] transition-colors hover:text-[var(--neo-accent)]"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ---- Input de email ---- */}
          <div>
            <label htmlFor="email-input" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
              Anade destinatarios
            </label>
            <input
              id="email-input"
              type="text"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onKeyDown={handleEmailKeyDown}
              onPaste={handleEmailPaste}
              placeholder="email@ejemplo.com — Presiona Enter o coma para anadir"
              disabled={recipients.length >= MAX_RECIPIENTS}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              className={`w-full rounded-[14px] bg-[var(--neo-bg)] px-4 py-3 text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out disabled:cursor-not-allowed disabled:opacity-40 ${
                emailError ? 'outline outline-2 outline-red-500/50' : ''
              }`}
            />
            {emailError && (
              <p id="email-error" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {emailError}
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--neo-text-muted)]">
              Presiona{' '}
              <kbd className="rounded-[12px] bg-[var(--neo-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--neo-text-muted)] shadow-neo-raised-sm">Enter</kbd>
              {' '}o{' '}
              <kbd className="rounded-[12px] bg-[var(--neo-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--neo-text-muted)] shadow-neo-raised-sm">,</kbd>
              {' '}para anadir. Tambien puedes pegar una lista separada por comas.
            </p>
          </div>
        </fieldset>

        {/* ============================================================ */}
        {/* Asunto del email                                              */}
        {/* ============================================================ */}
        <fieldset>
          <label htmlFor="subject-input" className="mb-2 block text-sm font-medium text-[var(--neo-text-muted)]">
            Asunto del email
          </label>
          <input
            id="subject-input"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto del correo electronico"
            className="w-full rounded-[14px] bg-[var(--neo-bg)] px-4 py-3 text-sm text-[var(--neo-text-primary)] shadow-neo-inset placeholder-[var(--neo-text-muted)] transition-shadow duration-150 ease-in-out"
          />
        </fieldset>

        {/* ============================================================ */}
        {/* Boton de envio + feedback                                     */}
        {/* ============================================================ */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-[14px] bg-[var(--neo-bg)] px-7 py-3 text-sm font-semibold text-[var(--neo-accent)] shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {uiState.type === 'loading' ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enviando...
              </>
            ) : (
              'Enviar'
            )}
          </button>

          {(uiState.type === 'success' || uiState.type === 'partial') && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-[14px] bg-[var(--neo-bg)] px-5 py-3 text-sm font-medium text-[var(--neo-text-primary)] shadow-neo-raised transition-shadow duration-150 ease-in-out hover:shadow-neo-raised-sm active:shadow-neo-pressed"
            >
              Nuevo envio
            </button>
          )}
        </div>

        {/* ---- Feedback (aria-live) ---- */}
        <div aria-live="polite" aria-atomic="true">
          {/* SUCCESS */}
          {uiState.type === 'success' && (
            <div className="rounded-[16px] bg-[var(--neo-bg)] p-5 shadow-neo-inset" role="status">
              <p className="font-semibold text-green-600 dark:text-green-400">
                Enviado a {uiState.sent} destinatario{uiState.sent !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* PARTIAL */}
          {uiState.type === 'partial' && (
            <div className="rounded-[16px] bg-[var(--neo-bg)] p-5 shadow-neo-inset" role="status">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Enviado a {uiState.sent} de {uiState.total} destinatarios — Ver errores
              </p>
              {uiState.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--neo-text-muted)] hover:text-[var(--neo-text-primary)] transition-colors">
                    Detalle de {uiState.errors.length} error{uiState.errors.length !== 1 ? 'es' : ''}
                  </summary>
                  <ul className="mt-3 space-y-1.5">
                    {uiState.errors.map((err) => (
                      <li key={err.email} className="rounded-[12px] bg-[var(--neo-bg)] px-3 py-2 text-sm text-[var(--neo-text-muted)] shadow-neo-inset">
                        <span className="font-mono font-medium text-[var(--neo-text-primary)]">{err.email}</span>
                        <span className="mx-2 text-[var(--neo-text-muted)] opacity-50">→</span>
                        {err.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* ERROR */}
          {uiState.type === 'error' && (
            <div className="rounded-[16px] bg-[var(--neo-bg)] p-5 shadow-neo-inset" role="alert">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-red-600 dark:text-red-400">{uiState.message}</p>
                {uiState.details && (
                  <button
                    type="button"
                    onClick={() => setShowErrorDetails((prev) => !prev)}
                    className="shrink-0 rounded-[12px] bg-[var(--neo-bg)] px-2.5 py-1 text-xs font-medium text-[var(--neo-accent)] shadow-neo-raised-sm transition-shadow duration-150 ease-in-out hover:shadow-neo-pressed"
                  >
                    {showErrorDetails ? 'Ocultar' : 'Detalles'}
                  </button>
                )}
              </div>
              {showErrorDetails && uiState.details && (
                <pre className="mt-3 overflow-x-auto rounded-[12px] bg-[var(--neo-bg)] p-4 text-xs leading-relaxed text-[var(--neo-text-muted)] shadow-neo-inset">
                  {uiState.details}
                </pre>
              )}
            </div>
          )}
        </div>
      </form>

      {/* ================================================================ */}
      {/* MODAL: Vista previa                                               */}
      {/* ================================================================ */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--neo-shadow-dark)]/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del HTML"
        >
          <div
            className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-[20px] bg-[var(--neo-surface)] shadow-neo-raised"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between rounded-t-[20px] px-6 py-5">
              <h2 className="text-lg font-semibold text-[var(--neo-text-primary)]">
                Vista previa del email
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                aria-label="Cerrar vista previa"
                className="rounded-[14px] p-2 text-[var(--neo-text-muted)] shadow-neo-raised-sm transition-shadow duration-150 ease-in-out hover:text-[var(--neo-text-primary)] hover:shadow-neo-pressed"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* iframe seguro */}
            <div className="flex-1 overflow-hidden rounded-b-[20px]">
              <iframe
                ref={previewFrameRef}
                srcDoc={htmlContent}
                sandbox="allow-same-origin"
                title="Vista previa del email"
                className="h-full w-full border-0 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
