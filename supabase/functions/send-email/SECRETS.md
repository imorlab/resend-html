# Secretos de Supabase Edge Function

Configura los siguientes secretos con el CLI de Supabase:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM="Tu Nombre <tu@email.com>"
supabase secrets set SB_URL=https://xxxxxxxxxxxx.supabase.co
supabase secrets set SB_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Obtencion de cada secreto

| Variable | Fuente | Notas |
|---|---|---|
| `RESEND_API_KEY` | [Resend API Keys](https://resend.com/api-keys) | Crea una key con permisos de envio |
| `RESEND_FROM` | Tu email registrado en Resend | Ej: `"App <tu@email.com>"`. Se usa como remitente en todos los envios |
| `SB_URL` | Supabase Dashboard > Settings > API > Project URL | La URL base de tu proyecto |
| `SB_SERVICE_KEY` | Supabase Dashboard > Settings > API > service_role | **Nunca** expongas esta key en el frontend |

## Despliegue de la Edge Function

```bash
supabase functions deploy send-email --no-verify-jwt
```

El flag `--no-verify-jwt` omite la verificación de autenticación, ya que el endpoint puede recibir llamadas sin usuario autenticado (la seguridad se delega a RLS en la BD y a la validación del payload).
