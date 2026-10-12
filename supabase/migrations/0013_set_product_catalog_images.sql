-- 0013_set_product_catalog_images.sql
-- Associate each product catalog row with its corresponding SKU image in the product-images bucket.

UPDATE public.product_catalog
SET image_path = sku || '.jpg'
WHERE image_path IS NULL;
