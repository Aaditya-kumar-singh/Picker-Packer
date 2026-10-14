-- 0016_repair_legacy_generic_test_products.sql
-- Re-map generated office-electronics test lines to image-backed plumbing
-- products while preserving order/item IDs and quantities. Keep scan and pack
-- evidence aligned with the corrected product identity.

BEGIN;

CREATE TEMP TABLE _legacy_product_mapping ON COMMIT DROP AS
WITH legacy_items AS (
  SELECT
    oi.id,
    oi.order_id,
    row_number() OVER (PARTITION BY oi.order_id ORDER BY oi.id) AS item_no
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.id LIKE 'TEST-%'
    AND o.customer LIKE 'Test Customer %'
    AND oi.sku LIKE 'TEST-SKU-%'
),
eligible_catalog AS (
  SELECT pc.*
  FROM public.product_catalog pc
  WHERE pc.active = true
    AND pc.image_path IS NOT NULL
    AND btrim(pc.image_path) <> ''
    AND EXISTS (
      SELECT 1
      FROM storage.objects so
      WHERE so.bucket_id = 'product-images'
        AND so.name = pc.image_path
    )
),
ranked_candidates AS (
  SELECT
    legacy.id AS item_id,
    legacy.order_id,
    legacy.item_no,
    pc.sku,
    pc.name,
    pc.product_type,
    pc.specs,
    pc.barcode,
    pc.zone,
    pc.slot,
    row_number() OVER (
      PARTITION BY legacy.id
      ORDER BY md5(legacy.order_id || ':' || pc.sku), pc.sku
    ) AS candidate_no
  FROM legacy_items legacy
  CROSS JOIN eligible_catalog pc
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.order_items existing
    WHERE existing.order_id = legacy.order_id
      AND existing.sku NOT LIKE 'TEST-SKU-%'
      AND existing.sku = pc.sku
  )
)
SELECT item_id, order_id, sku, name, product_type, specs, barcode, zone, slot
FROM ranked_candidates
WHERE candidate_no = item_no;

UPDATE public.order_items oi
SET
  sku = m.sku,
  product_name = m.name,
  product_type = m.product_type,
  product_specs = m.specs,
  sku_barcode = m.barcode,
  location = 'WH-A-' || m.zone || '-' || m.slot,
  location_barcode = 'LOC-WHA-' || m.zone || '-' || m.slot
FROM _legacy_product_mapping m
WHERE oi.id = m.item_id;

UPDATE public.scan_events se
SET
  barcode = CASE
    WHEN se.scan_type = 'LOCATION' THEN 'LOC-WHA-' || m.zone || '-' || m.slot
    ELSE m.barcode
  END,
  expected_value = CASE
    WHEN se.scan_type = 'LOCATION' THEN 'LOC-WHA-' || m.zone || '-' || m.slot
    ELSE m.barcode
  END
FROM _legacy_product_mapping m
WHERE se.item_id = m.item_id
  AND se.scan_type IN ('LOCATION', 'SKU', 'PICK');

UPDATE public.packing_confirmations pc
SET
  product_name = m.name,
  product_type = m.product_type,
  product_barcode = m.barcode
FROM _legacy_product_mapping m
WHERE pc.item_id = m.item_id;

-- Future generated orders may only draw from active products whose image file
-- actually exists in the public product-images bucket.
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
  WHERE role = 'PICKER' AND warehouse_id = 'WH-A' AND active = true
  ORDER BY created_at, id
  LIMIT 1;

  IF v_picker.id IS NULL THEN
    RAISE EXCEPTION 'No active WH-A test picker profile exists';
  END IF;

  SELECT count(*) INTO v_active_orders
  FROM public.orders
  WHERE id LIKE 'TEST-%'
    AND picker_id = v_picker.id
    AND status IN ('ASSIGNED', 'PICKING');

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
    'Test Customer Alpha', 'Test Customer Bravo', 'Test Customer Charlie',
    'Test Customer Delta', 'Test Customer Echo', 'Test Customer Foxtrot',
    'Test Customer Gamma', 'Test Customer Hotel'
  ])[1 + floor(random() * 8)::integer];

  v_priority := (ARRAY['NORMAL', 'NORMAL', 'NORMAL', 'HIGH', 'NORMAL', 'URGENT'])
    [1 + floor(random() * 6)::integer];

  v_sla := CASE v_priority
    WHEN 'URGENT' THEN 30
    WHEN 'HIGH' THEN 60
    ELSE 120 + floor(random() * 61)::integer
  END;

  v_order_id := 'TEST-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders(
    id, customer, warehouse_id, priority, sla_minutes, status, picker_id
  )
  VALUES (
    v_order_id, v_customer, 'WH-A', v_priority, v_sla, 'ASSIGNED', v_picker.id
  );

  WITH catalog AS (
    SELECT pc.*
    FROM public.product_catalog pc
    WHERE pc.active = true
      AND pc.image_path IS NOT NULL
      AND btrim(pc.image_path) <> ''
      AND EXISTS (
        SELECT 1
        FROM storage.objects so
        WHERE so.bucket_id = 'product-images'
          AND so.name = pc.image_path
      )
    ORDER BY random()
    LIMIT v_item_count
  )
  INSERT INTO public.order_items(
    id, order_id, sku, product_name, product_type, location,
    product_specs, sku_barcode, location_barcode, required_qty, picked_qty, packed_qty
  )
  SELECT
    v_order_id || '-ITEM-' || lpad(row_number() OVER ()::text, 2, '0'),
    v_order_id, sku, name, product_type,
    'WH-A-' || zone || '-' || slot,
    specs, barcode, 'LOC-WHA-' || zone || '-' || slot,
    1 + floor(random() * 5)::integer, 0, 0
  FROM catalog;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  IF v_created = 0 THEN
    RAISE EXCEPTION 'No active catalog products with uploaded images are available';
  END IF;

  RETURN jsonb_build_object(
    'created', true,
    'orderId', v_order_id,
    'pickerId', v_picker.id,
    'warehouseId', 'WH-A',
    'itemCount', v_created,
    'priority', v_priority,
    'activeOrdersAfterCreate', v_active_orders + 1,
    'maxActiveOrders', v_max_active_orders
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_test_order() FROM PUBLIC, anon, authenticated;

COMMIT;
