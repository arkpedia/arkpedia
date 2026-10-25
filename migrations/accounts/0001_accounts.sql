-- Better Auth 1.7 core schema. These credentials belong ONLY to Google/Discord and
-- Arkpedia sessions. No Yostar credential field exists in the sync schema.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL, expiresAt DATE NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL, ipAddress TEXT, userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session(userId);
CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT,
  accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL,
  UNIQUE(providerId, accountId)
);
CREATE INDEX account_userId_idx ON account(userId);
CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt DATE NOT NULL, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY NOT NULL, "key" TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL, lastRequest INTEGER NOT NULL
);
CREATE TABLE cloud_save (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  gameSync INTEGER NOT NULL DEFAULT 0 CHECK(gameSync IN (0, 1)),
  payload TEXT NOT NULL DEFAULT '{}', updatedAt TEXT NOT NULL
);
