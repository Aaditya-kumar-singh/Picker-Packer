-- 0015_picker_idempotency_result.sql
-- Preserve the authoritative result on retries and reject idempotency-key reuse
-- across users or operations. Migration 0014 is already applied and is immutable.

BEGIN;

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
  v_existing public.idempotency_keys;
  v_new_qty integer;
  v_expected_barcode text;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE id = auth.uid() AND active = true
  FOR SHARE;

  IF v_user.id IS NULL OR v_user.role <> 'PICKER' THEN
    RAISE EXCEPTION 'Picker access required';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  -- Lock on the key itself, so concurrent retries from any session serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT * INTO v_existing
  FROM public.idempotency_keys
  WHERE key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id = auth.uid()
       AND v_existing.operation = 'picker_pick_item' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'pickedQty', COALESCE((v_existing.response_body::jsonb ->> 'pickedQty')::integer, 0)
      );
    END IF;
    RAISE EXCEPTION 'Idempotency key is already used by another operation';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL OR v_order.warehouse_id <> v_user.warehouse_id THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.picker_id IS DISTINCT FROM v_user.id OR v_order.status <> 'PICKING' THEN
    RAISE EXCEPTION 'Order is not available for picking';
  END IF;

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_item_id AND order_id = p_order_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  v_expected_barcode := COALESCE(v_item.sku_barcode, v_item.sku);
  IF upper(trim(v_expected_barcode)) <> upper(trim(COALESCE(p_sku, ''))) THEN
    RAISE EXCEPTION 'Product barcode does not match';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.scan_events se
    WHERE se.order_id = p_order_id
      AND se.item_id = p_item_id
      AND se.user_id = auth.uid()
      AND se.scan_type IN ('SKU', 'PICK')
      AND se.result = 'SUCCESS'
      AND se.created_at >= COALESCE(v_order.started_at, v_order.updated_at, v_order.created_at)
  ) THEN
    RAISE EXCEPTION 'Product barcode must be scanned first';
  END IF;

  v_new_qty := v_item.picked_qty + p_quantity;
  IF v_new_qty > v_item.required_qty THEN
    RAISE EXCEPTION 'Picked quantity cannot exceed required quantity';
  END IF;

  UPDATE public.order_items
  SET picked_qty = v_new_qty
  WHERE id = p_item_id;

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
    jsonb_build_object('ok', true, 'pickedQty', v_new_qty)::text
  );

  RETURN jsonb_build_object('ok', true, 'pickedQty', v_new_qty, 'duplicate', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.picker_pick_item(text,text,text,integer,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.picker_pick_item(text,text,text,integer,text) TO authenticated;

COMMIT;