CREATE OR REPLACE FUNCTION public.guard_admin_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE msg text;
BEGIN
  IF public.is_desk_admin() OR public.bulk_wipe_active() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    msg := 'Only an admin can permanently delete this record';
  ELSIF TG_TABLE_NAME = 'release_orders' THEN
    IF OLD.confirmed AND NOT NEW.confirmed THEN msg := 'Only an admin can unconfirm a release order';
    ELSIF OLD.confirmed AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN msg := 'Only an admin can delete a confirmed release order'; END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND (OLD.irn <> '' OR OLD.einvoice_qr_url <> '' OR OLD.einvoice_details_url <> '') THEN
      msg := 'Only an admin can delete an invoice with an e-invoice attached'; END IF;
  ELSIF TG_TABLE_NAME = 'proformas' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.payment_received THEN
      msg := 'Only an admin can delete a payment-received proforma'; END IF;
  ELSIF TG_TABLE_NAME = 'company_books' THEN
    IF TG_OP = 'INSERT' AND NOT NEW.is_open THEN msg := 'Only an admin can create a company';
    ELSIF TG_OP = 'UPDATE' AND NEW.book_name IS DISTINCT FROM OLD.book_name THEN msg := 'Only an admin can rename a company'; END IF;
  END IF;
  IF msg IS NOT NULL THEN RAISE EXCEPTION '%', msg USING ERRCODE = '42501'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;