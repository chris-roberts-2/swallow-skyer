import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).trim();
const supabaseAnonKey = (
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const buildMissingEnvError = () =>
  new Error(
    [
      'Supabase is not configured.',
      'Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in client/.env.local (or client/.env), then restart the dev server.',
    ].join(' ')
  );

const buildNoopSubscription = () => ({
  unsubscribe: () => {},
});

const buildUnconfiguredPostgrestBuilder = () => {
  const error = buildMissingEnvError();

  // This is a minimal, chainable, "thenable" shape that supports the patterns
  // used in our codebase (select/eq/order/gte/lte + maybeSingle/single).
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    gte: () => builder,
    lte: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    maybeSingle: async () => ({ data: null, error }),
    single: async () => ({ data: null, error }),
    then: (resolve, _reject) => resolve({ data: null, error }),
  };

  return builder;
};

const buildUnconfiguredClient = () => {
  const error = buildMissingEnvError();

  // Avoid crashing the whole app at import-time; return a client-shaped stub
  // that yields a consistent, actionable error at call-time.
  return {
    __isConfigured: false,
    auth: {
      getSession: async () => ({ data: { session: null }, error }),
      onAuthStateChange: () => ({
        data: { subscription: buildNoopSubscription() },
      }),
      signInWithPassword: async () => ({
        data: { session: null, user: null },
        error,
      }),
      signUp: async () => ({
        data: { session: null, user: null },
        error,
      }),
      signOut: async () => ({ error }),
      updateUser: async () => ({ data: { user: null, session: null }, error }),
    },
    from: () => buildUnconfiguredPostgrestBuilder(),
  };
};

const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : buildUnconfiguredClient();

if (!isSupabaseConfigured && typeof console !== 'undefined') {
  // Keep the app running, but make the misconfig very obvious in devtools.
  // eslint-disable-next-line no-console
  console.error(buildMissingEnvError().message);
}

export default supabaseClient;
