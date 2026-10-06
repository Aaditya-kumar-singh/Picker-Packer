-- Supabase Migration Schema
-- Paste this into the Supabase SQL Editor

-- 1. Create the users table (Profiles for Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('PICKER', 'PACKER')),
  name TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create riders
CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create the orders table
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  sla_minutes INT NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  picker_id UUID REFERENCES users(id),
  packer_id UUID REFERENCES users(id),
  rider_id UUID REFERENCES riders(id),
  rider_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create the order_items table
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  location TEXT NOT NULL,
  required_qty INT NOT NULL CHECK (required_qty > 0),
  picked_qty INT NOT NULL DEFAULT 0 CHECK (picked_qty >= 0),
  packed_qty INT NOT NULL DEFAULT 0 CHECK (packed_qty >= 0)
);

-- 5. Create the scan_events table
CREATE TABLE scan_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  item_id TEXT NOT NULL REFERENCES order_items(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  scan_type TEXT NOT NULL,
  barcode TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  result TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create the exceptions table
CREATE TABLE exceptions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  item_id TEXT REFERENCES order_items(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  quantity INT,
  note TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- 7. Create the packages table
CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  package_number INT NOT NULL,
  package_type TEXT NOT NULL,
  weight REAL,
  dimensions JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, package_number)
);

-- 8. Create the audit_events table
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  order_id TEXT REFERENCES orders(id),
  item_id TEXT REFERENCES order_items(id),
  event_type TEXT NOT NULL,
  metadata TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Create idempotency_keys
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  operation TEXT NOT NULL,
  response_status INT,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Production security is applied by supabase/migrations/0001_harden_workflow.sql.
-- Do not disable RLS in production.
