// src/types/challan.ts
export interface FabricPiece {
  pieceNumber: number;
  meters: number;
  weightKg: number;
}

export interface ChalanFoiItem {
  id: string;
  sNo: number;
  name: string; // Quality / Fabric Name
  type: string; // Fabric Type (Suiting, Ribstop, etc.)
  beam: string; // Beam No (G-174, R-109, etc.)
  swlNo: string; // SWL # / Lot # (Sw # 335, Sw # 334, etc.)
  loomNumber?: number;
  thaan: number; // Thaan (rolls/pieces count)
  totalMeters: number; // Length in meters
  totalKg: number; // Gross weight in kg
  gsm?: number;
  remarks?: string;
}

export interface DeliveryChallan {
  challanNumber: string;
  date: string;
  buyerName: string;
  destination: 'DYEING_UNIT' | 'CLIENT';
  foiItems?: ChalanFoiItem[];
  items: {
    loomNumbers: number[];
    qualityName: string;
    fabricType: string;
    beamNumber: string;
    lotNumber: string;
    pieces: FabricPiece[];
    totalMeters: number;
    totalWeightKg: number;
  }[];
}

