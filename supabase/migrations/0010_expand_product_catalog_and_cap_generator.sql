-- 0010_expand_product_catalog_and_cap_generator.sql
-- Expands the warehouse catalogue and keeps generated orders at 1-6
-- random products with the existing 30-order picker backlog guard.

INSERT INTO public.product_catalog
  (sku,name,product_type,specs,barcode,zone,slot)
VALUES
  ('YBM-SFMC-CPVC-050-3M','SFMC 1/2" CPVC Pipe','PIPE','Length=3 Mtrs','100000000152','D-01','001'),
  ('YBM-SFMC-CPVC-150-3M','SFMC 1.5" CPVC Pipe','PIPE','Length=3 Mtrs','100000000153','D-01','002'),
  ('YBM-CPVC-ELBOW-050','CPVC Elbow 1/2"','FITTING','Size=1/2 inch, 90 degree','100000000154','D-01','003'),
  ('YBM-CPVC-TEE-050','CPVC Tee 1/2"','FITTING','Size=1/2 inch','100000000155','D-01','004'),
  ('YBM-CPVC-COUPLER-050','CPVC Coupler 1/2"','FITTING','Size=1/2 inch straight coupler','100000000156','D-01','005'),
  ('YBM-CPVC-UNION-050','CPVC Union 1/2"','FITTING','Size=1/2 inch service union','100000000157','D-01','006'),
  ('YBM-CPVC-ADAPTER-050','CPVC Male Adapter 1/2"','FITTING','Size=1/2 inch threaded male adapter','100000000158','D-01','007'),
  ('YBM-CPVC-ENDCAP-050','CPVC End Cap 1/2"','FITTING','Size=1/2 inch end cap','100000000159','D-01','008'),
  ('YBM-CPVC-REDUCER-075-050','CPVC Reducer 3/4" x 1/2"','FITTING','3/4 inch to 1/2 inch reducer','100000000160','D-02','001'),
  ('YBM-CPVC-REDUCER-150-100','CPVC Reducer 1.5" x 1"','FITTING','1.5 inch to 1 inch reducer','100000000161','D-02','002'),
  ('YBM-PVC-ELBOW-100','PVC Elbow 1"','FITTING','Size=1 inch, 90 degree','100000000162','D-02','003'),
  ('YBM-PVC-TEE-100','PVC Tee 1"','FITTING','Size=1 inch','100000000163','D-02','004'),
  ('YBM-PVC-COUPLER-100','PVC Coupler 1"','FITTING','Size=1 inch straight coupler','100000000164','D-02','005'),
  ('YBM-PVC-UNION-100','PVC Union 1"','FITTING','Size=1 inch service union','100000000165','D-02','006'),
  ('YBM-PVC-ADAPTER-100','PVC Male Adapter 1"','FITTING','Size=1 inch threaded male adapter','100000000166','D-02','007'),
  ('YBM-PVC-ENDCAP-100','PVC End Cap 1"','FITTING','Size=1 inch end cap','100000000167','D-02','008'),
  ('YBM-PVC-REDUCER-100-075','PVC Reducer 1" x 3/4"','FITTING','1 inch to 3/4 inch reducer','100000000168','D-03','001'),
  ('YBM-PVC-PIPE-050-3M','PVC Pipe 1/2"','PIPE','Length=3 Mtrs','100000000169','D-03','002'),
  ('YBM-PVC-PIPE-150-3M','PVC Pipe 1.5"','PIPE','Length=3 Mtrs','100000000170','D-03','003'),
  ('YBM-BRASS-VALVE-050','Brass Ball Valve 1/2"','VALVE','Size=1/2 inch threaded','100000000171','D-03','004'),
  ('YBM-BRASS-VALVE-100','Brass Ball Valve 1"','VALVE','Size=1 inch threaded','100000000172','D-03','005'),
  ('YBM-BRASS-VALVE-150','Brass Ball Valve 1.5"','VALVE','Size=1.5 inch threaded','100000000173','D-03','006'),
  ('YBM-ANGLE-VALVE-050','Angle Valve 1/2"','VALVE','Chrome plated 1/2 inch angle valve','100000000174','D-03','007'),
  ('YBM-BIB-COCK-050','Bib Cock 1/2"','TAP','Chrome plated 1/2 inch wall tap','100000000175','D-03','008'),
  ('YBM-STOP-COCK-050','Stop Cock 1/2"','VALVE','Chrome plated 1/2 inch stop cock','100000000176','D-04','001'),
  ('YBM-CHECK-VALVE-100','Check Valve 1"','VALVE','1 inch non-return check valve','100000000177','D-04','002'),
  ('YBM-FLOAT-VALVE-100','Float Valve 1"','VALVE','1 inch tank float valve','100000000178','D-04','003'),
  ('YBM-FLEX-PIPE-050','Flexible Water Pipe 1/2"','PIPE','Length=600mm braided flexible pipe','100000000179','D-04','004'),
  ('YBM-FLEX-PIPE-100','Flexible Water Pipe 1"','PIPE','Length=1 Mtr braided flexible pipe','100000000180','D-04','005'),
  ('YBM-SILICONE-SEALANT','Silicone Sealant 280ml','CONSUMABLE','Clear sanitary silicone sealant, 280ml','100000000181','D-04','006'),
  ('YBM-PVC-SOLVENT-118','PVC Solvent Cement 118ml','CONSUMABLE','118ml solvent cement for PVC joints','100000000182','D-04','007'),
  ('YBM-PVC-SOLVENT-237','PVC Solvent Cement 237ml','CONSUMABLE','237ml solvent cement for PVC joints','100000000183','D-04','008'),
  ('YBM-PTFE-TAPE-19','PTFE Thread Seal Tape 19mm','CONSUMABLE','19mm x 15m thread seal tape','100000000184','E-01','001'),
  ('YBM-PIPE-CLAMP-050','Pipe Clamp 1/2"','ACCESSORY','Metal clamp for 1/2 inch pipe','100000000185','E-01','002'),
  ('YBM-PIPE-CLAMP-150','Pipe Clamp 1.5"','ACCESSORY','Metal clamp for 1.5 inch pipe','100000000186','E-01','003'),
  ('YBM-PIPE-HANGER-100','Pipe Hanger 1"','ACCESSORY','Adjustable metal hanger for 1 inch pipe','100000000187','E-01','004'),
  ('YBM-PIPE-HANGER-150','Pipe Hanger 1.5"','ACCESSORY','Adjustable metal hanger for 1.5 inch pipe','100000000188','E-01','005'),
  ('YBM-RUBBER-WASHER-050','Rubber Washer 1/2"','ACCESSORY','EPDM sealing washer, 1/2 inch','100000000189','E-01','006'),
  ('YBM-RUBBER-WASHER-100','Rubber Washer 1"','ACCESSORY','EPDM sealing washer, 1 inch','100000000190','E-01','007'),
  ('YBM-MIXER-ADAPTER-050','Mixer Tap Adapter 1/2"','FITTING','1/2 inch threaded mixer adapter','100000000191','E-01','008')
