ALTER TABLE public.release_orders
  ADD COLUMN bill_received boolean NOT NULL DEFAULT false,
  ADD COLUMN bill_received_at timestamp with time zone;

COMMENT ON COLUMN public.release_orders.bill_received IS 'Whether the vendor bill for this release order has been received.';
COMMENT ON COLUMN public.release_orders.bill_received_at IS 'When the vendor bill was marked as received.';