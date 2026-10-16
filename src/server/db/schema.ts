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
  method text not null check (method in ('cash', 'wave', 'orange_money', 'mobile_money', 'card', 'bank_transfer', 'other')),
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
  kind text not null check (kind in ('initial', 'restock', 'reservation', 'release', 'sale', 'return_restock', 'return_no_restock', 'inventory', 'adjustment', 'unsellable', 'sellable', 'writeoff')),
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

-- ——— Refonte du Comptoir (ajouts uniquement, sans perte de données) ———

-- File GPS : état des éléments de travail (dérivés des commandes et du stock,
-- ou ajoutés à la main). La clé d'un élément dérivé change avec son état.
create table if not exists queue_items (
  key text primary key,
  kind text not null default 'manual',
  title text not null default '',
  href text not null default '',
  assignee_id text references users (id) on delete set null,
  note text not null default '',
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_by text references users (id) on delete set null,
  created_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_demo boolean not null default false
);

-- Demandes reçues depuis le panier du site (message WhatsApp avec référence GPS-R-…).
-- Une demande n'engage pas le stock : elle devient une commande après confirmation.
create sequence if not exists request_number_seq start 1001;
create table if not exists order_requests (
  id text primary key,
  reference text not null unique,
  status text not null default 'new' check (status in ('new', 'converted', 'dismissed')),
  customer_name text not null default '',
  customer_phone text not null default '',
  reception text not null check (reception in ('pickup', 'delivery')),
  delivery_zone text not null default '',
  delivery_address text not null default '',
  delivery_fee int,
  note text not null default '',
  lines jsonb not null default '[]',
  subtotal int not null default 0,
  order_id text references orders (id) on delete set null,
  status_note text not null default '',
  handled_by text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create index if not exists order_requests_created_at on order_requests (created_at);

-- Journal des actions sensibles (modes, équipe, configuration).
create table if not exists audit_log (
  id text primary key,
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}',
  user_id text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at on audit_log (created_at);

-- Moyens de paiement Wave et Orange Money : contrainte élargie (aucune ligne existante n'est modifiée).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'payments_method_check'
              and pg_get_constraintdef(oid) not like '%orange_money%') then
    alter table payments drop constraint payments_method_check;
    alter table payments add constraint payments_method_check
      check (method in ('cash', 'wave', 'orange_money', 'mobile_money', 'card', 'bank_transfer', 'other'));
  end if;
end $$;

-- Stock non vendable (abîmé, en contrôle, réservé à l'exposition) : exclu du disponible.
alter table variants add column if not exists unsellable int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'unsellable_within_stock') then
    alter table variants add constraint unsellable_within_stock check (unsellable >= 0 and reserved + unsellable <= on_hand);
  end if;
end $$;

alter table stock_movements add column if not exists unsellable_delta int not null default 0;
alter table stock_movements add column if not exists unsellable_after int not null default 0;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'stock_movements_kind_check'
              and pg_get_constraintdef(oid) not like '%writeoff%') then
    alter table stock_movements drop constraint stock_movements_kind_check;
    alter table stock_movements add constraint stock_movements_kind_check
      check (kind in ('initial', 'restock', 'reservation', 'release', 'sale', 'return_restock', 'return_no_restock',
                      'inventory', 'adjustment', 'unsellable', 'sellable', 'writeoff'));
  end if;
end $$;

-- Catalogue : corbeille (restaurable), publication programmée, historique des versions.
alter table products add column if not exists deleted_at timestamptz;
alter table products add column if not exists publish_at timestamptz;
create table if not exists product_versions (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  snapshot jsonb not null,
  user_id text references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_versions_product on product_versions (product_id, created_at);

-- Médiathèque : métadonnées et corbeille des fichiers téléversés.
alter table media add column if not exists name text not null default '';
alter table media add column if not exists size int not null default 0;
alter table media add column if not exists alt text not null default '';
alter table media add column if not exists uploaded_by text references users (id) on delete set null;
alter table media add column if not exists deleted_at timestamptz;
alter table media add column if not exists is_demo boolean not null default false;

-- Vente rapide : somme remise en espèces et monnaie rendue, enregistrées à part.
alter table payments add column if not exists tendered int;
alter table payments add column if not exists change_given int not null default 0;

-- Sécurité des comptes : mot de passe provisoire, inactivité des sessions, limitation des connexions.
alter table users add column if not exists must_change_password boolean not null default false;
alter table users add column if not exists password_changed_at timestamptz;
alter table sessions add column if not exists last_seen_at timestamptz not null default now();
alter table sessions add column if not exists user_agent text not null default '';
create table if not exists login_attempts (
  id text primary key,
  identifier text not null,
  ip text not null default '',
  success boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_identifier on login_attempts (identifier, created_at);
create index if not exists login_attempts_ip on login_attempts (ip, created_at);

-- Supabase expose le schéma public via son API : on y ferme l'accès en activant
-- la sécurité au niveau des lignes sans aucune règle. L'application, propriétaire
-- des tables, n'est pas concernée.
alter table settings enable row level security;
alter table users enable row level security;
alter table sessions enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table media enable row level security;
alter table product_images enable row level security;
alter table variants enable row level security;
alter table promotions enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table payments enable row level security;
alter table stock_batches enable row level security;
alter table stock_movements enable row level security;
alter table order_events enable row level security;
alter table services enable row level security;
alter table queue_items enable row level security;
alter table audit_log enable row level security;
alter table order_requests enable row level security;
alter table product_versions enable row level security;
alter table login_attempts enable row level security;
`;
