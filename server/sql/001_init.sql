CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS staff_users (
  id bigserial PRIMARY KEY,
  login text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','seller','warehouse')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id bigserial PRIMARY KEY,
  name text NOT NULL DEFAULT 'Клієнт',
  phone text UNIQUE NOT NULL,
  email text,
  customer_type text NOT NULL DEFAULT 'regular',
  personal_discount numeric(7,2) NOT NULL DEFAULT 0,
  debt numeric(14,2) NOT NULL DEFAULT 0,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_cars (
  id bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vin text,
  make text,
  model text,
  year integer,
  engine text,
  fuel text,
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS warehouses (
  id smallserial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO warehouses(code,name) VALUES
  ('store','Магазин'),('wholesale','Оптовий склад'),('supplier_stock','Склад оптовиків')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name;

CREATE TABLE IF NOT EXISTS products (
  id bigserial PRIMARY KEY,
  internal_code text UNIQUE,
  barcode text,
  sku text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  name text NOT NULL,
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used')),
  category text NOT NULL DEFAULT '',
  subcategory text NOT NULL DEFAULT '',
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  sale_price numeric(14,2) NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  oem text[] NOT NULL DEFAULT '{}',
  analogs text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);
CREATE INDEX IF NOT EXISTS products_name_idx ON products USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(sku,'')));

CREATE TABLE IF NOT EXISTS product_compatibility (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  year_from integer,
  year_to integer,
  engine text
);

CREATE TABLE IF NOT EXISTS stocks (
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id smallint NOT NULL REFERENCES warehouses(id),
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_id,warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES products(id),
  warehouse_id smallint REFERENCES warehouses(id),
  warehouse_to_id smallint REFERENCES warehouses(id),
  movement_type text NOT NULL,
  qty integer NOT NULL,
  cost numeric(14,2),
  reference_type text,
  reference_id bigint,
  comment text NOT NULL DEFAULT '',
  created_by bigint REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id bigserial PRIMARY KEY,
  order_number text UNIQUE NOT NULL,
  customer_id bigint REFERENCES customers(id),
  channel text NOT NULL DEFAULT 'online',
  status text NOT NULL DEFAULT 'new',
  payment_method text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT 'unpaid',
  delivery_method text NOT NULL DEFAULT '',
  delivery_city text NOT NULL DEFAULT '',
  delivery_point text NOT NULL DEFAULT '',
  carrier text,
  tracking_number text,
  comment text NOT NULL DEFAULT '',
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id bigint REFERENCES products(id),
  name text NOT NULL,
  sku text NOT NULL DEFAULT '',
  qty integer NOT NULL CHECK(qty>0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  purchase_cost numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  warehouse_id smallint REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id smallserial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  balance numeric(14,2) NOT NULL DEFAULT 0
);
INSERT INTO cash_accounts(code,name) VALUES ('cash','Готівкова каса'),('bank','Розрахунковий рахунок')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name;

CREATE TABLE IF NOT EXISTS cash_transactions (
  id bigserial PRIMARY KEY,
  account_id smallint NOT NULL REFERENCES cash_accounts(id),
  direction text NOT NULL CHECK(direction IN ('in','out')),
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  category text NOT NULL DEFAULT '',
  reference_type text,
  reference_id bigint,
  comment text NOT NULL DEFAULT '',
  created_by bigint REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  code text,
  phone text,
  email text,
  notes text NOT NULL DEFAULT '',
  debt numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_requests (
  id bigserial PRIMARY KEY,
  request_type text NOT NULL,
  customer_id bigint REFERENCES customers(id),
  order_id bigint REFERENCES orders(id),
  product_id bigint REFERENCES products(id),
  phone text,
  vin text,
  part_number text,
  reason text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  manager_reply text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_snapshots (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_by bigint REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES staff_users(id),
  action text NOT NULL,
  entity_type text,
  entity_id bigint,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
