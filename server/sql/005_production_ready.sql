ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_availability TEXT NOT NULL DEFAULT 'Доступно для замовлення',
  ADD COLUMN IF NOT EXISTS public_delivery TEXT NOT NULL DEFAULT '1–2 дні';

CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON customers ((lower(email)));

-- Starter catalog for a fresh production database. Safe/idempotent by SKU.
INSERT INTO products (internal_code, sku, brand, name, condition, category, subcategory, purchase_price, sale_price, description, active, image_url, public_availability, public_delivery)
SELECT 'BI-0001','P 85 020','Brembo','Гальмівні колодки Brembo P 85 020','new','Гальмівна система','Гальмівні колодки',0,1450,'',true,'','Доступно для замовлення','1–2 дні'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku='P 85 020');

INSERT INTO products (internal_code, sku, brand, name, condition, category, subcategory, purchase_price, sale_price, description, active, image_url, public_availability, public_delivery)
SELECT 'BI-0002','0 986 494 123','Bosch','Гальмівні колодки Bosch','new','Гальмівна система','Гальмівні колодки',0,1280,'',true,'','Доступно для замовлення','1–2 дні'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku='0 986 494 123');

INSERT INTO products (internal_code, sku, brand, name, condition, category, subcategory, purchase_price, sale_price, description, active, image_url, public_availability, public_delivery)
SELECT 'BI-0003','OC 384','MAHLE','Масляний фільтр MAHLE','new','Фільтри','Масляні фільтри',0,420,'',true,'','Доступно для замовлення','1–2 дні'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku='OC 384');

INSERT INTO products (internal_code, sku, brand, name, condition, category, subcategory, purchase_price, sale_price, description, active, image_url, public_availability, public_delivery)
SELECT 'BI-0004','3000 951 877','SACHS','Комплект зчеплення SACHS','new','Зчеплення і трансмісія','Комплекти зчеплення',0,6850,'',true,'','Доступно для замовлення','1–2 дні'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku='3000 951 877');
