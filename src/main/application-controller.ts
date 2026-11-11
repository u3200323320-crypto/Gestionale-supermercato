import type { IpcMain } from 'electron';
import type { ApplicationCommand } from '../shared/types';
import { SupplierOrderService } from './supplier-order-service';

export class ApplicationController {
  constructor(private readonly supplierOrders: SupplierOrderService) {}

  register(ipcMain: IpcMain): void {
    ipcMain.handle('application:execute', (event, command: ApplicationCommand) => {
      if (!command || typeof command !== 'object') throw new Error('Comando applicativo non valido.');
      switch (command.type) {
        case 'supplier-order.save':
          return this.supplierOrders.save(event.sender.id, command.input);
        case 'supplier-order.receive':
          return this.supplierOrders.receive(event.sender.id, command.orderId, command.itemId, command.employeeBarcode);
        default:
          throw new Error('Comando applicativo non supportato.');
      }
    });
  }
}
