const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ADMIN_API_KEY = 'dev-admin-api-key';

export function getAdminConfig() {
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const configuredApiKey = process.env.ADMIN_API_KEY_V2 || process.env.ADMIN_API_KEY;
  const vercelEnv = process.env.VERCEL_ENV;
  const isProduction = process.env.NODE_ENV === 'production' && vercelEnv === 'production';
  const useFallback = !configuredUsername || !configuredPassword || !configuredApiKey;

  if (configuredUsername && configuredPassword && configuredApiKey) {
    return {
      username: configuredUsername,
      password: configuredPassword,
      apiKey: configuredApiKey,
      isFallback: false,
    };
  }

  if (isProduction) {
    return {
      username: configuredUsername || '',
      password: configuredPassword || '',
      apiKey: configuredApiKey || '',
      isFallback: false,
    };
  }

  if (useFallback) {
    return {
      username: configuredUsername || DEFAULT_ADMIN_USERNAME,
      password: configuredPassword || DEFAULT_ADMIN_PASSWORD,
      apiKey: configuredApiKey || DEFAULT_ADMIN_API_KEY,
      isFallback: true,
    };
  }

  return {
    username: configuredUsername || '',
    password: configuredPassword || '',
    apiKey: configuredApiKey || '',
    isFallback: false,
  };
}

export function isAdminRequest(req) {
  const { apiKey } = getAdminConfig();
  if (!apiKey) return false;
  return req.headers['x-admin-key'] === apiKey;
}
