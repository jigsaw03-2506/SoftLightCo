import { createMovement } from './storage'
import type { AppData, BatchAllocation, SaleRecord } from '../types'

export type SaleRequestItem = { productId: string; quantity: number }

export class SaleError extends Error {}

export function applySale(
  data: AppData,
  items: SaleRequestItem[],
  packagingExpense: number,
  saleId: string,
  cashier: Pick<SaleRecord, 'cashierUid' | 'cashierEmail'> = {},
  // Used when the owner edits a past sale: keep its original time and prices,
  // and allow products that were deleted after the sale.
  original?: { createdAt: string; unitPrices: Record<string, number> },
): AppData {
  if (items.length === 0) throw new SaleError('Add at least one item before completing a sale.')
  if (!Number.isFinite(packagingExpense) || packagingExpense < 0) {
    throw new SaleError('Packaging cost must be a non-negative amount.')
  }

  const products = data.products.map((product) => ({ ...product }))
  const batches = data.batches.map((batch) => ({ ...batch }))
  const saleMovements = []
  const saleItems: SaleRecord['items'] = []
  let productRevenue = 0
  let totalCogs = 0
  let hasIncompleteCogs = false

  for (const requested of items) {
    const inventory = products.find((product) => product.id === requested.productId)
    if (!inventory || (!original && inventory.isActive === false) || !Number.isInteger(requested.quantity) ||
      requested.quantity < 1 || requested.quantity > inventory.stock) {
      throw new SaleError('One or more items exceed the available stock.')
    }

    let quantityRemaining = requested.quantity
    const availableBatches = batches
      .filter((batch) => batch.productId === requested.productId && batch.remainingQuantity > 0)
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.createdAt.localeCompare(right.createdAt))
    const batchQuantityAvailable = availableBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0)
    const costedAvailable = Math.min(batchQuantityAvailable, inventory.stock)
    const uncostedQuantity = Math.min(quantityRemaining, Math.max(0, inventory.stock - costedAvailable))
    quantityRemaining -= uncostedQuantity

    const allocations: BatchAllocation[] = []
    let lineCogs = 0
    for (const batch of availableBatches) {
      if (quantityRemaining <= 0) break
      const quantity = Math.min(quantityRemaining, batch.remainingQuantity)
      const totalCost = quantity * batch.unitPurchaseCost
      batch.remainingQuantity -= quantity
      quantityRemaining -= quantity
      lineCogs += totalCost
      allocations.push({ batchId: batch.id, quantity, unitPurchaseCost: batch.unitPurchaseCost, totalCost })
    }

    const incomplete = uncostedQuantity > 0
    hasIncompleteCogs ||= incomplete
    const unitPrice = original?.unitPrices[inventory.id] ?? inventory.price
    const revenue = unitPrice * requested.quantity
    productRevenue += revenue
    totalCogs += lineCogs
    saleItems.push({
      productId: inventory.id,
      productName: inventory.name,
      categoryId: inventory.categoryId,
      categoryName: inventory.categoryName ?? inventory.category ?? 'Uncategorized',
      quantity: requested.quantity,
      unitPrice,
      subtotal: revenue,
      revenue,
      cogs: incomplete ? null : lineCogs,
      grossProfit: incomplete ? null : revenue - lineCogs,
      batchAllocations: allocations,
    })

    let movementStock = inventory.stock
    if (uncostedQuantity > 0) {
      const nextStock = movementStock - uncostedQuantity
      saleMovements.push(createMovement(inventory.id, 'sale', -uncostedQuantity, movementStock, nextStock, {
        notes: `Sale ${saleId}; cost unavailable for opening stock`,
      }))
      movementStock = nextStock
    }
    for (const allocation of allocations) {
      const nextStock = movementStock - allocation.quantity
      saleMovements.push(createMovement(inventory.id, 'sale', -allocation.quantity, movementStock, nextStock, {
        batchId: allocation.batchId,
        unitPurchaseCost: allocation.unitPurchaseCost,
        notes: `Sale ${saleId}`,
      }))
      movementStock = nextStock
    }
    inventory.stock -= requested.quantity
  }

  const sale: SaleRecord = {
    id: saleId,
    createdAt: original?.createdAt ?? new Date().toISOString(),
    ...cashier,
    items: saleItems,
    total: productRevenue,
    itemCount: saleItems.reduce((sum, item) => sum + item.quantity, 0),
    productRevenue,
    totalCogs: hasIncompleteCogs ? null : totalCogs,
    grossProfit: hasIncompleteCogs ? null : productRevenue - totalCogs,
    packagingExpense,
    netProfit: hasIncompleteCogs ? null : productRevenue - totalCogs - packagingExpense,
  }

  return {
    ...data,
    products,
    batches,
    movements: [...data.movements, ...saleMovements],
    sales: [sale, ...data.sales],
  }
}

// Puts a sale's items back into stock and into the FIFO batches they were
// taken from, then removes the sale record.
export function revertSale(data: AppData, saleId: string, reason: string): AppData {
  const sale = data.sales.find((item) => item.id === saleId)
  if (!sale) throw new SaleError('This sale no longer exists.')

  const products = data.products.map((product) => ({ ...product }))
  const batches = data.batches.map((batch) => ({ ...batch }))
  const movements = []
  const label = `Sale #${saleId.slice(-6).toUpperCase()} ${reason}`

  for (const item of sale.items) {
    for (const allocation of item.batchAllocations ?? []) {
      const batch = batches.find((entry) => entry.id === allocation.batchId)
      if (batch) batch.remainingQuantity = Math.min(batch.quantityReceived, batch.remainingQuantity + allocation.quantity)
    }
    const product = products.find((entry) => entry.id === item.productId)
    if (!product) continue
    movements.push(createMovement(product.id, 'adjustment', item.quantity, product.stock, product.stock + item.quantity, { notes: label }))
    product.stock += item.quantity
  }

  return {
    ...data,
    products,
    batches,
    movements: [...data.movements, ...movements],
    sales: data.sales.filter((item) => item.id !== saleId),
  }
}

export function editSale(data: AppData, saleId: string, items: SaleRequestItem[], packagingExpense: number): AppData {
  const sale = data.sales.find((item) => item.id === saleId)
  if (!sale) throw new SaleError('This sale no longer exists.')
  const unitPrices = Object.fromEntries(sale.items.map((item) => [item.productId, item.unitPrice]))
  const reverted = revertSale(data, saleId, 'edited')
  // Firestore rejects undefined fields, so only copy the cashier when present.
  const cashier = {
    ...(sale.cashierUid !== undefined ? { cashierUid: sale.cashierUid } : {}),
    ...(sale.cashierEmail !== undefined ? { cashierEmail: sale.cashierEmail } : {}),
  }
  return applySale(reverted, items, packagingExpense, saleId, cashier, { createdAt: sale.createdAt, unitPrices })
}
