<p align="center">
  <img src="public/favicon.svg" width="64" alt="Resend HTML" />
</p>

<h1 align="center">Resend HTML</h1>

<p align="center">
  Maquetación y prueba de newsletters HTML en tiempo real con vista previa, envío a múltiples destinatarios y diseño neomórfico con modo oscuro automático.
</p>

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Estilos | Tailwind CSS (neomorfismo puro, sin librerías UI) |
| Backend | Supabase Edge Functions (Deno) |
| Email | Resend API |
| Auth | Supabase Auth (JWT) |
| Base de datos | PostgreSQL (Supabase) |
| Deploy | GitHub Pages (frontend) + Supabase (backend) |

## Estructura

```
├── src/
│   ├── components/
│   │   └── EmailSender.tsx    # Componente principal
│   ├── lib/
│   │   └── supabase.ts        # Cliente Supabase
│   ├── types/
│   │   └── email.ts           # Tipos TypeScript
│   ├── App.tsx                # Auth gate
│   ├── main.tsx               # Entry point
│   ├── index.css              # Tokens CSS + animaciones
│   └── vite-env.d.ts
├── supabase/
│   ├── functions/send-email/  # Edge Function
│   └── migrations/            # Esquema SQL
├── public/                    # Favicons y manifest
├── .github/workflows/         # CI/CD GitHub Pages
└── index.html
```

## Configuración

### 1. Clonar e instalar

```bash
git clone https://github.com/imorlab/resend-html.git
cd resend-html
npm install
```

### 2. Variables de entorno

Copiar `.env.local.example` a `.env.local`:

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_FUNCTIONS_URL=https://<project>.supabase.co/functions/v1
```

### 3. Base de datos

Ejecutar `supabase/migrations/001_create_sent_emails.sql` en el SQL Editor de Supabase.

### 4. Edge Function

```bash
supabase login
supabase link --project-ref <ref>
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set RESEND_FROM="App <tudominio@email.com>"
supabase secrets set SB_URL=https://<project>.supabase.co
supabase secrets set SB_SERVICE_KEY=eyJ...
supabase functions deploy send-email
```

### 5. Crear usuario

En Supabase Dashboard → Authentication → Add user, o desde SQL:

```sql
SELECT supabase_admin.create_user(
  '{"email": "admin@ejemplo.com", "password": "password123"}'
);
```

### 6. Desarrollo

```bash
npm run dev
```

## Diseño

Sistema neomórfico con tokens CSS para modo claro/oscuro automático (`prefers-color-scheme`). Las sombras definen la profundidad — no se usan bordes decorativos. Animación de fondo con orbes flotantes vía `@property` (CSS Houdini).

## Licencia

MIT
