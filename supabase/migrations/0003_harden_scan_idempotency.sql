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
    WHEN upper(p_scan_type)='LOCATION' THEN v_item.location
    WHEN upper(p_scan_type) IN ('SKU','PICK') THEN v_item.sku
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

  RETURN jsonb_build_object('ok',true,'duplicate',false);
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
