-- Explicit community opt-ins, independent of private cloud-save categories.
CREATE TABLE community_account (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  gameKey TEXT UNIQUE,
  listingId TEXT UNIQUE NOT NULL,
  server TEXT NOT NULL CHECK(server IN ('en','jp','kr')),
  importedAt TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  mutationId TEXT NOT NULL,
  stats INTEGER NOT NULL CHECK(stats IN (0,1)),
  shareTag INTEGER NOT NULL CHECK(shareTag IN (0,1)),
  openRequests INTEGER NOT NULL CHECK(openRequests IN (0,1)),
  friendTag TEXT,
  slots INTEGER,
  equipmentKnown INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL
);
CREATE INDEX community_population ON community_account(server,stats,importedAt);
CREATE TABLE community_operator (
  userId TEXT NOT NULL REFERENCES community_account(userId) ON DELETE CASCADE,
  operator TEXT NOT NULL,
  elite INTEGER, m0 INTEGER, m1 INTEGER, m2 INTEGER, modules TEXT,
  PRIMARY KEY(userId,operator)
);
CREATE INDEX community_operator_lookup ON community_operator(operator,userId);
CREATE TABLE community_skin (
  userId TEXT NOT NULL REFERENCES community_account(userId) ON DELETE CASCADE,
  skin TEXT NOT NULL, equipped INTEGER NOT NULL,
  PRIMARY KEY(userId,skin)
);
CREATE INDEX community_skin_lookup ON community_skin(skin,userId);
CREATE TABLE community_support (
  userId TEXT NOT NULL REFERENCES community_account(userId) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2),
  operator TEXT NOT NULL, elite INTEGER NOT NULL, level INTEGER NOT NULL,
  skill INTEGER, mastery INTEGER, module TEXT, moduleLevel INTEGER,
  potential INTEGER, skin TEXT, skillId TEXT, allMastered INTEGER,
  PRIMARY KEY(userId,slot)
);
CREATE INDEX community_support_lookup ON community_support(operator,elite,level,mastery,userId);
CREATE TABLE community_write_limit (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  window INTEGER NOT NULL, count INTEGER NOT NULL
);
-- One current availability observation per signed-in reporter and listed player.
CREATE TABLE community_availability (
  targetId TEXT NOT NULL REFERENCES community_account(userId) ON DELETE CASCADE,
  reporterId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  snapshotAt TEXT NOT NULL,
  isFull INTEGER NOT NULL CHECK(isFull IN (0,1)),
  createdAt TEXT NOT NULL,
  PRIMARY KEY(targetId,reporterId)
);
CREATE INDEX community_availability_lookup ON community_availability(targetId,snapshotAt,createdAt);
