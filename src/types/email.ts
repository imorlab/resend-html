// ============================================================================
// Tipos compartidos para el sistema de envío masivo de emails.
// Estos tipos se usan tanto en el frontend (React) como en la Edge Function.
// ============================================================================

// ---- Payload que recibe la Edge Function ----
export interface SendEmailPayload {
  html: string;
  recipients: string[];
  subject: string;
}

// ---- Error individual por destinatario ----
export interface RecipientError {
  email: string;
  error: string;
}

// ---- Respuesta de la Edge Function ----
export interface SendEmailResponse {
  success: boolean;
  sent: number;
  failed: number;
  errors: RecipientError[];
  /** ID del registro creado en sent_emails, útil para auditoría */
  record_id?: string;
}

// ---- Registro en la tabla sent_emails ----
export type EmailStatus = 'sent' | 'failed' | 'partial';

export interface SentEmailRecord {
  id: string;
  created_at: string;
  recipients: string[];
  subject: string;
  html_preview: string | null;
  status: EmailStatus;
  error_log: RecipientError[];
  sent_by: string | null;
}

// ---- Estados de la UI del frontend ----
export type UIState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; sent: number; total: number }
  | { type: 'partial'; sent: number; total: number; errors: RecipientError[] }
  | { type: 'error'; message: string; details?: string };

// ---- Acciones del reducer ----
export type UIAction =
  | { type: 'SEND_START' }
  | { type: 'SEND_SUCCESS'; sent: number; total: number }
  | { type: 'SEND_PARTIAL'; sent: number; total: number; errors: RecipientError[] }
  | { type: 'SEND_ERROR'; message: string; details?: string }
  | { type: 'RESET' };
