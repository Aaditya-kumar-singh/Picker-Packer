ï»¿-- 0001_harden_workflow.sql
-- Production hardening for YBM Picker & Packer.
-- Apply after Supabase_Schema.sql.

BEGIN;

-- Dispatch data required by the mobile client.
CREATE TABLE IF NOT EXISTS public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES public.riders(id),
  ADD COLUMN IF NOT EXISTS rider_name TEXT;

-- packages.dimensions is already JSONB in the base schema.

CREATE INDEX IF NOT EXISTS idx_orders_warehouse_status ON public.orders(warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_picker_status ON public.orders(picker_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_packer_status ON public.orders(packer_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_order_created ON public.scan_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_order_created ON public.exceptions(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packages_order ON public.packages(order_id);
CREATE INDEX IF NOT EXISTS idx_riders_active_name ON public.riders(warehouse_id, active, name);

-- Keep updated_at current for mutable profile/rider records.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS riders_set_updated_at ON public.riders;
CREATE TRIGGER riders_set_updated_at BEFORE UPDATE ON public.riders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Security helpers. SECURITY DEFINER is constrained to this schema and never accepts a caller-supplied user id.
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u FROM public.users u WHERE u.id = auth.uid() AND u.active = true;
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.current_warehouse()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT warehouse_id FROM public.users WHERE id = auth.uid() AND active = true;
$$;

-- Transactional Picker workflow.
CREATE OR REPLACE FUNCTION public.picker_start_order(p_order_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
  v_order public.orders;
  v_existing jsonb;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN RAISE EXCEPTION 'Picker access required'; END IF;

  SELECT jsonb_build_object('status', 'PICKING') INTO v_existing
  FROM public.idempotency_keys
  WHERE key = p_idempotency_key AND user_id = auth.uid() AND operation = 'picker_start';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.warehouse_id <> v_user.warehouse_id THEN RAISE EXCEPTION 'Order belongs to another warehouse'; END IF;
  IF v_order.picker_id IS DISTINCT FROM v_user.id THEN RAISE EXCEPTION 'Order is not assigned to this picker'; END IF;
  IF v_order.status <> 'ASSIGNED' THEN RAISE EXCEPTION 'Order cannot be started from status %', v_order.status; END IF;

  UPDATE public.orders SET status = 'PICKING', started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.idempotency_keys(key, user_id, operation, response_status, response_body)
  VALUES (p_idempotency_key, auth.uid(), 'picker_start', 200, jsonb_build_object('status','PICKING')::text)
  ON CONFLICT (key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'status', 'PICKING');
END;
$$;

CREATE OR REPLACE FUNCTION public.picker_pick_item(p_order_id text, p_item_id text, p_sku text, p_quantity integer, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
  v_order public.orders;
  v_item public.order_items;
  v_new_qty integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN RAISE EXCEPTION 'Picker access required'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key = p_idempotency_key AND user_id = auth.uid() AND operation = 'picker_pick_item') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id <> v_user.warehouse_id THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.picker_id IS DISTINCT FROM v_user.id OR v_order.status <> 'PICKING' THEN RAISE EXCEPTION 'Order is not available for picking'; END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id AND order_id = p_order_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF upper(trim(v_item.sku)) <> upper(trim(p_sku)) THEN RAISE EXCEPTION 'SKU does not match'; END IF;
  v_new_qty := v_item.picked_qty + p_quantity;
  IF v_new_qty > v_item.required_qty THEN RAISE EXCEPTION 'Picked quantity cannot exceed required quantity'; END IF;

  UPDATE public.order_items SET picked_qty = v_new_qty WHERE id = p_item_id;
  INSERT INTO public.scan_events(id, order_id, item_id, user_id, role, scan_type, barcode, expected_value, result, idempotency_key)
  VALUES (gen_random_uuid()::text, p_order_id, p_item_id, auth.uid(), 'PICKER', 'PICK', p_sku, v_item.sku, 'SUCCESS', p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  INSERT INTO public.idempotency_keys(key, user_id, operation, response_status, response_body)
  VALUES (p_idempotency_key, auth.uid(), 'picker_pick_item', 200, jsonb_build_object('pickedQty',v_new_qty)::text)
  ON CONFLICT (key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'pickedQty', v_new_qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.picker_complete_order(p_order_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
  v_order public.orders;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN RAISE EXCEPTION 'Picker access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key = p_idempotency_key AND user_id = auth.uid() AND operation = 'picker_complete') THEN
    RETURN jsonb_build_object('ok', true, 'status', 'READY_FOR_PACKING', 'duplicate', true);
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id <> v_user.warehouse_id OR v_order.picker_id IS DISTINCT FROM v_user.id THEN RAISE EXCEPTION 'Order not available'; END IF;
  IF v_order.status <> 'PICKING' THEN RAISE EXCEPTION 'Order is not being picked'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.picked_qty < oi.required_qty
      AND NOT EXISTS (
        SELECT 1 FROM public.exceptions ex
        WHERE ex.order_id = oi.order_id
          AND ex.item_id = oi.id
          AND ex.status = 'OPEN'
      )
  ) THEN
    RAISE EXCEPTION 'All quantities must be picked or have an open exception';
  END IF;
  UPDATE public.orders SET status = 'READY_FOR_PACKING', completed_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES (p_idempotency_key,auth.uid(),'picker_complete',200,'{"status":"READY_FOR_PACKING"}') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'status','READY_FOR_PACKING');
END;
$$;

-- Transactional Packer workflow.
CREATE OR REPLACE FUNCTION public.packer_start_order(p_order_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users; v_order public.orders;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PACKER' THEN RAISE EXCEPTION 'Packer access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='packer_start') THEN RETURN jsonb_build_object('ok',true,'status','PACKING','duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'READY_FOR_PACKING' THEN RAISE EXCEPTION 'Order cannot be started for packing'; END IF;
  UPDATE public.orders SET status='PACKING', packer_id=auth.uid(), started_at=COALESCE(started_at, now()), updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'packer_start',200,'{"status":"PACKING"}') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'status','PACKING');
END; $$;

CREATE OR REPLACE FUNCTION public.packer_pack_item(p_order_id text, p_item_id text, p_quantity integer, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users; v_order public.orders; v_item public.order_items; v_new integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PACKER' THEN RAISE EXCEPTION 'Packer access required'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='packer_pack_item') THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id OR v_order.status<>'PACKING' OR v_order.packer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not available for packing'; END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_new := v_item.packed_qty + p_quantity;
  IF v_new > v_item.picked_qty THEN RAISE EXCEPTION 'Packed quantity cannot exceed picked quantity'; END IF;
  UPDATE public.order_items SET packed_qty=v_new WHERE id=p_item_id;
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'packer_pack_item',200,jsonb_build_object('packedQty',v_new)::text) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'packedQty',v_new);
END; $$;

CREATE OR REPLACE FUNCTION public.packer_create_package(p_order_id text, p_package_type text, p_weight real, p_dimensions jsonb, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users; v_order public.orders; v_number integer; v_id text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PACKER' THEN RAISE EXCEPTION 'Packer access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='packer_create_package') THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id OR v_order.status<>'PACKING' OR v_order.packer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not available for packing'; END IF;
  SELECT COALESCE(MAX(package_number),0)+1 INTO v_number FROM public.packages WHERE order_id=p_order_id;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.packages(id,order_id,package_number,package_type,weight,dimensions,created_by) VALUES(v_id,p_order_id,v_number,p_package_type,p_weight,p_dimensions,auth.uid());
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'packer_create_package',200,jsonb_build_object('id',v_id,'packageNumber',v_number)::text) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'id',v_id,'packageNumber',v_number);
END; $$;

CREATE OR REPLACE FUNCTION public.packer_complete_order(p_order_id text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user public.users; v_order public.orders;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PACKER' THEN RAISE EXCEPTION 'Packer access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='packer_complete') THEN RETURN jsonb_build_object('ok',true,'status','PACKED','duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id OR v_order.status<>'PACKING' OR v_order.packer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not available'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND packed_qty < picked_qty) THEN RAISE EXCEPTION 'All picked quantities must be packed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.packages WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'At least one package is required'; END IF;
  UPDATE public.orders SET status='PACKED', completed_at=now(), updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'packer_complete',200,'{"status":"PACKED"}') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'status','PACKED');
