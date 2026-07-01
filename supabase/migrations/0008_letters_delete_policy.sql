-- Allow authenticated users to delete letters (was missing from initial RLS setup)
create policy "letters_delete" on letters
  for delete using (auth.uid() is not null);
