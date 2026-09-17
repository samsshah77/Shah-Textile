// src/types/expense.ts
export type MachineExpenseCategory = 'G6200' | 'G6300' | 'PU' | 'Electronic' | 'All';

export interface InventoryPurchaseEntry {
  id: string;
  date: string;
  billNo: string;
  inwardNo: string;
  partyName: string;
  itemDescription: string;
  machineCategory: MachineExpenseCategory;
  quantity: number;
  costPerItem: number;
  totalPrice: number;
}

export interface PettyCashEntry {
  id: string;
  date: string;
  description: string;
  debitAmount?: number;  // Cash In
  creditAmount?: number; // Cash Out
  balance: number;
}
