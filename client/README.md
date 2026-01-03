## Swallow Skyer Client (React)

### Local setup

1) Install dependencies:

```bash
npm install
```

2) Create your env file:

```bash
cp env.example .env.local
```

Then edit `client/.env.local` and set:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_API_URL`

Note: `client/env.example` should stay as placeholders (don’t commit real keys).

3) Start the dev server:

```bash
npm start
```

### Common issue: “Missing Supabase environment variables”

If you see a Supabase env error in the browser console, it means you haven’t set
`REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` in `client/.env.local`
and restarted the dev server.