-- 0005_barcode_scan_workflow.sql
-- Make generated product/location barcodes authoritative for picking.

CREATE OR REPLACE FUNCTION public.sync_scan_event(
  p_id text,
  p_order_id text,
  p_item_id text,
  p_scan_type text,
  p_barcode text,
  p_expected_value text,
  p_result text,
  p_idempotency_key text,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user public.users;
  v_order public.orders;
  v_item public.order_items;
  v_expected text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id=auth.uid() AND active=true;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF v_user.role NOT IN ('PICKER','PACKER') THEN
    RAISE EXCEPTION 'Scanning access required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.idempotency_keys
    WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='sync_scan_event'
  ) THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true);
  END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id=p_order_id AND warehouse_id=v_user.warehouse_id FOR SHARE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO v_item FROM public.order_items
  WHERE id=p_item_id AND order_id=p_order_id FOR SHARE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;

  IF v_user.role='PICKER' AND v_order.picker_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Order is not assigned to this picker';
  END IF;
  IF v_user.role='PACKER' AND v_order.packer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Order is not assigned to this packer';
  END IF;

  v_expected := CASE
    WHEN upper(p_scan_type)='LOCATION' THEN COALESCE(v_item.location_barcode, v_item.location)
    WHEN upper(p_scan_type) IN ('SKU','PICK') THEN COALESCE(v_item.sku_barcode, v_item.sku)
    ELSE p_expected_value
  END;

  IF upper(p_result)='SUCCESS'
     AND upper(trim(p_barcode)) <> upper(trim(v_expected)) THEN
    RAISE EXCEPTION 'Scan does not match expected value';
  END IF;

  INSERT INTO public.scan_events(
    id,order_id,item_id,user_id,role,scan_type,barcode,
    expected_value,result,idempotency_key,device_id
  )
  VALUES(
    COALESCE(NULLIF(p_id,''),gen_random_uuid()::text),
    p_order_id,p_item_id,auth.uid(),v_user.role,p_scan_type,p_barcode,
    v_expected,p_result,p_idempotency_key,p_device_id
  );

  INSERT INTO public.idempotency_keys(
    key,user_id,operation,response_status,response_body
  )
  VALUES(
    p_idempotency_key,auth.uid(),'sync_scan_event',200,
    jsonb_build_object('ok',true,'duplicate',false)::text
  );

  RETURN jsonb_build_object('ok',true,'duplicate',false,'expectedValue',v_expected);
EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1 FROM public.idempotency_keys
      WHERE key=p_idempotency_key AND user_id=auth.uid() AND operation='sync_scan_event'
    ) THEN
      RETURN jsonb_build_object('ok',true,'duplicate',true);
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_scan_event(text,text,text,text,text,text,text,text,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_scan_event(text,text,text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.picker_pick_item(
  p_order_id text,
  p_item_id text,
  p_sku text,
  p_quantity integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user public.users;
  v_order public.orders;
  v_item public.order_items;
  v_new_qty integer;
  v_expected_barcode text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN
    RAISE EXCEPTION 'Picker access required';
  END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.idempotency_keys
    WHERE key = p_idempotency_key AND user_id = auth.uid() AND operation = 'picker_pick_item'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.warehouse_id <> v_user.warehouse_id THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.picker_id IS DISTINCT FROM v_user.id OR v_order.status <> 'PICKING' THEN
    RAISE EXCEPTION 'Order is not available for picking';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_item_id AND order_id = p_order_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;

  v_expected_barcode := COALESCE(v_item.sku_barcode, v_item.sku);

  IF upper(trim(v_expected_barcode)) <> upper(trim(p_sku)) THEN
    RAISE EXCEPTION 'Product barcode does not match';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.scan_events se
    WHERE se.order_id=p_order_id
      AND se.item_id=p_item_id
      AND se.user_id=auth.uid()
      AND se.scan_type='LOCATION'
      AND se.result='SUCCESS'
      AND se.created_at >= COALESCE(v_order.started_at, v_order.updated_at, v_order.created_at)
  ) THEN
    RAISE EXCEPTION 'Location barcode must be scanned first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.scan_events se
    WHERE se.order_id=p_order_id
      AND se.item_id=p_item_id
      AND se.user_id=auth.uid()
      AND se.scan_type IN ('SKU','PICK')
      AND se.result='SUCCESS'
      AND se.created_at >= COALESCE(v_order.started_at, v_order.updated_at, v_order.created_at)
  ) THEN
    RAISE EXCEPTION 'Product barcode must be scanned first';
  END IF;

  v_new_qty := v_item.picked_qty + p_quantity;
  IF v_new_qty > v_item.required_qty THEN
    RAISE EXCEPTION 'Picked quantity cannot exceed required quantity';
  END IF;

  UPDATE public.order_items SET picked_qty = v_new_qty WHERE id = p_item_id;

  INSERT INTO public.scan_events(
    id, order_id, item_id, user_id, role, scan_type, barcode,
    expected_value, result, idempotency_key
  )
  VALUES(
    gen_random_uuid()::text, p_order_id, p_item_id, auth.uid(), 'PICKER',
    'PICK', p_sku, v_expected_barcode, 'SUCCESS', p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO public.idempotency_keys(
    key, user_id, operation, response_status, response_body
  )
  VALUES(
    p_idempotency_key, auth.uid(), 'picker_pick_item', 200,
    jsonb_build_object('pickedQty',v_new_qty)::text
  )
  ON CONFLICT (key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'pickedQty', v_new_qty);
END;
$function$;

REVOKE ALL ON FUNCTION public.picker_pick_item(text,text,text,integer,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.picker_pick_item(text,text,text,integer,text) TO authenticated;
