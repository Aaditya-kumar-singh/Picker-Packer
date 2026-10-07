-- 0009_product_catalog_and_realistic_order_generator.sql
-- Adds a reusable WH-A product catalog with warehouse barcodes and updates
-- the development order generator to build orders from the catalog.

CREATE TABLE IF NOT EXISTS public.product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  product_type text NOT NULL,
  specs text NOT NULL DEFAULT '',
  barcode text NOT NULL UNIQUE,
  zone text NOT NULL,
  slot text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_catalog_active_idx
  ON public.product_catalog(active);

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_catalog FROM PUBLIC, anon, authenticated;

INSERT INTO public.product_catalog
  (sku,name,product_type,specs,barcode,zone,slot)
VALUES
  ('YBM-SFMC-CPVC-075-3M','SFMC 3/4" CPVC Pipe','PIPE','Length=3 Mtrs','100000000106','A-01','001'),
  ('YBM-CPVC-VALVE-075','CPVC Ball Valve 3/4"','VALVE','Size=3/4 inch','100000000131','A-01','002'),
  ('YBM-SFMC-TEE-075','SFMC CPVC Tee 3/4"','FITTING','Size=3/4 inch','100000000123','A-01','003'),
  ('YBM-SFMC-ELBOW-075','SFMC CPVC Elbow 3/4"','FITTING','Size=3/4 inch, 90 degree','100000000124','A-01','004'),
  ('YBM-SFMC-COUPLER-075','SFMC CPVC Coupler 3/4"','FITTING','Size=3/4 inch straight coupler','100000000125','A-01','005'),
  ('YBM-SFMC-ADAPTER-075','SFMC CPVC Male Adapter 3/4"','FITTING','Size=3/4 inch threaded male adapter','100000000126','A-01','006'),
  ('YBM-SFMC-UNION-075','SFMC CPVC Union 3/4"','FITTING','Size=3/4 inch service union','100000000127','A-01','007'),
  ('YBM-SFMC-ENDCAP-075','SFMC CPVC End Cap 3/4"','FITTING','Size=3/4 inch end cap','100000000128','A-01','008'),
  ('YBM-SFMC-CPVC-100-3M','SFMC 1" CPVC Pipe','PIPE','Length=3 Mtrs','100000000129','A-02','001'),
  ('YBM-CPVC-VALVE-100','CPVC Ball Valve 1"','VALVE','Size=1 inch','100000000130','A-02','002'),
  ('YBM-SFMC-TEE-100','SFMC CPVC Tee 1"','FITTING','Size=1 inch','100000000132','A-02','003'),
  ('YBM-SFMC-ELBOW-100','SFMC CPVC Elbow 1"','FITTING','Size=1 inch, 90 degree','100000000133','A-02','004'),
  ('YBM-SFMC-COUPLER-100','SFMC CPVC Coupler 1"','FITTING','Size=1 inch straight coupler','100000000134','A-02','005'),
  ('YBM-SFMC-ADAPTER-100','SFMC CPVC Male Adapter 1"','FITTING','Size=1 inch threaded male adapter','100000000135','A-02','006'),
  ('YBM-CPVC-SOLVENT-118','CPVC Solvent Cement 118ml','CONSUMABLE','118ml solvent cement for CPVC joints','100000000136','B-01','001'),
  ('YBM-CPVC-SOLVENT-237','CPVC Solvent Cement 237ml','CONSUMABLE','237ml solvent cement for CPVC joints','100000000137','B-01','002'),
  ('YBM-PVC-PIPE-075-3M','PVC Pipe 3/4"','PIPE','Length=3 Mtrs','100000000138','B-01','003'),
  ('YBM-PVC-PIPE-100-3M','PVC Pipe 1"','PIPE','Length=3 Mtrs','100000000139','B-01','004'),
  ('YBM-PVC-ELBOW-075','PVC Elbow 3/4"','FITTING','Size=3/4 inch, 90 degree','100000000140','B-01','005'),
  ('YBM-PVC-TEE-075','PVC Tee 3/4"','FITTING','Size=3/4 inch','100000000141','B-01','006'),
  ('YBM-BRASS-VALVE-075','Brass Ball Valve 3/4"','VALVE','Size=3/4 inch threaded','100000000142','B-02','001'),
  ('YBM-FLEX-PIPE-075','Flexible Water Pipe 3/4"','PIPE','Length=1 Mtr braided flexible pipe','100000000143','B-02','002'),
  ('YBM-PIPE-CLAMP-075','Pipe Clamp 3/4"','ACCESSORY','Metal clamp for 3/4 inch pipe','100000000144','C-01','001'),
  ('YBM-PIPE-CLAMP-100','Pipe Clamp 1"','ACCESSORY','Metal clamp for 1 inch pipe','100000000145','C-01','002'),
  ('YBM-PTFE-TAPE-12','PTFE Thread Seal Tape','CONSUMABLE','12mm x 10m thread seal tape','100000000146','C-01','003'),
  ('YBM-CPVC-REDUCER-100-075','CPVC Reducer 1" x 3/4"','FITTING','1 inch to 3/4 inch reducer','100000000147','C-01','004'),
  ('YBM-CPVC-ELBOW-100','CPVC Elbow 1"','FITTING','Size=1 inch, 90 degree','100000000148','C-01','005'),
  ('YBM-CPVC-TEE-100','CPVC Tee 1"','FITTING','Size=1 inch','100000000149','C-01','006'),
  ('YBM-CPVC-UNION-100','CPVC Union 1"','FITTING','Size=1 inch service union','100000000150','C-02','001'),
  ('YBM-CPVC-ENDCAP-100','CPVC End Cap 1"','FITTING','Size=1 inch end cap','100000000151','C-02','002')
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

  v_item_count := 3 + floor(random() * 5)::integer;

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
    SELECT *
    FROM public.product_catalog
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
    v_order_id,
    sku,
    name,
    product_type,
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

COMMENT ON TABLE public.product_catalog IS
  'WH-A development product catalog used by the controlled test order generator. Barcodes are test warehouse identifiers.';

