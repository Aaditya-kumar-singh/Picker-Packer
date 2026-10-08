-- 0011_shared_order_display_number.sql
-- Give every order one short human-readable identifier shared by Picker and Packer.
-- The database primary key remains unchanged and is used for internal routing.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.order_display_number_seq
  AS bigint
  MINVALUE 1
  START WITH 1;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Backfill existing orders deterministically by creation time.
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM public.orders
  WHERE order_number IS NULL
)
UPDATE public.orders o
SET order_number = 'ORD-' || LPAD(numbered.n::text, 6, '0')
FROM numbered
WHERE o.id = numbered.id;

-- Keep the sequence ahead of all existing generated numbers.
SELECT setval(
  'public.order_display_number_seq',
  GREATEST(
    COALESCE((
      SELECT MAX((substring(order_number from '^ORD-([0-9]+)$'))::bigint)
      FROM public.orders
      WHERE order_number ~ '^ORD-[0-9]+$'
    ), 0),
    1
  ),
  true
);

ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key
  ON public.orders(order_number);

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' THEN
    NEW.order_number :=
      'ORD-' || LPAD(nextval('public.order_display_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_assign_order_number ON public.orders;

CREATE TRIGGER orders_assign_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_number();

COMMIT;
