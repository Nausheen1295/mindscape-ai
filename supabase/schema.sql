create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default 'Untitled',
  body text not null default '',
  created bigint not null,
  updated bigint not null,
  style text not null default 'regular',
  color text not null default 'plain',
  font text not null default 'clean'
);

alter table public.notes enable row level security;

create policy "Users can read their own notes"
  on public.notes for select using (auth.uid() = user_id);
create policy "Users can create their own notes"
  on public.notes for insert with check (auth.uid() = user_id);
create policy "Users can update their own notes"
  on public.notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own notes"
  on public.notes for delete using (auth.uid() = user_id);
