// Schéma GPS — PostgreSQL (PGlite en démonstration, Postgres en production).
// Idempotent : rejoué au démarrage.
export const schemaSql = /* sql */ `

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'manager', 'seller')),
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  position int not null default 0,
  is_demo boolean not null default false
);

create table if not exists products (
  id text primary key,
  slug text not null unique,
  name text not null,
  brand text not null default '',
  category_id text references categories (id) on delete set null,
  description text not null default '',
  specs jsonb not null default '[]',
  condition text,
  axes jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  featured_position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  is_demo boolean not null default false
);

create table if not exists media (
  id text primary key,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists product_images (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  url text not null,
  alt text not null default '',
  color text,
  position int not null default 0
);

create table if not exists variants (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  sku text not null unique,
  options jsonb not null default '{}',
  price int not null check (price >= 0),
  cost_price int check (cost_price is null or cost_price >= 0),
  on_hand int not null default 0 check (on_hand >= 0),
  reserved int not null default 0 check (reserved >= 0),
  low_stock_threshold int,
  position int not null default 0,
  active boolean not null default true,
  -- Garantie au niveau de la base : on ne réserve jamais plus que le stock physique.
  constraint reserved_within_stock check (reserved <= on_hand)
);

create table if not exists promotions (
  id text primary key,
  name text not null,
  product_id text not null references products (id) on delete cascade,
  kind text not null check (kind in ('percent', 'amount')),
  value int not null check (value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text not null default '',
  phone_key text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_phone_key on customers (phone_key);

create sequence if not exists order_number_seq;

create table if not exists orders (
  id text primary key,
  reference text not null unique,
  idempotency_key text unique,
  customer_id text references customers (id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  channel text not null check (channel in ('whatsapp', 'boutique', 'telephone', 'autre')),
  status text not null check (status in ('confirmed', 'completed', 'cancelled')),
  fulfillment text not null check (fulfillment in ('to_prepare', 'ready', 'out_for_delivery', 'handed_over')),
  reception text not null check (reception in ('pickup', 'delivery', 'immediate')),
  delivery_address text not null default '',
  delivery_zone text not null default '',
  delivery_fee int check (delivery_fee is null or delivery_fee >= 0),
  subtotal int not null check (subtotal >= 0),
  notes text not null default '',
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  is_demo boolean not null default false
);
create index if not exists orders_created_at on orders (created_at);

-- Désignations et prix figés au moment de la commande.
create table if not exists order_lines (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  variant_id text not null references variants (id) on delete restrict,
  product_id text not null,
  sku text not null,
  name text not null,
  options_label text not null default '',
  unit_price int not null check (unit_price >= 0),
  cost_price int,
  quantity int not null check (quantity > 0),
  returned_quantity int not null default 0 check (returned_quantity >= 0),
  position int not null default 0,
  check (returned_quantity <= quantity)
);

create table if not exists payments (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  kind text not null check (kind in ('payment', 'refund', 'reversal')),
  method text not null check (method in ('cash', 'mobile_money', 'card', 'bank_transfer', 'other')),
  amount int not null check (amount > 0),
  note text not null default '',
  reverses_id text references payments (id),
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists stock_batches (
  id text primary key,
  kind text not null check (kind in ('restock', 'inventory')),
  reference text not null default '',
  supplier text not null default '',
  note text not null default '',
  user_id text references users (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id text primary key,
  variant_id text not null references variants (id) on delete cascade,
  kind text not null check (kind in ('initial', 'restock', 'reservation', 'release', 'sale', 'return_restock', 'return_no_restock', 'inventory', 'adjustment')),
  on_hand_delta int not null default 0,
  reserved_delta int not null default 0,
  on_hand_after int not null,
  reserved_after int not null,
  reason text not null default '',
  order_id text references orders (id) on delete set null,
  batch_id text references stock_batches (id) on delete set null,
  user_id text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_variant on stock_movements (variant_id, created_at);

create table if not exists order_events (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  kind text not null,
  message text not null,
  user_id text references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id text primary key,
  title text not null,
  summary text not null default '',
  operators text not null default '',
  operations text not null default '',
  hours text not null default '',
  confirmed boolean not null default false,
  position int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
`;
