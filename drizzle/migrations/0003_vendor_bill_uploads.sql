ALTER TABLE public.release_orders
  ADD COLUMN IF NOT EXISTS bill_file_path text,
  ADD COLUMN IF NOT EXISTS bill_file_name text,
  ADD COLUMN IF NOT EXISTS bill_file_type text,
  ADD COLUMN IF NOT EXISTS bill_text text;

CREATE POLICY "Desk staff read vendor bills" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-bills' AND public.is_desk_staff());
CREATE POLICY "Desk staff upload vendor bills" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-bills' AND public.is_desk_staff());
CREATE POLICY "Desk staff update vendor bills" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-bills' AND public.is_desk_staff());
CREATE POLICY "Desk staff delete vendor bills" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-bills' AND public.is_desk_staff());