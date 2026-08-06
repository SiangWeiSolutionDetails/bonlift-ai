export interface SeedConfig {
  outletCount: number;
  itemsPerBrand: number;
  customerCount: number;
  daysOfHistory: number;
  ordersPerOutletPerDay: number;
  randomSeed: number;
}

export interface GeneratedBrand {
  id: string;
  name: string;
}

export interface GeneratedOutlet {
  id: string;
  name: string;
  brandId: string;
}

/** Not a persisted table — internal generation concept only. Feeds order_lines' ref_id/item_name/category snapshots directly; there's no items table to insert this into. */
export interface GeneratedItem {
  brandId: string;
  /** the source system's item identifier — the only identity order_lines carries */
  refId: string;
  name: string;
  category: string;
  price: number;
  /** relative popularity weight, Zipf-distributed — higher = ordered more often */
  popularityWeight: number;
}

export interface GeneratedCustomer {
  id: string;
}

export interface GeneratedOrderLine {
  refId: string;
  itemName: string;
  category: string;
  quantity: number;
  unitPrice: number;
}

export interface GeneratedOrder {
  id: string;
  outletId: string;
  customerId: string | null;
  orderedAt: Date;
  lines: GeneratedOrderLine[];
}

export interface GeneratedDataset {
  brands: GeneratedBrand[];
  outlets: GeneratedOutlet[];
  customers: GeneratedCustomer[];
  orders: GeneratedOrder[];
}
