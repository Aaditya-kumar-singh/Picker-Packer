-- 0006_test_order_backlog_cap.sql
-- Keep the automated test generator from creating an unbounded picker backlog.
-- Maximum 30 active/unworked test orders assigned to the test picker.

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
  v_active_orders integer := 0;
  v_max_active_orders constant integer := 30;
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

  -- Only count orders still waiting for picker work.
  -- Once the picker moves an order beyond ASSIGNED/PICKING, it no longer
  -- consumes the generator backlog allowance.
  SELECT count(*)
  INTO v_active_orders
  FROM public.orders
  WHERE id LIKE 'TEST-%'
    AND picker_id = v_picker.id
    AND status IN ('ASSIGNED','PICKING');

  IF v_active_orders >= v_max_active_orders THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'PICKER_BACKLOG_LIMIT',
      'activeOrders', v_active_orders,
      'maxActiveOrders', v_max_active_orders,
      'pickerId', v_picker.id,
      'warehouseId', 'WH-A'
    );
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
    'created', true,
    'orderId',v_order_id,
    'pickerId',v_picker.id,
    'warehouseId','WH-A',
    'itemCount',v_created,
    'priority',v_priority,
    'activeOrdersAfterCreate',v_active_orders + 1,
    'maxActiveOrders',v_max_active_orders
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_test_order() FROM PUBLIC, anon, authenticated;
