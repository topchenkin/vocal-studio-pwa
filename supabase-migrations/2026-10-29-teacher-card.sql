-- Public teacher card (/prepodavatel + home slideshow). One row, edited by admin only.
-- Media files live in the public bucket `teacher-card`; rows store storage paths, not URLs.

create table if not exists public.teacher_card (
  id smallint primary key default 1 check (id = 1),
  full_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  achievements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(achievements) = 'array'),
  music_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(music_links) = 'array'),
  media jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media) = 'array'),
  updated_at timestamptz not null default now()
);

insert into public.teacher_card (id) values (1) on conflict (id) do nothing;

alter table public.teacher_card enable row level security;

drop policy if exists "teacher_card_public_read" on public.teacher_card;
create policy "teacher_card_public_read"
on public.teacher_card for select
to anon, authenticated
using (true);

drop policy if exists "teacher_card_admin_manage" on public.teacher_card;
create policy "teacher_card_admin_manage"
on public.teacher_card for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

grant select on public.teacher_card to anon, authenticated;
grant insert, update on public.teacher_card to authenticated;

create or replace function public.touch_teacher_card()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists teacher_card_touch on public.teacher_card;
create trigger teacher_card_touch
before update on public.teacher_card
for each row execute function public.touch_teacher_card();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teacher-card',
  'teacher-card',
  true,
  314572800,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "teacher_card_media_admin_manage" on storage.objects;
create policy "teacher_card_media_admin_manage"
on storage.objects for all
to authenticated
using (
  bucket_id = 'teacher-card'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'teacher-card'
  and public.current_user_is_admin()
);
