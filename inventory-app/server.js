// Simple E-Commerce Inventory Control System
// Backend: Express + better-sqlite3 (file-based, persistent, no setup needed)

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database setup -------------------------------------------------------

const db = new Database(path.join(__dirname, 'inventory.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name          TEXT    NOT NULL,
    batch_number       TEXT    NOT NULL,
    quantity_in_stock  INTEGER NOT NULL DEFAULT 0,
    unit_cost          REAL    NOT NULL DEFAULT 0,
    updated_at         TEXT    NOT NULL,
    UNIQUE(item_name, batch_number)
  );

  CREATE TABLE IF NOT EXISTS batch_logs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name          TEXT    NOT NULL,
    batch_number       TEXT    NOT NULL,
    quantity_in_stock  INTEGER NOT NULL,
    unit_cost          REAL    NOT NULL,
    created_at         TEXT    NOT NULL
  );
`);

// Seed a couple of example rows the first time the DB is created, so the
// dashboard isn't empty on first run.
const itemCount = db.prepare('SELECT COUNT(*) AS count FROM inventory_items').get().count;
if (itemCount === 0) {
  const now = new Date().toISOString();
  const seed = db.prepare(`
    INSERT INTO inventory_items (item_name, batch_number, quantity_in_stock, unit_cost, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  seed.run('Wireless Mouse', 'B-1001', 42, 12.5, now);
  seed.run('USB-C Cable', 'B-1002', 0, 5.0, now);
  seed.run('Mechanical Keyboard', 'B-1003', 8, 45.0, now);
}

// --- Middleware ------------------------------------------------------------

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API routes --------------------------------------------------------

// GET /api/inventory - fetch marketplace catalog metrics
app.get('/api/inventory', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM inventory_items ORDER BY item_name ASC')
    .all();
  res.json(rows);
});

// POST /api/inventory/batch - create or update stock counts
app.post('/api/inventory/batch', (req, res) => {
  const { item_name, batch_number, quantity_in_stock, unit_cost } = req.body || {};

  if (!item_name || !batch_number || quantity_in_stock === undefined || unit_cost === undefined) {
    return res.status(400).json({
      error: 'item_name, batch_number, quantity_in_stock, and unit_cost are all required.',
    });
  }

  const qty = Number(quantity_in_stock);
  const cost = Number(unit_cost);

  if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty < 0 || cost < 0) {
    return res.status(400).json({
      error: 'quantity_in_stock and unit_cost must be non-negative numbers.',
    });
  }

  const now = new Date().toISOString();

  // Upsert: create the item if it's new (by item_name + batch_number),
  // otherwise update its counts.
  db.prepare(`
    INSERT INTO inventory_items (item_name, batch_number, quantity_in_stock, unit_cost, updated_at)
    VALUES (@item_name, @batch_number, @qty, @cost, @now)
    ON CONFLICT(item_name, batch_number) DO UPDATE SET
      quantity_in_stock = excluded.quantity_in_stock,
      unit_cost          = excluded.unit_cost,
      updated_at         = excluded.updated_at
  `).run({ item_name, batch_number, qty, cost, now });

  // Record this change in the batch adjustment log
  db.prepare(`
    INSERT INTO batch_logs (item_name, batch_number, quantity_in_stock, unit_cost, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(item_name, batch_number, qty, cost, now);

  res.status(201).json({
    message: 'Inventory updated.',
    item_name,
    batch_number,
    quantity_in_stock: qty,
    unit_cost: cost,
    updated_at: now,
  });
});

// GET /api/logs - last 10 batch adjustment logs, most recent first
app.get('/api/logs', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM batch_logs ORDER BY id DESC LIMIT 10')
    .all();
  res.json(rows);
});

// --- Start server ------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Inventory Control System running at http://localhost:${PORT}`);
});