END; $$;

CREATE OR REPLACE FUNCTION public.assign_rider(p_order_id text, p_rider_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user public.users; v_order public.orders; v_rider public.riders;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PACKER' THEN RAISE EXCEPTION 'Packer access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='assign_rider') THEN RETURN jsonb_build_object('ok',true,'status','RIDER_ASSIGNED','duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'PACKED' THEN RAISE EXCEPTION 'Only packed orders can be dispatched'; END IF;
  SELECT * INTO v_rider FROM public.riders WHERE id=p_rider_id AND warehouse_id=v_user.warehouse_id AND active=true;
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'Rider not found or inactive'; END IF;
  UPDATE public.orders SET rider_id=v_rider.id, rider_name=v_rider.name, status='RIDER_ASSIGNED', updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'assign_rider',200,jsonb_build_object('status','RIDER_ASSIGNED','riderId',v_rider.id)::text) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'status','RIDER_ASSIGNED','riderId',v_rider.id,'riderName',v_rider.name);
END; $$;

-- Exception creation is transactional and tied to the authenticated operator.
CREATE OR REPLACE FUNCTION public.sync_scan_event(p_id text, p_order_id text, p_item_id text, p_scan_type text, p_barcode text, p_expected_value text, p_result text, p_idempotency_key text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_user public.users; v_order public.orders; v_item public.order_items; v_expected text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND warehouse_id=v_user.warehouse_id FOR SHARE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id FOR SHARE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_user.role='PICKER' AND v_order.picker_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not assigned to this picker'; END IF;
  IF v_user.role='PACKER' AND v_order.packer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not assigned to this packer'; END IF;
  v_expected := CASE
    WHEN upper(p_scan_type)='LOCATION' THEN v_item.location
    WHEN upper(p_scan_type) IN ('SKU','PICK') THEN v_item.sku
    ELSE p_expected_value
  END;
  IF upper(p_result)='SUCCESS' AND upper(trim(p_barcode)) <> upper(trim(v_expected)) THEN
    RAISE EXCEPTION 'Scan does not match expected value';
  END IF;
  INSERT INTO public.scan_events(id,order_id,item_id,user_id,role,scan_type,barcode,expected_value,result,idempotency_key,device_id)
  VALUES(COALESCE(NULLIF(p_id,''),gen_random_uuid()::text),p_order_id,p_item_id,auth.uid(),v_user.role,p_scan_type,p_barcode,v_expected,p_result,p_idempotency_key,p_device_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('ok',true,'duplicate',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_exception(p_order_id text, p_item_id text, p_type text, p_reason text, p_quantity integer, p_note text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user public.users; v_order public.orders; v_id text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role NOT IN ('PICKER','PACKER') THEN RAISE EXCEPTION 'Operator access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.idempotency_keys WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='create_exception') THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND warehouse_id=v_user.warehouse_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.order_items WHERE id=p_item_id AND order_id=p_order_id) THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_id := gen_random_uuid()::text;
  INSERT INTO public.exceptions(id,order_id,item_id,user_id,role,type,reason,quantity,note) VALUES(v_id,p_order_id,p_item_id,auth.uid(),v_user.role,p_type,p_reason,p_quantity,p_note);
  INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body) VALUES(p_idempotency_key,auth.uid(),'create_exception',200,jsonb_build_object('id',v_id)::text) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'id',v_id);
END; $$;

-- RLS: users may read their own profile; operational reads are restricted to their warehouse and role.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users FOR SELECT TO authenticated USING (id = auth.uid() AND active = true);

DROP POLICY IF EXISTS orders_select_warehouse ON public.orders;
CREATE POLICY orders_select_warehouse ON public.orders FOR SELECT TO authenticated USING (warehouse_id = public.current_warehouse());

DROP POLICY IF EXISTS order_items_select_warehouse ON public.order_items;
CREATE POLICY order_items_select_warehouse ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.warehouse_id=public.current_warehouse()));

