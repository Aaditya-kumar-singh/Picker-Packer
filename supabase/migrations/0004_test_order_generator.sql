-- 0004_test_order_generator.sql
-- Controlled development/test data generator for the YBM Picker/Packer workflow.
-- Creates one WH-A order with 1-6 random product lines every 30 seconds via Supabase Cron.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_specs text,
  ADD COLUMN IF NOT EXISTS sku_barcode text,
  ADD COLUMN IF NOT EXISTS location_barcode text;

UPDATE public.order_items
SET
  product_specs = COALESCE(product_specs, 'Standard test item'),
  sku_barcode = COALESCE(sku_barcode, sku),
  location_barcode = COALESCE(location_barcode, location);

CREATE OR REPLACE FUNCTION public.generate_test_order()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_picker public.users;
  v_order_id text;
  v_item_count integer;
  v_customer text;
  v_priority text;
  v_sla integer;
  v_created integer := 0;
BEGIN
  SELECT *
  INTO v_picker
  FROM public.users
  WHERE role='PICKER' AND warehouse_id='WH-A' AND active=true
  ORDER BY created_at, id
  LIMIT 1;

  IF v_picker.id IS NULL THEN
    RAISE EXCEPTION 'No active WH-A test picker profile exists';
  END IF;

  v_item_count := 1 + floor(random() * 6)::integer;
  v_customer := (ARRAY[
    'Test Customer Alpha','Test Customer Bravo','Test Customer Charlie',
    'Test Customer Delta','Test Customer Echo','Test Customer Foxtrot'
  ])[1 + floor(random() * 6)::integer];

  v_priority := (ARRAY['NORMAL','NORMAL','HIGH','NORMAL','URGENT'])
    [1 + floor(random() * 5)::integer];

  v_sla := CASE v_priority
    WHEN 'URGENT' THEN 30
    WHEN 'HIGH' THEN 60
    ELSE 120 + floor(random() * 61)::integer
  END;

  v_order_id := 'TEST-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') ||
    '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.orders(
    id, customer, warehouse_id, priority, sla_minutes, status, picker_id
  )
  VALUES(
    v_order_id, v_customer, 'WH-A', v_priority, v_sla, 'ASSIGNED', v_picker.id
  );

  WITH catalog AS (
    SELECT *
    FROM jsonb_to_recordset(
      '[
        {"sku":"TEST-SKU-1001","name":"Wireless Barcode Scanner","specs":"2D USB/Bluetooth scanner, black, 1D/2D support","barcode":"8901000001001","zone":"A-01","slot":"001"},
        {"sku":"TEST-SKU-1002","name":"Packing Tape 48mm","specs":"48mm x 50m clear carton sealing tape","barcode":"8901000001002","zone":"A-02","slot":"014"},
        {"sku":"TEST-SKU-1003","name":"HDMI Cable 2m","specs":"High-speed HDMI 2.0, 2 meter, black","barcode":"8901000001003","zone":"B-01","slot":"007"},
        {"sku":"TEST-SKU-1004","name":"USB-C Cable 1m","specs":"USB-C to USB-C, 100W PD, braided, 1 meter","barcode":"8901000001004","zone":"B-02","slot":"021"},
        {"sku":"TEST-SKU-1005","name":"Wireless Mouse","specs":"2.4GHz wireless optical mouse, 1600 DPI","barcode":"8901000001005","zone":"C-01","slot":"009"},
        {"sku":"TEST-SKU-1006","name":"Keyboard","specs":"USB full-size keyboard, 104 keys, black","barcode":"8901000001006","zone":"C-02","slot":"018"},
        {"sku":"TEST-SKU-1007","name":"Power Adapter","specs":"65W USB-C laptop power adapter","barcode":"8901000001007","zone":"D-01","slot":"004"},
        {"sku":"TEST-SKU-1008","name":"Phone Stand","specs":"Adjustable aluminium desktop phone stand","barcode":"8901000001008","zone":"D-02","slot":"012"},
        {"sku":"TEST-SKU-1009","name":"Ethernet Cable","specs":"Cat6 UTP Ethernet cable, 3 meter","barcode":"8901000001009","zone":"E-01","slot":"006"},
        {"sku":"TEST-SKU-1010","name":"Notebook","specs":"A5 ruled notebook, 200 pages","barcode":"8901000001010","zone":"E-02","slot":"025"}
      ]'::jsonb
    ) AS x(sku text,name text,specs text,barcode text,zone text,slot text)
    ORDER BY random()
    LIMIT v_item_count
  )
  INSERT INTO public.order_items(
    id, order_id, sku, product_name, location,
    product_specs, sku_barcode, location_barcode, required_qty, picked_qty, packed_qty
  )
  SELECT
    v_order_id || '-ITEM-' || lpad(row_number() over ()::text,2,'0'),
    v_order_id,
    sku,
    name,
    'WH-A-' || zone || '-' || slot,
    specs,
    barcode,
    'LOC-WHA-' || zone || '-' || slot,
    1 + floor(random() * 5)::integer,
    0,
    0
  FROM catalog;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'orderId',v_order_id,
    'pickerId',v_picker.id,
    'warehouseId','WH-A',
    'itemCount',v_created,
    'priority',v_priority
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_test_order() FROM PUBLIC, anon, authenticated;

-- Supabase Cron supports sub-minute schedules. This is intentionally a
-- development/test generator and creates one order every 30 seconds.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'ybm-test-order-generator',
  '30 seconds',
  'SELECT public.generate_test_order();'
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='ybm-test-order-generator'
);

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
