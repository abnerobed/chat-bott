# PERSONAL AI

Asistente web estático con chat, voz, autenticación e historial privado. El chat requiere una cuenta de Supabase y una clave de OpenRouter; no funciona como IA en modo desconectado.

## Configuración

1. Crea un proyecto de Supabase y ejecuta [`supabase.sql`](./supabase.sql) en su SQL Editor.
2. En Supabase, copia la **Project URL** y la clave pública **anon** (o **publishable**). No uses la clave `service_role` ni la clave `secret`.
3. En el proyecto de Vercel, agrega estas variables de entorno para **Production**, **Preview** y **Development**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (la clave pública anon/publishable)
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (un modelo disponible en tu cuenta de OpenRouter)
   - `ALLOWED_ORIGIN` (opcional; origen completo permitido, por ejemplo `https://tu-dominio.example`)
4. Importa el repositorio de GitHub en Vercel y establece `personal-ai` como **Root Directory**. La carpeta contiene tanto `index.html` como las funciones `api/config.js` y `api/chat.js`.
5. Para desarrollo local, crea `.env.local` en esta carpeta con las variables anteriores, instala la CLI de Vercel (`npm install --global vercel`) y ejecuta `npm run dev`. Nunca publiques `.env.local`.

La app obtiene la URL y la clave pública de Supabase desde `/api/config`; esa clave está diseñada para usarse desde el navegador y está protegida por las políticas RLS de [`supabase.sql`](./supabase.sql). La clave de OpenRouter se utiliza solo desde `/api/chat` y debe permanecer exclusivamente en las variables de entorno del servidor. Cada push a la rama conectada de GitHub iniciará un nuevo despliegue de Vercel.
