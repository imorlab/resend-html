-- ============================================================================
-- Migración 001: Tabla sent_emails y políticas RLS
-- Descripción: Almacena el registro de cada envío masivo de emails HTML,
--              incluyendo estado, errores por destinatario y vista previa.
-- ============================================================================

-- 1. CREAR LA TABLA PRINCIPAL
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Destinatarios como array nativo de Postgres (indexable con GIN)
  recipients    text[] NOT NULL DEFAULT '{}',

  -- Asunto del correo (obligatorio, sin límite arbitrario)
  subject       text NOT NULL,

  -- Primeros 500 caracteres del HTML ya sanitizado que se envió.
  -- Se guarda para auditoría y vista previa rápida sin re-renderizar el HTML completo.
  html_preview  text,

  -- Estado del envío masivo: 'sent' (todos OK), 'failed' (todos fallaron),
  -- 'partial' (al menos uno falló y al menos uno se envió).
  status        text NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent', 'failed', 'partial')),

  -- JSON con detalle de errores por cada destinatario que falló.
  -- Estructura: [{ email: string, error: string }]
  error_log     jsonb DEFAULT '[]'::jsonb,

  -- Usuario autenticado que realizó el envío (FK a auth.users).
  -- Es nullable para soportar envíos desde edge functions sin auth de usuario.
  sent_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. ÍNDICES PARA PERFORMANCE
-- Búsqueda por remitente (dashboard de usuario)
CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_by
  ON public.sent_emails (sent_by);

-- Búsqueda por fecha de creación (listados cronológicos)
CREATE INDEX IF NOT EXISTS idx_sent_emails_created_at
  ON public.sent_emails (created_at DESC);

-- Búsqueda por estado (filtros de dashboard)
CREATE INDEX IF NOT EXISTS idx_sent_emails_status
  ON public.sent_emails (status);

-- Búsqueda full-text sobre el array de recipients (GIN index)
CREATE INDEX IF NOT EXISTS idx_sent_emails_recipients
  ON public.sent_emails USING GIN (recipients);

-- 3. POLÍTICAS ROW LEVEL SECURITY (RLS)
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

-- POLÍTICA: SELECT — Los usuarios autenticados solo ven sus propios envíos.
-- Los administradores (rol service_role) ven todo (usado por la Edge Function).
CREATE POLICY "Usuarios ven sus propios envíos"
  ON public.sent_emails
  FOR SELECT
  TO authenticated
  USING (sent_by = auth.uid());

-- POLÍTICA: INSERT — Solo el service_role (Edge Function) puede insertar registros.
-- Esto evita que un cliente malicioso inyecte registros falsos desde el frontend.
-- Nota: El INSERT desde la Edge Function usa la service_role key, que bypassea RLS.
CREATE POLICY "Solo service_role puede insertar"
  ON public.sent_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (false); -- Bloquea inserts desde el cliente; la Edge Function usa service_role.

-- POLÍTICA: UPDATE/DELETE — Denegados para todos los roles excepto service_role.
-- Los registros de auditoría no deben ser modificables ni eliminables por usuarios.
CREATE POLICY "Bloquear UPDATE para usuarios"
  ON public.sent_emails
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Bloquear DELETE para usuarios"
  ON public.sent_emails
  FOR DELETE
  TO authenticated
  USING (false);

-- 4. COMENTARIOS DE DOCUMENTACIÓN
COMMENT ON TABLE public.sent_emails
  IS 'Registro de envíos masivos de emails HTML realizados a través de Resend';

COMMENT ON COLUMN public.sent_emails.html_preview
  IS 'Primeros 500 caracteres del HTML sanitizado que se envió efectivamente';

COMMENT ON COLUMN public.sent_emails.error_log
  IS 'Array JSON con objetos { email: string, error: string } para cada destinatario fallido';

COMMENT ON COLUMN public.sent_emails.status
  IS 'sent = todos los destinatarios recibieron el email; failed = ningún envío exitoso; partial = envío mixto';
