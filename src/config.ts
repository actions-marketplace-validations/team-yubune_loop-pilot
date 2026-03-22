export interface Config {
  maxReviewIterations: number;
  debounceSeconds: number;
  checkCommand: string;
  maxFilesPerIteration: number;
  maxInputTokensPerFile: number;
  codexBotLogin: string;
  stabilizeIntervalSeconds: number;
  stabilizeCount: number;
  codexReviewMarker: string;
  anthropicApiKey: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
}

export function loadConfig(): Config {
  return {
    ...loadBaseConfig(),
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  };
}

export function loadInitConfig(): Config {
  return {
    ...loadBaseConfig(),
    anthropicApiKey: "",
  };
}

function loadBaseConfig(): Omit<Config, "anthropicApiKey"> {
  const repoFullName = requireEnv("GITHUB_REPOSITORY");
  const [repoOwner, repoName] = repoFullName.split("/");

  return {
    maxReviewIterations: intEnv("MAX_REVIEW_ITERATIONS", 20),
    debounceSeconds: intEnv("DEBOUNCE_SECONDS", 90),
    checkCommand: env("CHECK_COMMAND", "npm run check"),
    maxFilesPerIteration: intEnv("MAX_FILES_PER_ITERATION", 10),
    maxInputTokensPerFile: intEnv("MAX_INPUT_TOKENS_PER_FILE", 30000),
    codexBotLogin: env("CODEX_BOT_LOGIN", "chatgpt-codex-connector[bot]"),
    stabilizeIntervalSeconds: intEnv("STABILIZE_INTERVAL_SECONDS", 10),
    stabilizeCount: intEnv("STABILIZE_COUNT", 3),
    codexReviewMarker: env("CODEX_REVIEW_MARKER", "Codex Review"),
    githubToken: requireEnv("GITHUB_TOKEN"),
    repoOwner,
    repoName,
    prNumber: intEnv("PR_NUMBER", 0),
  };
}

function env(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") return defaultValue;
  return value;
}

function intEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${value}`);
  }
  return parsed;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}
