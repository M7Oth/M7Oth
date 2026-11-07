-- Freelancer Life Simulator — PostgreSQL schema (applied automatically on server start)
create table if not exists users (
  id            text primary key,
  username      text unique not null,
  display_name  text not null,
  pass_hash     text not null,
  appearance    jsonb not null,
  bank_balance  bigint not null default 0 check (bank_balance >= 0),
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash  text primary key,
  user_id     text not null references users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists worlds (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  save_name   text not null,
  state       jsonb not null,
  rev         integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists worlds_owner_idx on worlds(owner_id);

create table if not exists world_members (
  world_id  text not null references worlds(id) on delete cascade,
  user_id   text not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

create table if not exists invites (
  code        text primary key,
  world_id    text not null references worlds(id) on delete cascade,
  created_by  text not null,
  expires_at  timestamptz not null
);

-- Idempotent money movements between co-op worlds and player accounts.
-- `key` is unique per (world, project, player) payout, so a payout can never be credited twice.
create table if not exists bank_ledger (
  key         text primary key,
  user_id     text not null references users(id) on delete cascade,
  amount      bigint not null,
  kind        text not null,
  created_at  timestamptz not null default now()
);
