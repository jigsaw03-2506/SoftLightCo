import type {
  AppData,
  Category,
  InventoryBatch,
  InventoryMovement,
  Product,
  SaleRecord,
} from '../types'

export const APP_STORAGE_KEY = 'softlightco-pos-v2'
export const LEGACY_PRODUCT_KEY = 'softlightco-products'
export const LEGACY_SALES_KEY = 'softlightco-sales'
export const ADMIN_MODE_KEY = 'softlightco-admin-mode'

export const sampleProducts: Product[] = [
  { id: 'prod-led-bulb', name: 'LED Bulb', category: 'Lighting', price: 2500, stock: 20, description: 'Energy-efficient LED bulb for home and shop lighting.', createdAt: new Date().toISOString() },
  { id: 'prod-extension-cord', name: 'Extension Cord', category: 'Electrical Accessories', price: 8000, stock: 10, description: 'Durable extension cord with safe insulation.', createdAt: new Date().toISOString() },
  { id: 'prod-electrical-tape', name: 'Electrical Tape', category: 'Electrical Accessories', price: 1000, stock: 30, description: 'High-quality electrical tape for reliable insulation.', createdAt: new Date().toISOString() },
  { id: 'prod-light-switch', name: 'Light Switch', category: 'Switches & Sockets', price: 3500, stock: 15, description: 'Modern switch ideal for residential and office spaces.', createdAt: new Date().toISOString() },
  { id: 'prod-led-tube-light', name: 'LED Tube Light', category: 'Lighting', price: 6000, stock: 12, description: 'Bright LED tube for shops and workspaces.', createdAt: new Date().toISOString() },
  { id: 'prod-plug-socket', name: 'Plug Socket', category: 'Switches & Sockets', price: 2000, stock: 25, description: 'Multi-use plug socket for daily electrical needs.', createdAt: new Date().toISOString() },
]

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function categoryIdFor(name: string) {
  return `category-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'other'}`
}

function migrateLegacyData(): AppData {
  const legacyProducts = parse<Product[]>(window.localStorage.getItem(LEGACY_PRODUCT_KEY), [])
  const products = (legacyProducts.length > 0 ? legacyProducts : sampleProducts).map((product) => {
    const categoryName = product.categoryName || product.category || 'Uncategorized'
    return {
      ...product,
      categoryId: product.categoryId || categoryIdFor(categoryName),
      categoryName,
      isActive: product.isActive ?? true,
    }
  })
  const legacySales = parse<SaleRecord[]>(window.localStorage.getItem(LEGACY_SALES_KEY), [])
  const categoriesById = new Map<string, Category>()
  for (const product of products) {
    const id = product.categoryId ?? categoryIdFor(product.categoryName ?? 'Uncategorized')
    const name = product.categoryName ?? product.category ?? 'Uncategorized'
    categoriesById.set(id, { id, name, createdAt: product.createdAt })
  }

  return {
    version: 2,
    products,
    categories: [...categoriesById.values()],
    batches: [],
    movements: [],
    lowStockThreshold: 5,
    sales: legacySales.map((sale) => ({
      ...sale,
      productRevenue: sale.productRevenue ?? sale.total,
      totalCogs: null,
      grossProfit: null,
      packagingExpense: 0,
      netProfit: null,
      items: sale.items.map((item) => ({
        ...item,
        revenue: item.revenue ?? item.subtotal,
        cogs: null,
        grossProfit: null,
        categoryName: item.categoryName ?? 'Historical category unavailable',
        batchAllocations: [],
      })),
    })),
  }
}

export function loadAppData(): AppData {
  const saved = parse<AppData | null>(window.localStorage.getItem(APP_STORAGE_KEY), null)
  if (saved?.version === 2) return { ...saved, lowStockThreshold: saved.lowStockThreshold ?? 5 }

  const migrated = migrateLegacyData()
  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(migrated))
  return migrated
}

export function saveAppData(data: AppData) {
  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data))
}

export function loadAdminMode() {
  return window.localStorage.getItem(ADMIN_MODE_KEY) !== 'false'
}

export function saveAdminMode(isAdmin: boolean) {
  window.localStorage.setItem(ADMIN_MODE_KEY, String(isAdmin))
}

export function getStoredProducts() {
  return loadAppData().products
}

export function getStoredSales() {
  return loadAppData().sales
}

export function createBatch(
  productId: string,
  quantity: number,
  unitPurchaseCost: number,
  receivedAt: string,
  supplier = '',
  notes = '',
  openingStock = false,
): InventoryBatch {
  return {
    id: crypto.randomUUID(),
    productId,
    quantityReceived: quantity,
    remainingQuantity: quantity,
    unitPurchaseCost,
    receivedAt,
    supplier: supplier.trim(),
    notes: notes.trim(),
    createdAt: new Date().toISOString(),
    openingStock,
  }
}

export function createMovement(
  productId: string,
  type: InventoryMovement['type'],
  quantityChange: number,
  previousStock: number,
  newStock: number,
  details: Pick<InventoryMovement, 'batchId' | 'unitPurchaseCost' | 'notes'> = {},
): InventoryMovement {
  return {
    id: crypto.randomUUID(),
    productId,
    type,
    quantityChange,
    previousStock,
    newStock,
    createdAt: new Date().toISOString(),
    ...details,
  }
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please upload a valid image file.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image file could not be read.'))
    reader.onerror = () => reject(new Error('The image file could not be read.'))
    reader.readAsDataURL(file)
  })
}
