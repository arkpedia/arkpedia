CREATE TABLE site_updates (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  major INTEGER NOT NULL CHECK (major IN (0, 1)),
  revision INTEGER NOT NULL,
  published_at INTEGER,
  updated_at INTEGER NOT NULL,
  actor TEXT NOT NULL
);

CREATE INDEX site_updates_published ON site_updates(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX site_updates_major ON site_updates(published_at DESC) WHERE published_at IS NOT NULL AND major = 1;

INSERT INTO site_updates (id, payload, major, revision, updated_at, actor) VALUES (
  'tools-and-guides', '{"title":"The Planner menu is now Tools","body":"Open Tools to find Game Modes and the Gacha Simulator alongside the planners and Reward Tracker. On mobile, open the navigation menu first.\n\nThe previous Tools menu is now Guides.","major":true,"images":[{"src":"/site-updates/tools-menu-desktop.png","alt":"The Tools menu in the desktop header includes Gacha Simulator and Game Modes.","device":"desktop"},{"src":"/site-updates/tools-menu-mobile.png","alt":"The expanded Tools section in the mobile navigation drawer includes Gacha Simulator and Game Modes.","device":"mobile"}]}',
  1, 1, unixepoch() * 1000, 'arkpedia'
);
