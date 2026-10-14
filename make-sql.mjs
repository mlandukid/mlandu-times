// Prints the Supabase SQL for the polls in elections.json:  node make-sql.mjs > supabase.sql
import { readFileSync } from "node:fs";
const E = JSON.parse(readFileSync(new URL("./elections.json", import.meta.url), "utf8"));
const q = s => "'" + s.replace(/'/g, "''") + "'";
const rows = E.elections.flatMap(e => e.polls.flatMap(p => p.o.map(c => `(${q(p.id)}, ${q(c)})`)));
console.log(`create table if not exists poll_counts (poll_id text, choice text, n bigint not null default 0, primary key (poll_id, choice));
alter table poll_counts enable row level security;
drop policy if exists "public read" on poll_counts;
create policy "public read" on poll_counts for select using (true);
create or replace function cast_vote(p text, c text) returns void language sql security definer set search_path = public as $$
  update poll_counts set n = n + 1 where poll_id = p and choice = c;
$$;
grant execute on function cast_vote(text, text) to anon;
insert into poll_counts (poll_id, choice) values
${rows.join(",\n")}
on conflict do nothing;

create table if not exists feedback (id bigint generated always as identity primary key, message text not null check (length(message) between 1 and 1000), device text, created_at timestamptz default now());
alter table feedback enable row level security;
drop policy if exists "anyone can send" on feedback;
create policy "anyone can send" on feedback for insert to anon with check (true);
grant insert on feedback to anon;`);
