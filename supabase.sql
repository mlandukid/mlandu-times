create table if not exists poll_counts (poll_id text, choice text, n bigint not null default 0, primary key (poll_id, choice));
alter table poll_counts enable row level security;
drop policy if exists "public read" on poll_counts;
create policy "public read" on poll_counts for select using (true);
create or replace function cast_vote(p text, c text) returns void language sql security definer set search_path = public as $$
  update poll_counts set n = n + 1 where poll_id = p and choice = c;
$$;
grant execute on function cast_vote(text, text) to anon;
insert into poll_counts (poll_id, choice) values
('br-win', 'Lula'),
('br-win', 'Flávio Bolsonaro'),
('br-vote', 'Lula'),
('br-vote', 'Flávio Bolsonaro'),
('br-vote', 'Blank or null'),
('us-house', 'Democrats'),
('us-house', 'Republicans'),
('us-senate', 'Democrats'),
('us-senate', 'Republicans'),
('za-top', 'ANC'),
('za-top', 'DA'),
('za-top', 'MK Party'),
('za-top', 'EFF'),
('za-top', 'Another party'),
('za-turn', 'Yes'),
('za-turn', 'No')
on conflict do nothing;