ON CONFLICT (sku) DO UPDATE SET
  name=excluded.name,
  product_type=excluded.product_type,
  specs=excluded.specs,
  barcode=excluded.barcode,
  zone=excluded.zone,
  slot=excluded.slot,
  active=true;

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
  SELECT * INTO v_picker
  FROM public.users
  WHERE role='PICKER' AND warehouse_id='WH-A' AND active=true
  ORDER BY created_at, id LIMIT 1;

  IF v_picker.id IS NULL THEN
    RAISE EXCEPTION 'No active WH-A test picker profile exists';
  END IF;

  SELECT count(*) INTO v_active_orders
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

  -- Every generated order contains 1-6 distinct random products.
  v_item_count := 1 + floor(random() * 6)::integer;

  v_customer := (ARRAY[
    'Test Customer Alpha','Test Customer Bravo','Test Customer Charlie',
    'Test Customer Delta','Test Customer Echo','Test Customer Foxtrot',
    'Test Customer Gamma','Test Customer Hotel'
  ])[1 + floor(random() * 8)::integer];

  v_priority := (ARRAY['NORMAL','NORMAL','NORMAL','HIGH','NORMAL','URGENT'])
    [1 + floor(random() * 6)::integer];

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
    SELECT * FROM public.product_catalog
    WHERE active=true
    ORDER BY random()
    LIMIT v_item_count
  )
  INSERT INTO public.order_items(
    id, order_id, sku, product_name, product_type, location,
    product_specs, sku_barcode, location_barcode, required_qty, picked_qty, packed_qty
  )
  SELECT
    v_order_id || '-ITEM-' || lpad(row_number() over ()::text,2,'0'),
    v_order_id, sku, name, product_type,
    'WH-A-' || zone || '-' || slot,
    specs, barcode, 'LOC-WHA-' || zone || '-' || slot,
    1 + floor(random() * 5)::integer, 0, 0
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