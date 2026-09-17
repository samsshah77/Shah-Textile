// src/types/challan.ts
export interface FabricPiece {
  pieceNumber: number;
  meters: number;
  weightKg: number;
}

export interface DeliveryChallan {
  challanNumber: string;
  date: string;
  buyerName: string;
  destination: 'DYEING_UNIT' | 'CLIENT';
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
