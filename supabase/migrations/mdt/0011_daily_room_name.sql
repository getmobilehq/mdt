-- Daily.co integration: store the room name so the recording webhook
-- can resolve back to a session without the full URL.

alter table sessions
  add column if not exists daily_room_name text;

create index if not exists sessions_daily_room_name_idx
  on sessions(daily_room_name);
