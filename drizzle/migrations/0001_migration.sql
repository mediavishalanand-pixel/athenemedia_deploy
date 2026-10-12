CREATE OR REPLACE FUNCTION public.is_desk_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin') $$;

CREATE OR REPLACE FUNCTION public.bulk_wipe_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT coalesce(current_setting('app.bulk_wipe', true), '') = 'on' $$;

-- Lets any staff member clear live data for backup restore / company switching.
CREATE OR REPLACE FUNCTION public.wipe_live_data(include_settings boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_desk_staff() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  PERFORM set_config('app.bulk_wipe', 'on', true);
  DELETE FROM public.invoices WHERE id IS NOT NULL;
  DELETE FROM public.proformas WHERE id IS NOT NULL;
  DELETE FROM public.release_orders WHERE id IS NOT NULL;
  DELETE FROM public.channel_client_rates WHERE id IS NOT NULL;
  DELETE FROM public.campaigns WHERE id IS NOT NULL;
  DELETE FROM public.clients WHERE id IS NOT NULL;
  DELETE FROM public.channels WHERE id IS NOT NULL;
  IF include_settings THEN DELETE FROM public.company_settings WHERE id IS NOT NULL; END IF;
  PERFORM set_config('app.bulk_wipe', '', true);
END $$;
GRANT EXECUTE ON FUNCTION public.wipe_live_data(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_desk_admin() TO authenticated;

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
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND (OLD.irn IS NOT NULL OR OLD.einvoice_qr_url IS NOT NULL OR OLD.einvoice_details_url IS NOT NULL) THEN
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

CREATE TRIGGER admin_guard_ro BEFORE UPDATE OR DELETE ON public.release_orders FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();
CREATE TRIGGER admin_guard_inv BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();
CREATE TRIGGER admin_guard_pf BEFORE UPDATE OR DELETE ON public.proformas FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();
CREATE TRIGGER admin_guard_clients BEFORE DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();
CREATE TRIGGER admin_guard_channels BEFORE DELETE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();
CREATE TRIGGER admin_guard_books BEFORE INSERT OR UPDATE OR DELETE ON public.company_books FOR EACH ROW EXECUTE FUNCTION public.guard_admin_only();