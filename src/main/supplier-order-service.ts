import type { AuthenticatedEmployee, SupplierOrderInput } from '../shared/types';
import type { ApplicationEventBus } from './application-events';
import { SupplierOrderRepository, type SupplierOrderMovementWriter } from './data/supplier-order-repository';

type SupplierPageAuthorizer = (senderId: number) => AuthenticatedEmployee;
type EmployeeLookup = (barcode: unknown) => AuthenticatedEmployee | null;
type ValidDate = (value: string) => boolean;

export class SupplierOrderService {
  constructor(
    private readonly repository: SupplierOrderRepository,
    private readonly authorize: SupplierPageAuthorizer,
    private readonly employeeForLogin: EmployeeLookup,
    private readonly isValidDate: ValidDate,
    private readonly recordMovement: SupplierOrderMovementWriter,
    private readonly events: ApplicationEventBus,
  ) {}

  save(senderId: number, input: SupplierOrderInput): void {
    const session = this.authorize(senderId);
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || !Number.isSafeInteger(input.supplier_id) || input.supplier_id < 1
      || !Number.isSafeInteger(input.site_id) || input.site_id < 1
      || typeof input.received !== 'boolean'
      || typeof input.notes !== 'string' || input.notes.length > 1000
      || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
      throw new Error('Dati dell’ordine non validi.');
    }
    const supplier = this.repository.findSupplier(input.supplier_id);
    if (!supplier) throw new Error('Seleziona un fornitore valido.');
    const site = this.repository.findSite(input.site_id);
    if (!site) throw new Error('Seleziona una sede valida per il ricevimento.');
    if (typeof input.employee_barcode !== 'string' || input.employee_barcode.trim() !== session.barcode
      || !this.employeeForLogin(input.employee_barcode)) {
      throw new Error('Il barcode non corrisponde al dipendente autenticato.');
    }
    if (input.received) {
      if (input.expected_arrival_date !== null) {
        throw new Error('Verifica il barcode del dipendente per registrare il ricevimento.');
      }
    } else if (typeof input.expected_arrival_date !== 'string' || !this.isValidDate(input.expected_arrival_date)) {
      throw new Error('Seleziona una data prevista di arrivo valida.');
    }
    const seenProducts = new Set<number>();
    const items = input.items.map((item) => {
      if (!item || !Number.isSafeInteger(item.product_id) || item.product_id < 1
        || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000
        || !Number.isFinite(item.unit_cost) || item.unit_cost < 0 || item.unit_cost > 1_000_000
        || seenProducts.has(item.product_id)) {
        throw new Error('Verifica articoli, quantità e costi dell’ordine.');
      }
      seenProducts.add(item.product_id);
      const product = this.repository.findProduct(item.product_id);
      if (!product) throw new Error('Un articolo selezionato non esiste più.');
      return { ...item, ...product };
    });
    const createdAt = new Date().toISOString();
    const orderId = this.repository.create(input, supplier.id, site, items, session, createdAt, this.recordMovement);
    this.events.publish('supplier-order.created', {
      barcode: session.barcode,
      orderId,
      received: input.received,
    });
  }

  receive(senderId: number, orderId: number, itemId: number | null, employeeBarcode: string): void {
    const session = this.authorize(senderId);
    const employee = this.employeeForLogin(employeeBarcode);
    if (!employee || employee.barcode !== session.barcode || employeeBarcode.trim() !== session.barcode) {
      throw new Error('Il barcode non corrisponde al dipendente autenticato.');
    }
    if (!Number.isSafeInteger(orderId) || orderId < 1) throw new Error('Ordine non valido.');
    if (itemId !== null && (!Number.isSafeInteger(itemId) || itemId < 1)) throw new Error('Articolo dell’ordine non valido.');
    const order = this.repository.findOrderForReceiving(orderId);
    if (!order || order.site_id === null || !order.site_name) throw new Error('Ordine o sede di ricevimento non disponibile.');
    if (order.received_at) throw new Error('Questo ordine è già stato ricevuto.');
    const items = this.repository.findPendingItems(orderId, itemId);
    if (!items.length) throw new Error(itemId === null ? 'Non ci sono articoli da ricevere.' : 'Articolo già ricevuto o non appartenente a questo ordine.');
    if (!this.repository.productsExist(items)) throw new Error('Gli articoli dell’ordine non sono più disponibili.');
    const receivingOrder = {
      ...order,
      site_id: order.site_id,
      site_name: order.site_name,
    };
    this.repository.receive(receivingOrder, items, employee, new Date().toISOString(), this.recordMovement);
    this.events.publish('supplier-order.received', { barcode: session.barcode, orderId, itemCount: items.length });
  }

  updateItem(senderId: number, orderId: number, itemId: number, quantity: number, unitCost: number, employeeBarcode: string): void {
    const session = this.authorize(senderId);
    this.authorizeEmployeeBarcode(session, employeeBarcode);
    this.validateOrderItemIds(orderId, itemId);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000
      || !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000) {
      throw new Error('Inserisci una quantità e un costo validi.');
    }
    this.repository.updatePendingItem(orderId, itemId, quantity, unitCost);
    this.events.publish('supplier-order.item-updated', { barcode: session.barcode, orderId, itemId });
  }

  deleteItem(senderId: number, orderId: number, itemId: number, employeeBarcode: string): void {
    const session = this.authorize(senderId);
    this.authorizeEmployeeBarcode(session, employeeBarcode);
    this.validateOrderItemIds(orderId, itemId);
    this.repository.deletePendingItem(orderId, itemId);
    this.events.publish('supplier-order.item-deleted', { barcode: session.barcode, orderId, itemId });
  }

  private authorizeEmployeeBarcode(session: AuthenticatedEmployee, employeeBarcode: string): void {
    const employee = this.employeeForLogin(employeeBarcode);
    if (!employee || employee.barcode !== session.barcode || employeeBarcode.trim() !== session.barcode) {
      throw new Error('Il barcode non corrisponde al dipendente autenticato.');
    }
  }

  private validateOrderItemIds(orderId: number, itemId: number): void {
    if (!Number.isSafeInteger(orderId) || orderId < 1) throw new Error('Ordine non valido.');
    if (!Number.isSafeInteger(itemId) || itemId < 1) throw new Error('Articolo dell’ordine non valido.');
  }
}
