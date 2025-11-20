const buildSubscription = () => ({
  unsubscribe: jest.fn(),
});

const auth = {
  getSession: jest
    .fn()
    .mockResolvedValue({ data: { session: null }, error: null }),
  onAuthStateChange: jest.fn().mockReturnValue({
    data: { subscription: buildSubscription() },
  }),
  signInWithPassword: jest.fn().mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  }),
  signUp: jest.fn().mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  }),
  signOut: jest.fn().mockResolvedValue({ error: null }),
};

const supabase = { auth };

const resetSupabaseMocks = () => {
  Object.values(auth).forEach(fn => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });

  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: buildSubscription() },
  });
  auth.signInWithPassword.mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  });
  auth.signUp.mockResolvedValue({
    data: { session: null, user: null },
    error: null,
  });
  auth.signOut.mockResolvedValue({ error: null });
};

module.exports = {
  __esModule: true,
  default: supabase,
  auth,
  resetSupabaseMocks,
};
