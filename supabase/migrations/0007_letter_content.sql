-- Store raw letter text so it can be previewed in-app without opening Word
alter table letters add column if not exists content text;
