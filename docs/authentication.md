# Authentication Architecture

## High-level auth flow

- **Login/Signup via Supabase Auth.** The frontend delegates credential handling to Supabase JS v2 (`signInWithPassword` / `signUp`). Supabase returns a session object containing the user, access token, refresh token, and expiry metadata.
- **Session persistence.** `AuthContext` stores the session in `localStorage` under `supabaseSession`, plus the legacy `access_token`/`refresh_token` keys so any existing API clients remain compatible.
- **`onAuthStateChange` observer.** The context subscribes to Supabase auth events to refresh `user` + `session` state whenever Supabase emits a `SIGNED_IN`, `SIGNED_OUT`, or session-refresh event, keeping UI components syncing across tabs.
- **AuthContext surface.** Components consume `useAuth()` to read `{ user, session, isLoading }` and to invoke `login`, `signup`, or `logout`.
- **AuthGuard protection.** `AuthGuard` checks `isLoading`/`user` and either renders the child content or redirects to `/login`, ensuring private routes never mount without an authenticated context.

## Frontend request lifecycle

- Authenticated screens rely on `AuthGuard` to gate access before rendering. Once inside, data fetchers (e.g., `apiClient`) read the stored `access_token` and inject `Authorization: Bearer <token>` before dispatching any backend request.
- Session-aware components (map/upload/profile) consume `useAuth()` and trigger logout/redirect if the context loses its user, resulting from expiration or manual sign-out.
- Login/registration forms call `login`/`signup`, then navigate to `/map` (or the protected referrer) if authentication succeeds.
- Registration also calls `/api/v1/profile/register` (unauthenticated) to persist user metadata in `public.users` immediately after signup, even before email confirmation.

## Backend request lifecycle

- Every protected request must include `Authorization: Bearer <token>` in the header. The JWT middleware (`jwt_required`) validates the header, returning `401` when the header is missing, the token string empty, or validation fails.
- Validation treats the token as a Supabase JWT by calling `verify_supabase_jwt`. If Supabase validation succeeds, the decoded user payload is written onto `g.current_user`.
- Routes decorating `@jwt_required` (e.g., `/api/v1/photos/*`, `/api/v1/profile`) rely on that middleware to gate access. Handlers can safely read `g.current_user` without re-validating the header.

## Data flow diagram

```
Frontend Browser
   └─ login/signup → Supabase Auth → session (access/refresh tokens, expires)
   └─ AuthContext stores session → localStorage → AuthGuard + authenticated pages
   └─ Subsequent API requests include Authorization header → Backend
Backend Flask app
   └─ jwt_required middleware validates Supabase JWT → g.current_user
   └─ Protected handlers read g.current_user → ↺ Supabase / Database
   └─ Upload flows send files to Cloudflare R2 + metadata writes to Supabase
R2 Storage (uploads) ← Backend upload endpoints only (no front-end keys)
```

## Supabase policies

- **Photos table**
  - Authenticated users may insert rows where `user_id = auth.uid()` (prevents pretending to be other users).
  - A read policy allows each user to select only rows where `user_id = auth.uid()`. Project-wide views may exist for public imagery, but the default RLS scope restricts to the creator.
- **Users table**
  - Standard RLS ensures authenticated queries see one’s own profile data; service roles (server-only) can bypass that when needed.
- **Service roles**
  - Service role keys are never shipped to the frontend. Only the backend is authorized to use `SUPABASE_SERVICE_ROLE_KEY`, which appears in server-only env templates. Frontend requests always use the anon key.

## Testing summary

- **Frontend (Jest/RTL)**: AuthContext covers session restoration, login/signup/logout flows, and reacts to `onAuthStateChange`. AuthGuard tests validate redirects for unauthenticated contexts, and App-level tests cover route-level protections plus nav/profile UI. Login/Register/Profile pages each have forms/content asserted via AuthContext fakes.
- **Backend (pytest)**: Auth-focused suites validate JWT rejection for missing/malformed tokens and photo routes that enforce authentication for upload/list queries while honoring valid Supabase tokens. Upload tests mock R2 workflows so the route logic still exercises middleware without touching the network.
