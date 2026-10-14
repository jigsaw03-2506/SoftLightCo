export type Category = {
  id: string
  name: string
  createdAt: string
}

export type Product = {
  id: string
  name: string
  categoryId?: string
  categoryName?: string
  category?: string
  purchasePrice?: number
  price: number
  stock: number
  image?: string
  description?: string
  createdAt: string
  isActive?: boolean
}

export type CartItem = Product & {
  quantity: number
}

export type BatchAllocation = {
  batchId: string
  quantity: number
  unitPurchaseCost: number
  totalCost: number
}

export type SaleItem = {
  productId: string
  productName: string
  categoryId?: string
  categoryName?: string
  quantity: number
  unitPrice: number
  subtotal: number
  revenue?: number
  cogs?: number | null
  grossProfit?: number | null
  batchAllocations?: BatchAllocation[]
}

export type SaleRecord = {
  id: string
  createdAt: string
  items: SaleItem[]
  total: number
  itemCount: number
  productRevenue?: number
  totalCogs?: number | null
  grossProfit?: number | null
  packagingExpense?: number
  netProfit?: number | null
}

export type InventoryBatch = {
  id: string
  productId: string
  quantityReceived: number
  remainingQuantity: number
  unitPurchaseCost: number
  receivedAt: string
  supplier?: string
  notes?: string
  createdAt: string
  openingStock?: boolean
}

export type InventoryMovement = {
  id: string
  productId: string
  type: 'restock' | 'sale' | 'adjustment' | 'opening-cost'
  quantityChange: number
  previousStock: number
  newStock: number
  batchId?: string
  unitPurchaseCost?: number
  createdAt: string
  notes?: string
}

export type AppData = {
  version: 2
  products: Product[]
  categories: Category[]
  batches: InventoryBatch[]
  movements: InventoryMovement[]
  sales: SaleRecord[]
  lowStockThreshold: number
}

export type ProductFormState = {
  name: string
  categoryId: string
  categoryName: string
  purchasePrice: string
  price: string
  stock: string
  description: string
  image: string
}
