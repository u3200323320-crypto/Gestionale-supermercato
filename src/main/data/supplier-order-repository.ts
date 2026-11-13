import type Database from 'better-sqlite3';
import type { AuthenticatedEmployee, Product, SupplierOrder, SupplierOrderInput } from '../../shared/types';

type SupplierRecord = { id: number };
type SiteRecord = { id: number; name: string };
type ProductRecord = { id: number; name: string; code: string; unit: Product['unit'] };
type OrderRecord = { id: number; site_id: number | null; received_at: string | null; site_name: string | null };
type PendingItemRecord = { id: number; product_id: number; product_name: string; quantity: number };
type OrderItem = SupplierOrderInput['items'][number] & ProductRecord;

export type SupplierOrderMovementWriter = (
  productId: number,
  productName: string,
  quantity: number,
  note: string,
  person: string,
  site: string,
) => void;

export class SupplierOrderRepository {
  constructor(private readonly database: Database.Database) {}

  initialize(): void {
    const columns = this.database.prepare('PRAGMA table_info(supplier_orders)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'site_id')) this.database.exec('ALTER TABLE supplier_orders ADD COLUMN site_id INTEGER');
    if (!columns.some((column) => column.name === 'expected_arrival_date')) this.database.exec('ALTER TABLE supplier_orders ADD COLUMN expected_arrival_date TEXT');
    if (!columns.some((column) => column.name === 'received_at')) this.database.exec('ALTER TABLE supplier_orders ADD COLUMN received_at TEXT');
    const itemColumns = this.database.prepare('PRAGMA table_info(supplier_order_items)').all() as Array<{ name: string }>;
    if (!itemColumns.some((column) => column.name === 'received_at')) this.database.exec('ALTER TABLE supplier_order_items ADD COLUMN received_at TEXT');
    this.database.prepare(`UPDATE supplier_order_items
      SET received_at = (SELECT received_at FROM supplier_orders WHERE supplier_orders.id = supplier_order_items.order_id)
      WHERE received_at IS NULL AND EXISTS (
        SELECT 1 FROM supplier_orders
        WHERE supplier_orders.id = supplier_order_items.order_id AND supplier_orders.received_at IS NOT NULL
      )`).run();
  }

  all(): SupplierOrder[] {
    const orders = this.database.prepare(`SELECT orders.id, orders.supplier_id, suppliers.name AS supplier_name,
        orders.site_id, sites.name AS site_name, orders.created_at, orders.expected_arrival_date,
        orders.received_at, orders.notes
      FROM supplier_orders orders JOIN suppliers ON suppliers.id = orders.supplier_id
      LEFT JOIN sites ON sites.id = orders.site_id
      ORDER BY orders.created_at DESC, orders.id DESC`).all() as Omit<SupplierOrder, 'items'>[];
    const itemsForOrder = this.database.prepare(`SELECT id, product_id, product_name, product_code, unit, quantity, unit_cost, received_at
      FROM supplier_order_items WHERE order_id = ? ORDER BY id`);
    return orders.map((order) => ({
      ...order,
      items: itemsForOrder.all(order.id) as SupplierOrder['items'],
    }));
  }

  findSupplier(id: number): SupplierRecord | undefined {
    return this.database.prepare('SELECT id FROM suppliers WHERE id = ?').get(id) as SupplierRecord | undefined;
  }

  findSite(id: number): SiteRecord | undefined {
    return this.database.prepare('SELECT id, name FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;
  }

  findProduct(id: number): ProductRecord | undefined {
    return this.database.prepare('SELECT id, name, code, unit FROM products WHERE id = ?').get(id) as ProductRecord | undefined;
  }

  create(
    input: SupplierOrderInput,
    supplierId: number,
    site: SiteRecord,
    items: OrderItem[],
    employee: AuthenticatedEmployee,
    createdAt: string,
    recordMovement: SupplierOrderMovementWriter,
  ): number {
    return this.database.transaction(() => {
      const receivedAt = input.received ? createdAt : null;
      const result = this.database.prepare(`INSERT INTO supplier_orders
        (supplier_id, site_id, expected_arrival_date, received_at, created_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)`).run(supplierId, site.id, input.expected_arrival_date, receivedAt, createdAt, input.notes.trim());
      const orderId = Number(result.lastInsertRowid);
      const insertItem = this.database.prepare(`INSERT INTO supplier_order_items
        (order_id, product_id, product_name, product_code, unit, quantity, unit_cost, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of items) {
        insertItem.run(orderId, item.product_id, item.name, item.code, item.unit ?? 'PEZZO', item.quantity, item.unit_cost, receivedAt);
      }
      if (input.received) {
        const person = `${employee.first_name} ${employee.last_name}`.trim();
        for (const item of items) {
          this.database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock) VALUES (?, ?, ?)
            ON CONFLICT(product_id, site_id) DO UPDATE SET stock = site_inventory.stock + excluded.stock`)
            .run(item.product_id, site.id, item.quantity);
          this.database.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
          recordMovement(item.product_id, item.name, item.quantity, `Ordine fornitore #${orderId}`, person, site.name);
        }
      }
      return orderId;
    })();
  }

