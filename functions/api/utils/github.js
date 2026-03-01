export async function getGitHubClientSecret(env) {
  if (env.GITHUB_CLIENT_SECRET) return env.GITHUB_CLIENT_SECRET;
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'github_client_secret'").first();
  return row?.value || null;
}

