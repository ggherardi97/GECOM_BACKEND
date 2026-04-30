CREATE TABLE "scarlet_drive_guests" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(120) NOT NULL,
  "invited_by" VARCHAR(80) NOT NULL,
  "is_paid" BOOLEAN NOT NULL DEFAULT false,
  "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_guests" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_scarlet_drive_guests_name" ON "scarlet_drive_guests" ("name");
CREATE INDEX "idx_scarlet_drive_guests_invited_by" ON "scarlet_drive_guests" ("invited_by");
CREATE INDEX "idx_scarlet_drive_guests_is_confirmed" ON "scarlet_drive_guests" ("is_confirmed");

CREATE TABLE "scarlet_drive_repertoire_songs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(160) NOT NULL,
  "suggested_by" VARCHAR(80) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_repertoire_songs" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_scarlet_drive_repertoire_songs_name" ON "scarlet_drive_repertoire_songs" ("name");
CREATE INDEX "idx_scarlet_drive_repertoire_songs_sort_order" ON "scarlet_drive_repertoire_songs" ("sort_order");

CREATE TABLE "scarlet_drive_vote_sessions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(120) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "answer_mode" VARCHAR(20) NOT NULL DEFAULT 'yes_no',
  "is_secret" BOOLEAN NOT NULL DEFAULT false,
  "max_yes_votes_per_voter" INTEGER NOT NULL DEFAULT 5,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_vote_sessions" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_scarlet_drive_vote_sessions_name" ON "scarlet_drive_vote_sessions" ("name");
CREATE INDEX "idx_scarlet_drive_vote_sessions_is_active" ON "scarlet_drive_vote_sessions" ("is_active");

CREATE TABLE "scarlet_drive_vote_session_songs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "vote_session_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "suggested_by" VARCHAR(80) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_vote_session_songs" PRIMARY KEY ("id"),
  CONSTRAINT "fk_scarlet_drive_vote_session_songs_session" FOREIGN KEY ("vote_session_id") REFERENCES "scarlet_drive_vote_sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_scarlet_drive_vote_session_songs_name" ON "scarlet_drive_vote_session_songs" ("vote_session_id", "name");
CREATE INDEX "idx_scarlet_drive_vote_session_songs_session_id" ON "scarlet_drive_vote_session_songs" ("vote_session_id");
CREATE INDEX "idx_scarlet_drive_vote_session_songs_sort_order" ON "scarlet_drive_vote_session_songs" ("sort_order");

CREATE TABLE "scarlet_drive_votes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "vote_song_id" UUID NOT NULL,
  "voter" VARCHAR(80) NOT NULL,
  "vote" VARCHAR(10) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_votes" PRIMARY KEY ("id"),
  CONSTRAINT "fk_scarlet_drive_votes_song" FOREIGN KEY ("vote_song_id") REFERENCES "scarlet_drive_vote_session_songs" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_scarlet_drive_votes_song_voter" ON "scarlet_drive_votes" ("vote_song_id", "voter");
CREATE INDEX "idx_scarlet_drive_votes_voter" ON "scarlet_drive_votes" ("voter");

CREATE TABLE "scarlet_drive_voter_ip_locks" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "voter" VARCHAR(80) NOT NULL,
  "ip" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_scarlet_drive_voter_ip_locks" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_scarlet_drive_voter_ip_locks_voter" ON "scarlet_drive_voter_ip_locks" ("voter");
CREATE UNIQUE INDEX "uq_scarlet_drive_voter_ip_locks_ip" ON "scarlet_drive_voter_ip_locks" ("ip");
