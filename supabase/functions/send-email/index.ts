// ============================================================================
// Supabase Edge Function: send-email
// ============================================================================
// Despliegue: supabase functions deploy send-email
// Variables de entorno requeridas (configurar con `supabase secrets set`):
//   RESEND_API_KEY  — API key de Resend (https://resend.com/api-keys)
//   SB_URL          — URL del proyecto Supabase (https://xxx.supabase.co)
//   SB_SERVICE_KEY  — Service role key de Supabase (bypassea RLS)
// ============================================================================

// @deno-types="npm:@types/sanitize-html"
import sanitizeHtml from 'npm:sanitize-html@2.13.0';
import { Resend } from 'npm:resend@4.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

// ---- Constantes ----
const MAX_RECIPIENTS = 50;
const MAX_HTML_LENGTH = 100_000; // 100KB
const HTML_PREVIEW_LENGTH = 500;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Configuración del sanitizador HTML ----
// Whitelist permisiva para emails: permite tablas, estilos inline, imágenes,
// pero elimina scripts, event handlers y URLs peligrosas.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'colgroup', 'col', 'caption', 'style', 'figure', 'figcaption',
    'div', 'span', 'br', 'hr', 'button', 'a',
  ]),
  allowedAttributes: {
    '*': ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'dir', 'lang', 'title'],
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    'col': ['span', 'width'],
    'table': ['role', 'aria-label'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: {
    img: ['https'],        // Solo HTTPS para imágenes (seguridad)
    a: ['https', 'http', 'mailto'],
  },
  // Bloquear explícitamente scripts y event handlers inline
  disallowedTagsMode: 'discard',
  allowedStyles: {
    '*': {
      // Permitir estilos comunes de email (colores, fuentes, espaciado, bordes)
      'color': [/.*/],
      'background-color': [/.*/],
      'background': [/.*/],
      'font-family': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'font-style': [/.*/],
      'text-align': [/.*/],
      'text-decoration': [/.*/],
      'line-height': [/.*/],
      'letter-spacing': [/.*/],
      'margin': [/.*/],
      'margin-top': [/.*/],
      'margin-right': [/.*/],
      'margin-bottom': [/.*/],
      'margin-left': [/.*/],
      'padding': [/.*/],
      'padding-top': [/.*/],
      'padding-right': [/.*/],
      'padding-bottom': [/.*/],
      'padding-left': [/.*/],
      'border': [/.*/],
      'border-top': [/.*/],
      'border-right': [/.*/],
      'border-bottom': [/.*/],
      'border-left': [/.*/],
      'border-collapse': [/.*/],
      'border-spacing': [/.*/],
      'width': [/.*/],
      'height': [/.*/],
      'max-width': [/.*/],
      'display': [/.*/],
      'vertical-align': [/.*/],
      'float': [/.*/],
      'list-style': [/.*/],
    },
  },
};

// ---- Helpers ----

/** Valida el payload de entrada. Retorna null si es válido, o un mensaje de error. */
function validatePayload(body: unknown): { valid: true; data: SendEmailPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'El cuerpo de la solicitud debe ser un objeto JSON' };
  }

  const { html, recipients, subject } = body as Record<string, unknown>;

  if (typeof html !== 'string' || html.trim().length === 0) {
    return { valid: false, error: 'El campo "html" es requerido y debe ser un string no vacío' };
  }
  if (html.length > MAX_HTML_LENGTH) {
    return { valid: false, error: `El HTML excede el límite de ${MAX_HTML_LENGTH} caracteres` };
  }
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return { valid: false, error: 'El campo "subject" es requerido y debe ser un string no vacío' };
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { valid: false, error: 'El campo "recipients" es requerido y debe ser un array no vacío' };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return { valid: false, error: `Máximo ${MAX_RECIPIENTS} destinatarios permitidos. Recibidos: ${recipients.length}` };
  }

  // Validar formato de cada email
  const invalidEmails: string[] = [];
  for (const r of recipients) {
    if (typeof r !== 'string' || !EMAIL_REGEX.test(r)) {
      invalidEmails.push(String(r));
    }
  }
  if (invalidEmails.length > 0) {
    return {
      valid: false,
      error: `Los siguientes emails tienen formato inválido: ${invalidEmails.join(', ')}`,
    };
  }

  return { valid: true, data: { html, recipients, subject } };
}

/** Sanitiza el HTML y extrae los primeros N caracteres para la preview en BD. */
function sanitizeAndPreview(html: string): { sanitized: string; preview: string } {
  const sanitized = sanitizeHtml(html, SANITIZE_OPTIONS);
  const preview = sanitized.slice(0, HTML_PREVIEW_LENGTH);
  return { sanitized, preview };
}

