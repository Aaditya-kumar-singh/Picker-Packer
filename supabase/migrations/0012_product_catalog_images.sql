-- 0012_product_catalog_images.sql
-- Add image metadata to the existing warehouse catalog and expose active
-- catalog rows to authenticated app users.

ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS image_path text;

COMMENT ON COLUMN public.product_catalog.image_path IS
  'Object path inside the public product-images Supabase Storage bucket, e.g. <sku>.jpg. Null until a real product photo is uploaded.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[];

DROP POLICY IF EXISTS product_catalog_read_current_warehouse ON public.product_catalog;
CREATE POLICY product_catalog_read_current_warehouse
ON public.product_catalog
FOR SELECT TO authenticated
USING (active = true);

GRANT SELECT ON public.product_catalog TO authenticated;


