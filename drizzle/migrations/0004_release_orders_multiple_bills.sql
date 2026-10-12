ALTER TABLE public.release_orders ADD COLUMN IF NOT EXISTS bill_files jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: existing single bill becomes the first entry of the list.
UPDATE public.release_orders
SET bill_files = jsonb_build_array(jsonb_build_object(
  'path', bill_file_path,
  'name', bill_file_name,
  'type', bill_file_type,
  'uploadedAt', coalesce(bill_received_at, now())
))
WHERE bill_file_path IS NOT NULL AND bill_files = '[]'::jsonb;