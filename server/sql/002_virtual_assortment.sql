ALTER TABLE products
  ADD COLUMN IF NOT EXISTS supply_type text NOT NULL DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS external_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supplier_lead_time text NOT NULL DEFAULT '1–2 дні',
  ADD COLUMN IF NOT EXISTS procurement_note text NOT NULL DEFAULT '';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS supply_type text NOT NULL DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS procurement_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
