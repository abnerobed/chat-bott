# PERSONAL AI

Asistente web estático con chat, voz, autenticación e historial privado. El chat requiere una cuenta de Supabase y una clave de OpenRouter; no funciona como IA en modo desconectado.

## Configuración

1. En Supabase crea una organización y un proyecto con el plan que prefieras. Guarda la contraseña de base de datos en un gestor de contraseñas; la aplicación no la necesita.
2. En el proyecto, abre **SQL Editor → New query**, pega el contenido de [`supabase.sql`](./supabase.sql) y ejecútalo. Esto crea las tablas y activa las políticas RLS que aíslan los datos por usuario.
3. En **Project Settings → API**, copia la **Project URL** y la clave pública **anon** o **publishable**. No uses la clave `service_role`, `secret` ni la contraseña de base de datos en el navegador.
4. En **Authentication → URL Configuration** de Supabase, establece:
   - **Site URL:** `https://chat-bott-nine.vercel.app`
   - **Redirect URLs:** `https://chat-bott-nine.vercel.app/**`
   - Para desarrollo local, agrega también `http://localhost:3000/**`.
5. Crea una API key en OpenRouter y elige un modelo habilitado para tu cuenta. Revisa su precio/límites antes de usarlo.
6. En el proyecto de Vercel, agrega estas variables de entorno para **Production**, **Preview** y **Development**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (la clave pública anon/publishable)
   - `OPENROUTER_API_KEY` (secreto de servidor; nunca lo subas a GitHub)
   - `OPENROUTER_MODEL` (un modelo disponible en tu cuenta de OpenRouter)
   - `ALLOWED_ORIGIN` (opcional; origen completo permitido, por ejemplo `https://tu-dominio.example`)
7. En **Project Settings → Git** de Vercel conecta el repositorio GitHub `abnerobed/chat-bott` y autoriza la integración. Después de agregar o cambiar variables, inicia un nuevo despliegue de Production para aplicarlas.
8. Para desarrollo local, crea `.env.local` en esta carpeta con las variables anteriores, instala la CLI de Vercel (`npm install --global vercel`) y ejecuta `npm run dev`. Nunca publiques `.env.local`.

La app obtiene la URL y la clave pública de Supabase desde `/api/config`; esa clave está diseñada para usarse desde el navegador y está protegida por las políticas RLS de [`supabase.sql`](./supabase.sql). La clave de OpenRouter se utiliza solo desde `/api/chat` y debe permanecer exclusivamente en las variables de entorno del servidor. Tras configurar todo, `/api/config` debe responder HTTP 200 y mostrar solo URL/clave pública; nunca incluyas la clave de OpenRouter en esa respuesta. Cada push a la rama conectada de GitHub iniciará un nuevo despliegue de Vercel.
