/**
 * Ordered migrations. Each entry runs once; the index+1 is stored in PRAGMA user_version.
 * Never edit a shipped migration – append a new one.
 *
 * Multi-tenancy: every business table carries account_id and every query filters on it.
 */
export const MIGRATIONS = [
  `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    shop_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'TZS',
    timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    expiry_warning_days INTEGER NOT NULL DEFAULT 30,
    receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your business!',
    next_receipt INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#2e7d4f',
    created_at TEXT NOT NULL,
    UNIQUE (account_id, name)
  );

  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    unit TEXT NOT NULL DEFAULT 'pcs',
    buying_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    attributes TEXT NOT NULL DEFAULT '[]',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX ux_products_sku ON products(account_id, sku) WHERE sku IS NOT NULL;
  CREATE INDEX ix_products_account ON products(account_id, is_archived);

  CREATE TABLE product_ingredients (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (product_id, name)
  );
  CREATE INDEX ix_ingredients_name ON product_ingredients(account_id, name);

  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    reference TEXT NOT NULL DEFAULT '',
    purchased_on TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','voided')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_purchases_account ON purchases(account_id, purchased_on);

  CREATE TABLE batches (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    batch_number TEXT NOT NULL DEFAULT '',
    initial_quantity REAL NOT NULL,
    quantity REAL NOT NULL CHECK (quantity >= 0),
    cost_price REAL NOT NULL DEFAULT 0,
    expiry_date TEXT,
    received_on TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_batches_product ON batches(product_id, expiry_date);
  CREATE INDEX ix_batches_account_expiry ON batches(account_id, expiry_date);

  CREATE TABLE purchase_items (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    batch_number TEXT NOT NULL DEFAULT '',
    expiry_date TEXT,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL
  );

  CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('opening','purchase','sale','sale_void','adjustment','write_off')),
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    unit_price REAL,
    ref_type TEXT,
    ref_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    created_on TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_movements_account ON stock_movements(account_id, created_at);
  CREATE INDEX ix_movements_product ON stock_movements(product_id);
  CREATE INDEX ix_movements_ref ON stock_movements(account_id, ref_type, ref_id);

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    receipt_no TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    cost_total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','mobile_money','card','bank_transfer','credit')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
    note TEXT NOT NULL DEFAULT '',
    sold_on TEXT NOT NULL,
    created_at TEXT NOT NULL,
    voided_at TEXT,
    void_reason TEXT NOT NULL DEFAULT '',
    UNIQUE (account_id, receipt_no)
  );
  CREATE INDEX ix_sales_account_date ON sales(account_id, sold_on);
  CREATE INDEX ix_sales_customer ON sales(customer_id);

  CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL
  );
  CREATE INDEX ix_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX ix_sale_items_product ON sale_items(product_id);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    note TEXT NOT NULL DEFAULT '',
    paid_on TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    spent_on TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_expenses_account ON expenses(account_id, spent_on);
  `,

  // Migration 2 – staff accounts with roles. Login identities move to `users`.
  // (accounts.email / password_hash / token_version are kept for compatibility but no longer used for login.)
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','manager','cashier')),
    is_active INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_users_account ON users(account_id);

  INSERT INTO users (account_id, email, password_hash, name, role, token_version, created_at)
    SELECT id, email, password_hash, owner_name, 'owner', token_version, created_at FROM accounts;

  ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX ix_sales_user ON sales(user_id);
  `,

  `
  ALTER TABLE accounts ADD COLUMN suspended_at TEXT;
  `,
];
