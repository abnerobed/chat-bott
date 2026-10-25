create table if not exists public.conversations(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title)<=120),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null check (char_length(content)<=8000),
  created_at timestamptz not null default now());
create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
drop policy if exists "own conv" on public.conversations;
create policy "own conv" on public.conversations for all using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "own msgs" on public.messages;
create policy "own msgs" on public.messages for all
  using (exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=auth.uid()))
  with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=auth.uid()));