DROP POLICY IF EXISTS scan_events_select_warehouse ON public.scan_events;
CREATE POLICY scan_events_select_warehouse ON public.scan_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.warehouse_id=public.current_warehouse()));

DROP POLICY IF EXISTS exceptions_select_warehouse ON public.exceptions;
CREATE POLICY exceptions_select_warehouse ON public.exceptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.warehouse_id=public.current_warehouse()));

DROP POLICY IF EXISTS packages_select_warehouse ON public.packages;
CREATE POLICY packages_select_warehouse ON public.packages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.warehouse_id=public.current_warehouse()));

DROP POLICY IF EXISTS riders_select_active ON public.riders;
CREATE POLICY riders_select_active ON public.riders FOR SELECT TO authenticated USING (active = true AND warehouse_id = public.current_warehouse());

REVOKE EXECUTE ON FUNCTION public.current_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_warehouse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_warehouse() TO authenticated;
-- All operational mutations go through SECURITY DEFINER RPCs above.
REVOKE INSERT, UPDATE, DELETE ON public.users, public.orders, public.order_items, public.scan_events, public.exceptions, public.packages, public.audit_events, public.idempotency_keys, public.riders FROM authenticated;
GRANT EXECUTE ON FUNCTION public.picker_start_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.picker_pick_item(text,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.picker_complete_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.packer_start_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.packer_pack_item(text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.packer_create_package(text,text,real,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.packer_complete_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_rider(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_exception(text,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_scan_event(text,text,text,text,text,text,text,text,text) TO authenticated;


-- Workflow timing fields used by real metrics and operational reporting.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Evidence metadata. Binary content lives in a private Storage bucket.
CREATE TABLE IF NOT EXISTS public.exception_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id TEXT NOT NULL REFERENCES public.exceptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','UPLOADED','FAILED')),
  upload_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_exception_evidence_exception ON public.exception_evidence(exception_id, created_at DESC);
ALTER TABLE public.exception_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exception_evidence_select ON public.exception_evidence;
CREATE POLICY exception_evidence_select ON public.exception_evidence
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.exceptions e
    JOIN public.orders o ON o.id = e.order_id
    WHERE e.id = exception_id
      AND o.warehouse_id = public.current_warehouse()
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.exception_evidence FROM authenticated;

-- Private evidence bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('exception-evidence', 'exception-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS exception_evidence_objects_insert ON storage.objects;
CREATE POLICY exception_evidence_objects_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exception-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS exception_evidence_objects_select ON storage.objects;
CREATE POLICY exception_evidence_objects_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'exception-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS exception_evidence_objects_update ON storage.objects;
CREATE POLICY exception_evidence_objects_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'exception-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'exception-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE OR REPLACE FUNCTION public.create_evidence_record(
  p_exception_id text,
  p_object_key text,
  p_mime_type text,
  p_file_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user public.users;
  v_exception public.exceptions;
  v_id uuid;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true;
  IF v_user.id IS NULL OR v_user.role NOT IN ('PICKER','PACKER') THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;
  IF p_mime_type NOT IN ('image/jpeg','image/png','image/webp') THEN
    RAISE EXCEPTION 'Unsupported evidence type';
  END IF;
  IF p_file_size_bytes IS NOT NULL AND (p_file_size_bytes <= 0 OR p_file_size_bytes > 10485760) THEN
    RAISE EXCEPTION 'Evidence must be between 1 byte and 10 MB';
  END IF;

  SELECT e.* INTO v_exception
  FROM public.exceptions e
  JOIN public.orders o ON o.id = e.order_id
  WHERE e.id = p_exception_id
    AND o.warehouse_id = v_user.warehouse_id
  FOR SHARE;
  IF v_exception.id IS NULL THEN RAISE EXCEPTION 'Exception not found'; END IF;

  IF (storage.foldername(p_object_key))[1] <> auth.uid()::text THEN
    RAISE EXCEPTION 'Invalid evidence object path';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO public.exception_evidence(id, exception_id, user_id, object_key, mime_type, file_size_bytes)
  VALUES(v_id, p_exception_id, auth.uid(), p_object_key, p_mime_type, p_file_size_bytes);
  RETURN jsonb_build_object('id', v_id, 'objectKey', p_object_key, 'status', 'PENDING');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_evidence_upload(p_evidence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.exception_evidence;
BEGIN
  SELECT * INTO v_row FROM public.exception_evidence
  WHERE id = p_evidence_id AND user_id = auth.uid()
  FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Evidence record not found'; END IF;

  UPDATE public.exception_evidence
  SET status='UPLOADED', uploaded_at=now(), upload_attempts=upload_attempts+1, last_error=NULL
  WHERE id = p_evidence_id;

  RETURN jsonb_build_object(
    'id', v_row.id, 'objectKey', v_row.object_key, 'mimeType', v_row.mime_type,
    'fileSizeBytes', v_row.file_size_bytes, 'status', 'UPLOADED',
    'uploadAttempts', v_row.upload_attempts + 1, 'createdAt', v_row.created_at,
    'uploadedAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_exception_evidence(p_exception_id text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ee.id, 'objectKey', ee.object_key, 'mimeType', ee.mime_type,
      'fileSizeBytes', ee.file_size_bytes, 'status', ee.status,
      'uploadAttempts', ee.upload_attempts, 'lastError', ee.last_error,
      'createdAt', ee.created_at, 'uploadedAt', ee.uploaded_at
    ) ORDER BY ee.created_at DESC
  ), '[]'::jsonb)
  FROM public.exception_evidence ee
  JOIN public.exceptions e ON e.id = ee.exception_id
  JOIN public.orders o ON o.id = e.order_id
  WHERE ee.exception_id = p_exception_id
    AND ee.user_id = auth.uid()
    AND o.warehouse_id = public.current_warehouse();
$$;

REVOKE EXECUTE ON FUNCTION public.create_evidence_record(text,text,text,bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_evidence_upload(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_exception_evidence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_evidence_record(text,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_evidence_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_exception_evidence(text) TO authenticated;

-- Real picker metrics, calculated from operational data over the last 24 hours.
CREATE OR REPLACE FUNCTION public.picker_metrics()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user public.users;
  v_orders integer;
  v_scans integer;
  v_scan_success integer;
  v_first_total integer;
  v_first_success integer;
  v_exceptions integer;
  v_total_qty integer;
  v_short_qty integer;
  v_minutes numeric;
  v_completed integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN RAISE EXCEPTION 'Picker access required'; END IF;

  SELECT COUNT(*)::int INTO v_orders
  FROM public.orders
  WHERE picker_id=auth.uid() AND warehouse_id=v_user.warehouse_id
    AND status='READY_FOR_PACKING' AND completed_at >= now()-interval '24 hours';

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE result='SUCCESS')::int
    INTO v_scans, v_scan_success
  FROM public.scan_events
  WHERE user_id=auth.uid() AND role='PICKER' AND created_at >= now()-interval '24 hours';

  WITH first_scans AS (
    SELECT DISTINCT ON (item_id) item_id, result
    FROM public.scan_events
    WHERE user_id=auth.uid() AND role='PICKER' AND created_at >= now()-interval '24 hours'
    ORDER BY item_id, created_at ASC
  )
  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE result='SUCCESS')::int
    INTO v_first_total, v_first_success
  FROM first_scans;

  SELECT COUNT(*)::int INTO v_exceptions
  FROM public.exceptions
  WHERE user_id=auth.uid() AND role='PICKER' AND created_at >= now()-interval '24 hours';

  SELECT COALESCE(SUM(oi.picked_qty),0)::int INTO v_total_qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id=oi.order_id
  WHERE o.picker_id=auth.uid() AND o.warehouse_id=v_user.warehouse_id
    AND o.completed_at >= now()-interval '24 hours';

  SELECT COALESCE(SUM(GREATEST(0, oi.required_qty-oi.picked_qty)),0)::int INTO v_short_qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id=oi.order_id
  WHERE o.picker_id=auth.uid() AND o.warehouse_id=v_user.warehouse_id
    AND o.completed_at >= now()-interval '24 hours';

  SELECT COUNT(*)::int INTO v_completed
  FROM public.orders
  WHERE picker_id=auth.uid() AND warehouse_id=v_user.warehouse_id
    AND status='READY_FOR_PACKING' AND completed_at >= now()-interval '24 hours';

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at-started_at))/60),0)
    INTO v_minutes
  FROM public.orders
  WHERE picker_id=auth.uid() AND warehouse_id=v_user.warehouse_id
    AND status='READY_FOR_PACKING'
    AND completed_at >= now()-interval '24 hours'
    AND started_at IS NOT NULL;

  RETURN jsonb_build_object(
    'period','24h',
    'ordersPicked',v_orders,
    'skuScans',v_scans,
    'scanAccuracyPercent',CASE WHEN v_scans=0 THEN 0 ELSE round((v_scan_success::numeric/v_scans)*100,1) END,
    'exceptions',v_exceptions,
    'firstScanSuccessPercent',CASE WHEN v_first_total=0 THEN 0 ELSE round((v_first_success::numeric/v_first_total)*100,1) END,
    'totalPickedQty',v_total_qty,
    'pickedUnitsPerHour',CASE WHEN v_minutes=0 THEN 0 ELSE round((v_total_qty*60/v_minutes),1) END,
    'ordersPerHour',CASE WHEN v_minutes=0 THEN 0 ELSE round((v_completed*60/v_minutes),1) END,
    'averagePickingMinutes',CASE WHEN v_completed=0 THEN 0 ELSE round(v_minutes/v_completed,1) END,
    'shortPickPercent',CASE WHEN v_total_qty+v_short_qty=0 THEN 0 ELSE round((v_short_qty::numeric/(v_total_qty+v_short_qty))*100,1) END,
    'exceptionPercent',CASE WHEN v_orders=0 THEN 0 ELSE round((v_exceptions::numeric/v_orders)*100,1) END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.picker_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.picker_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.picker_start_order(p_order_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user public.users; v_order public.orders; v_status text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN RAISE EXCEPTION 'Picker access required'; END IF;
  SELECT response_body::jsonb->>'status' INTO v_status FROM public.idempotency_keys
  WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='picker_start';
  IF v_status IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'status',v_status,'duplicate',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id<>v_user.warehouse_id THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status='PENDING' THEN
    IF v_order.picker_id IS NOT NULL THEN RAISE EXCEPTION 'Order is already assigned'; END IF;
    UPDATE public.orders SET picker_id=auth.uid(), status='ASSIGNED', updated_at=now() WHERE id=p_order_id;
    INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body)
    VALUES(p_idempotency_key,auth.uid(),'picker_start',200,'{"status":"ASSIGNED"}') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok',true,'status','ASSIGNED');
  END IF;
  IF v_order.picker_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order is not assigned to this picker'; END IF;
  IF v_order.status='ASSIGNED' THEN
    UPDATE public.orders SET status='PICKING', started_at=COALESCE(started_at,now()), updated_at=now() WHERE id=p_order_id;
    INSERT INTO public.idempotency_keys(key,user_id,operation,response_status,response_body)
    VALUES(p_idempotency_key,auth.uid(),'picker_start',200,'{"status":"PICKING"}') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok',true,'status','PICKING');
  END IF;
  RAISE EXCEPTION 'Order cannot be started from status %', v_order.status;
END;
$$;

COMMIT;


