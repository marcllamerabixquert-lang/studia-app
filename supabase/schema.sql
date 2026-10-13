-- Studia: almacenamiento privado por usuario en Supabase
-- Ejecuta este archivo en Supabase > SQL Editor.
-- La política RLS asegura que cada usuario solo pueda leer y modificar su propia fila.

create table if not exists public.studia_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.studia_data enable row level security;

drop policy if exists "Users can read their own Studia data" on public.studia_data;
create policy "Users can read their own Studia data"
  on public.studia_data for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own Studia data" on public.studia_data;
create policy "Users can insert their own Studia data"
  on public.studia_data for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Studia data" on public.studia_data;
create policy "Users can update their own Studia data"
  on public.studia_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No se crea ninguna política de acceso anónimo.
-- Invita usuarios desde Supabase Authentication > Users > Invite user.
-- Desactiva los registros públicos en Authentication > Sign In / Providers
-- (la ubicación exacta puede variar en el panel de Supabase).
