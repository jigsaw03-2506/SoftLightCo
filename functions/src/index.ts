import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()

type CartRequestItem = { productId: string; quantity: number }
type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('failed-precondition', 'The shop data is invalid.')
  }
  return value as RecordValue
}

function asArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new HttpsError('failed-precondition', 'The shop data is invalid.')
  return value as T[]
}

function makeCatalog(products: RecordValue[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.categoryName ?? product.category ?? 'Uncategorized',
    category: product.categoryName ?? product.category ?? 'Uncategorized',
    price: product.price,
    stock: product.stock,
    createdAt: product.createdAt,
    isActive: product.isActive !== false,
  }))
}

export const completeSale = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before completing a sale.')
  const caller = request.auth

  const payload = asRecord(request.data)
  const items = payload.items
  const packagingExpense = payload.packagingExpense
  const requestId = payload.requestId
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new HttpsError('invalid-argument', 'A valid checkout request identifier is required.')
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new HttpsError('invalid-argument', 'The cart must contain between 1 and 100 products.')
  }
  if (typeof packagingExpense !== 'number' || !Number.isFinite(packagingExpense) || packagingExpense < 0) {
    throw new HttpsError('invalid-argument', 'Packaging cost must be a non-negative amount.')
  }

  const requestedItems: CartRequestItem[] = items.map((item) => {
    const cartItem = asRecord(item)
    if (typeof cartItem.productId !== 'string' || !Number.isInteger(cartItem.quantity) || Number(cartItem.quantity) < 1) {
      throw new HttpsError('invalid-argument', 'The cart contains an invalid product or quantity.')
    }
    return { productId: cartItem.productId, quantity: Number(cartItem.quantity) }
  })
  const productIds = new Set(requestedItems.map((item) => item.productId))
  if (productIds.size !== requestedItems.length) {
    throw new HttpsError('invalid-argument', 'Each product can appear only once in the cart.')
  }

  const dataRef = db.doc('softlight-pos/main')
  const catalogRef = db.doc('checkout/catalog')
  const profileRef = db.doc(`users/${caller.uid}`)
  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, snapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(dataRef),
    ])
    const role = profileSnapshot.data()?.role
    if (!profileSnapshot.exists || (role !== 'owner' && role !== 'staff')) {
      throw new HttpsError('permission-denied', 'This account is not allowed to complete sales.')
    }
    if (!snapshot.exists) throw new HttpsError('failed-precondition', 'The owner must set up the shop data first.')
    const appData = asRecord(snapshot.data()?.appData)
    const movements = asArray<RecordValue>(appData.movements)
    const sales = asArray<RecordValue>(appData.sales)
    const previousAttempt = sales.find((sale) => sale.id === requestId)
    if (previousAttempt) {
      return { saleId: requestId, productRevenue: previousAttempt.productRevenue ?? previousAttempt.total }
    }
    const products = asArray<RecordValue>(appData.products).map((product) => ({ ...product }))
    const batches = asArray<RecordValue>(appData.batches).map((batch) => ({ ...batch }))
    const saleId = requestId
    const createdAt = new Date().toISOString()
    const saleItems: RecordValue[] = []
    const saleMovements: RecordValue[] = []
    let productRevenue = 0
    let totalCogs = 0
    let hasIncompleteCogs = false

    for (const requested of requestedItems) {
      const inventory = products.find((product) => product.id === requested.productId)
      if (!inventory || inventory.isActive === false || typeof inventory.stock !== 'number' ||
        !Number.isInteger(inventory.stock) || requested.quantity > inventory.stock ||
        typeof inventory.price !== 'number' || !Number.isFinite(inventory.price) || inventory.price < 0) {
        throw new HttpsError('failed-precondition', `Product ${requested.productId} is unavailable or out of stock.`)
      }

      let quantityRemaining = requested.quantity
      const availableBatches = batches
        .filter((batch) => batch.productId === requested.productId && typeof batch.remainingQuantity === 'number' && batch.remainingQuantity > 0)
        .sort((left, right) => String(left.receivedAt).localeCompare(String(right.receivedAt)) || String(left.createdAt).localeCompare(String(right.createdAt)))
      const batchQuantityAvailable = availableBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0)
      const costedAvailable = Math.min(batchQuantityAvailable, inventory.stock)
      const uncostedQuantity = Math.min(quantityRemaining, Math.max(0, inventory.stock - costedAvailable))
      quantityRemaining -= uncostedQuantity
      const allocations: RecordValue[] = []
      let lineCogs = 0

      for (const batch of availableBatches) {
        if (quantityRemaining <= 0) break
        const quantity = Math.min(quantityRemaining, Number(batch.remainingQuantity))
        const unitPurchaseCost = Number(batch.unitPurchaseCost)
        if (!Number.isFinite(unitPurchaseCost) || unitPurchaseCost < 0) {
          throw new HttpsError('failed-precondition', 'An inventory batch has an invalid cost.')
        }
        const totalCost = quantity * unitPurchaseCost
        batch.remainingQuantity = Number(batch.remainingQuantity) - quantity
        quantityRemaining -= quantity
        lineCogs += totalCost
        allocations.push({ batchId: batch.id, quantity, unitPurchaseCost, totalCost })
      }

      if (quantityRemaining > 0) throw new HttpsError('failed-precondition', 'Stock batches do not match the product stock.')
      const incomplete = uncostedQuantity > 0
      hasIncompleteCogs ||= incomplete
      const revenue = inventory.price * requested.quantity
      productRevenue += revenue
      totalCogs += lineCogs
      saleItems.push({
        productId: requested.productId,
        productName: inventory.name,
        categoryId: inventory.categoryId,
        categoryName: inventory.categoryName ?? inventory.category ?? 'Uncategorized',
        quantity: requested.quantity,
        unitPrice: inventory.price,
        subtotal: revenue,
        revenue,
        cogs: incomplete ? null : lineCogs,
        grossProfit: incomplete ? null : revenue - lineCogs,
        batchAllocations: allocations,
      })

      let remainingStock = Number(inventory.stock)
      if (uncostedQuantity > 0) {
        const nextStock = remainingStock - uncostedQuantity
        saleMovements.push({
          id: randomUUID(),
          productId: requested.productId,
          type: 'sale',
          quantityChange: -uncostedQuantity,
          previousStock: remainingStock,
          newStock: nextStock,
          createdAt,
          notes: `Sale ${saleId}; cost unavailable for opening stock`,
        })
        remainingStock = nextStock
      }
      for (const allocation of allocations) {
        const nextStock = remainingStock - Number(allocation.quantity)
        saleMovements.push({
          id: randomUUID(),
          productId: requested.productId,
          type: 'sale',
          quantityChange: -Number(allocation.quantity),
          previousStock: remainingStock,
          newStock: nextStock,
          batchId: allocation.batchId,
          unitPurchaseCost: allocation.unitPurchaseCost,
          createdAt,
          notes: `Sale ${saleId}`,
        })
        remainingStock = nextStock
      }
      inventory.stock = Number(inventory.stock) - requested.quantity
    }

    const sale = {
      id: saleId,
      createdAt,
      cashierUid: caller.uid,
      cashierEmail: caller.token.email ?? '',
      items: saleItems,
      total: productRevenue,
      itemCount: saleItems.reduce((sum, item) => sum + Number(item.quantity), 0),
      productRevenue,
      totalCogs: hasIncompleteCogs ? null : totalCogs,
      grossProfit: hasIncompleteCogs ? null : productRevenue - totalCogs,
      packagingExpense,
      netProfit: hasIncompleteCogs ? null : productRevenue - totalCogs - packagingExpense,
    }
    const nextData = {
      ...appData,
      products,
      batches,
      movements: [...movements, ...saleMovements],
      sales: [sale, ...sales],
    }
    transaction.set(dataRef, {
      appData: nextData,
      revision: Number(snapshot.data()?.revision ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.set(catalogRef, { products: makeCatalog(products), updatedAt: FieldValue.serverTimestamp() })
    return { saleId, productRevenue }
  })
})