  findOrderForReceiving(orderId: number): OrderRecord | undefined {
    return this.database.prepare(`SELECT orders.id, orders.site_id, orders.received_at, sites.name AS site_name
      FROM supplier_orders orders LEFT JOIN sites ON sites.id = orders.site_id WHERE orders.id = ?`)
      .get(orderId) as OrderRecord | undefined;
  }

  findPendingItems(orderId: number, itemId: number | null): PendingItemRecord[] {
    return itemId === null
      ? this.database.prepare(`SELECT id, product_id, product_name, quantity FROM supplier_order_items
          WHERE order_id = ? AND received_at IS NULL ORDER BY id`).all(orderId) as PendingItemRecord[]
      : this.database.prepare(`SELECT id, product_id, product_name, quantity FROM supplier_order_items
          WHERE order_id = ? AND id = ? AND received_at IS NULL`).all(orderId, itemId) as PendingItemRecord[];
  }

  productsExist(items: PendingItemRecord[]): boolean {
    const hasProduct = this.database.prepare('SELECT 1 FROM products WHERE id = ?');
    return items.every((item) => Boolean(hasProduct.get(item.product_id)));
  }

  receive(
    order: OrderRecord & { site_id: number; site_name: string },
    items: PendingItemRecord[],
    employee: AuthenticatedEmployee,
    receivedAt: string,
    recordMovement: SupplierOrderMovementWriter,
  ): void {
    this.database.transaction(() => {
      for (const item of items) {
        this.database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock) VALUES (?, ?, ?)
          ON CONFLICT(product_id, site_id) DO UPDATE SET stock = site_inventory.stock + excluded.stock`)
          .run(item.product_id, order.site_id, item.quantity);
        this.database.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
        recordMovement(item.product_id, item.product_name, item.quantity, `Ordine fornitore #${order.id}`,
          `${employee.first_name} ${employee.last_name}`.trim(), order.site_name);
        const update = this.database.prepare('UPDATE supplier_order_items SET received_at = ? WHERE id = ? AND received_at IS NULL')
          .run(receivedAt, item.id);
        if (update.changes !== 1) throw new Error('Articolo già ricevuto o non più disponibile.');
      }
      this.database.prepare(`UPDATE supplier_orders SET received_at = ?
        WHERE id = ? AND received_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM supplier_order_items WHERE order_id = ? AND received_at IS NULL)`)
        .run(receivedAt, order.id, order.id);
    })();
  }

  updatePendingItem(orderId: number, itemId: number, quantity: number, unitCost: number): void {
    const changed = this.database.prepare(`UPDATE supplier_order_items SET quantity = ?, unit_cost = ?
      WHERE id = ? AND order_id = ? AND received_at IS NULL
        AND EXISTS (SELECT 1 FROM supplier_orders WHERE id = ? AND received_at IS NULL)`)
      .run(quantity, unitCost, itemId, orderId, orderId);
    if (changed.changes !== 1) throw new Error('Ordine ricevuto o articolo non più modificabile.');
  }

  deletePendingItem(orderId: number, itemId: number): void {
    this.database.transaction(() => {
      const order = this.database.prepare('SELECT received_at FROM supplier_orders WHERE id = ?').get(orderId) as { received_at: string | null } | undefined;
      if (!order || order.received_at) throw new Error('Ordine ricevuto o non più disponibile.');
      const item = this.database.prepare(`SELECT id FROM supplier_order_items
        WHERE id = ? AND order_id = ? AND received_at IS NULL`).get(itemId, orderId);
      if (!item) throw new Error('Articolo ricevuto o non appartenente a questo ordine.');
      this.database.prepare('DELETE FROM supplier_order_items WHERE id = ?').run(itemId);
      const remaining = this.database.prepare('SELECT COUNT(*) AS count FROM supplier_order_items WHERE order_id = ?')
        .get(orderId) as { count: number };
      if (remaining.count === 0) this.database.prepare('DELETE FROM supplier_orders WHERE id = ?').run(orderId);
    })();
  }
}
