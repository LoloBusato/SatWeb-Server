// Runs before each test file. Sets test env vars BEFORE the app is imported,
// so `src/config/env.ts` parses with the test DB config. Requires the
// satweb-local Docker container (from M3/M4/M5 tests) to be running on
// 127.0.0.1:3307. Uses a dedicated database `satweb_test` separate from dev.

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USERNAME = 'root';
process.env.DB_PASSWORD = 'rootpw';
process.env.DB_DBNAME = 'satweb_test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-xxxxxx';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.ALLOW_LEGACY_PASSWORD_MIGRATION = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.CRON_SECRET = 'test-cron-secret-at-least-32-characters-long-xxx';