/** Guarda el resultado del envío en la base de datos usando la service_role key. */
async function persistResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: { subject: string; recipients: string[]; sanitizedHtml: string; preview: string; status: 'sent' | 'failed' | 'partial'; errors: RecipientError[]; sentBy?: string | null }
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('sent_emails')
    .insert({
      recipients: payload.recipients,
      subject: payload.subject,
      html_preview: payload.preview,
      status: payload.status,
      error_log: payload.errors,
      sent_by: payload.sentBy ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error al persistir en sent_emails:', error);
    return null;
  }
  return data?.id ?? null;
}

// ---- Tipos locales (evitamos importar desde /src) ----
interface SendEmailPayload {
  html: string;
  recipients: string[];
  subject: string;
}

interface RecipientError {
  email: string;
  error: string;
}

// ---- Dominios permitidos (CORS + validacion de Origin) ----
// ⚠️ Cambia estos valores por tu dominio real de GitHub Pages y el localhost de desarrollo.
const ALLOWED_ORIGINS = [
  'https://imorlab.github.io',
  'http://localhost:5173',    // Vite dev server
  'http://localhost:4173',    // Vite preview
];

function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  return ALLOWED_ORIGINS.find((allowed) => origin === allowed) ?? null;
}

/** Extrae el UUID del usuario desde el JWT de Supabase Auth (campo sub del payload). */
function getUserIdFromJWT(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ---- Handler principal de la Edge Function ----
Deno.serve(async (req: Request) => {
  const allowedOrigin = getAllowedOrigin(req);

  const corsHeaders: Record<string, string> = {};
  if (allowedOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
    corsHeaders['Vary'] = 'Origin';
  }
  corsHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método no permitido. Usa POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validar que la solicitud proviene de un origen autorizado.
  // En GitHub Pages, esto evita que terceros usen tu Edge Function.
  if (!allowedOrigin) {
    return new Response(
      JSON.stringify({ success: false, error: 'Origen no autorizado' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Extraer el ID del usuario desde el JWT de Supabase Auth
  const sentBy = getUserIdFromJWT(req);

  // ---- 1. Parsear y validar el payload ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'El cuerpo debe ser JSON válido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const validation = validatePayload(body);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, sent: 0, failed: 0, errors: [{ email: '', error: validation.error }] }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { html, recipients, subject } = validation.data;

  // ---- 2. Sanitizar HTML ----
  const { sanitized: sanitizedHtml, preview } = sanitizeAndPreview(html);

  // ---- 3. Inicializar clientes ----
  const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
  const resendFrom = Deno.env.get('RESEND_FROM')!;
  const supabaseUrl = Deno.env.get('SB_URL')!;
  const supabaseServiceKey = Deno.env.get('SB_SERVICE_KEY')!;

  if (!resendApiKey || !resendFrom || !supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ success: false, sent: 0, failed: recipients.length, errors: [{ email: '', error: 'Configuración del servidor incompleta' }] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const resend = new Resend(resendApiKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // ---- 4. Enviar emails en batch con Promise.allSettled ----
  // Cada envío fallido no aborta a los demás.
  const sendPromises = recipients.map(async (recipient) => {
    try {
      const { error } = await resend.emails.send({
        from: resendFrom,
        to: recipient,
        subject,
        html: sanitizedHtml,
      });
      if (error) {
        return { email: recipient, error: error.message };
      }
      return { email: recipient, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al enviar';
      return { email: recipient, error: message };
    }
  });

  const results = await Promise.allSettled(sendPromises);

  // Procesar resultados
  const errors: RecipientError[] = [];
  let sentCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.error === null) {
      sentCount++;
    } else if (result.status === 'fulfilled' && result.value.error !== null) {
      errors.push({ email: result.value.email, error: result.value.error! });
    } else {
      // Promise rechazada (fallo inesperado en el wrapper)
      errors.push({ email: 'desconocido', error: 'Error interno en el procesamiento del envío' });
    }
  }

  const failedCount = errors.length;

  // Determinar estado agregado
  let status: 'sent' | 'failed' | 'partial';
  if (sentCount === recipients.length) {
    status = 'sent';
  } else if (sentCount === 0) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  // ---- 5. Persistir resultado en BD ----
  const recordId = await persistResult(supabaseAdmin, {
    subject,
    recipients,
    sanitizedHtml,
    preview,
    status,
    errors,
    sentBy,
  });

  // ---- 6. Responder ----
  const response = {
    success: status !== 'failed',
    sent: sentCount,
    failed: failedCount,
    errors,
    record_id: recordId,
  };

  const httpStatus = status === 'failed' ? 500 : status === 'partial' ? 207 : 200;

  return new Response(JSON.stringify(response), {
    status: httpStatus,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
