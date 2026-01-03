jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));

jest.unmock('../supabaseClient');

describe('supabaseClient', () => {
  const originalEnv = process.env;
  const getCreateClientMock = () =>
    jest.requireMock('@supabase/supabase-js').createClient;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    getCreateClientMock().mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const loadClient = () => {
    // eslint-disable-next-line global-require
    return require('../supabaseClient').default;
  };

  it('initializes Supabase with provided environment variables', () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';

    const client = loadClient();

    expect(getCreateClientMock()).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key'
    );
    expect(client).toBeDefined();
  });

  it('falls back to non-prefixed environment variables', () => {
    delete process.env.REACT_APP_SUPABASE_URL;
    delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    process.env.SUPABASE_URL = 'https://fallback.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'fallback-anon';

    const client = loadClient();

    expect(getCreateClientMock()).toHaveBeenCalledWith(
      'https://fallback.supabase.co',
      'fallback-anon'
    );
    expect(client).toBeDefined();
  });

  it('does not throw when required environment variables are missing', () => {
    delete process.env.REACT_APP_SUPABASE_URL;
    delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const client = loadClient();

    expect(getCreateClientMock()).not.toHaveBeenCalled();
    expect(client).toBeDefined();
    expect(client.__isConfigured).toBe(false);
  });
});
