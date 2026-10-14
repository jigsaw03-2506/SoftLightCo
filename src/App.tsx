import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, Clock3, Menu, PackagePlus, ReceiptText, ShoppingCart, Store } from 'lucide-react'

import { AddProductsPage } from './pages/AddProductsPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { DailySalesPage } from './pages/DailySalesPage'
import { InventoryPage } from './pages/InventoryPage'
import { createBatch, createMovement, loadAdminMode, loadAppData, saveAdminMode, saveAppData } from './lib/storage'
import { formatCurrency } from './lib/utils'
import type { AppData, CartItem, Category, InventoryBatch, Product, SaleRecord } from './types'
import { Sheet, SheetContent, SheetTitle } from './components/ui/sheet'
import { createPortal } from 'react-dom'

type ToastState = {
  message: string
  type: 'success' | 'error'
}

function MobileCartShortcut({ cart }: { cart: CartItem[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  if (location.pathname === '/') return null

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.06)] md:hidden">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-slate-500">{itemCount} items in cart</p>
          <p className="text-sm font-bold leading-tight text-slate-900">{formatCurrency(total)}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/?showCart=1')}
          className="flex h-10 min-w-32 items-center justify-center gap-1.5 rounded-md bg-blue-700 px-4 text-xs font-medium text-white hover:bg-blue-800"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Cart / Checkout
          {itemCount > 0 ? (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-blue-700">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>
    </div>,
    document.body,
  )
}

function App() {
  const [data, setData] = useState<AppData>(() => loadAppData())
  const [isAdmin, setIsAdmin] = useState(() => loadAdminMode())
  const [cart, setCart] = useState<CartItem[]>([])
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const checkoutLock = useRef(false)

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const { products, sales, batches, movements, categories } = data

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 2600)
  }

  const commit = (next: AppData) => {
    try {
      saveAppData(next)
      setData(next)
      return true
    } catch (error) {
      console.error('Unable to save POS data to browser storage.', error)
      showToast('Could not save changes. Browser storage may be full.', 'error')
      return false
    }
  }

  const changeAdminMode = (nextMode: boolean) => {
    try {
      saveAdminMode(nextMode)
      setIsAdmin(nextMode)
      if (!nextMode) showToast('Staff mode enabled. Inventory controls are locked.')
      else showToast('Admin mode enabled.')
    } catch (error) {
      console.error('Unable to save the demo role setting.', error)
      showToast('Could not change mode in browser storage.', 'error')
    }
  }

  const addToCart = (product: Product) => {
    if (!product.isActive || product.stock <= 0) {
      showToast('This product is unavailable.', 'error')
      return
    }
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === product.id)
      if (existing && existing.quantity >= product.stock) {
        showToast('Not enough stock left for this item.', 'error')
        return currentCart
      }
      return existing
        ? currentCart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...currentCart, { ...product, quantity: 1 }]
    })
  }

  const onIncrease = (productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === productId)
      if (!existing) return currentCart
      if (existing.quantity >= product.stock) {
        showToast('Stock limit reached for this item.', 'error')
        return currentCart
      }
      return currentCart.map((item) => item.id === productId ? { ...item, quantity: item.quantity + 1 } : item)
    })
  }

  const onDecrease = (productId: string) => {
    setCart((currentCart) => currentCart.map((item) => item.id === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))
  }

  const onRemove = (productId: string) => setCart((currentCart) => currentCart.filter((item) => item.id !== productId))

  const onCheckout = (packagingExpense: number) => {
    if (checkoutLock.current) return false
    if (cart.length === 0) {
      showToast('Add at least one item before completing a sale.', 'error')
      return false
    }
    if (!Number.isFinite(packagingExpense) || packagingExpense < 0) {
      showToast('Packaging cost must be a non-negative amount.', 'error')
      return false
    }

    const invalid = cart.find((item) => {
      const product = products.find((candidate) => candidate.id === item.id)
      return !product?.isActive || !product || item.quantity > product.stock
    })
    if (invalid) {
      showToast('One or more items exceed the available stock.', 'error')
      return false
    }

    checkoutLock.current = true
    setIsProcessing(true)

    const updatedBatches = batches.map((batch) => ({ ...batch }))
    const newMovements = [...movements]
    const saleItems: SaleRecord['items'] = []
    const saleId = crypto.randomUUID()
    let productRevenue = 0
    let totalCogs = 0

    for (const item of cart) {
      let quantityRemaining = item.quantity
      const availableBatches = updatedBatches
        .filter((batch) => batch.productId === item.id && batch.remainingQuantity > 0)
        .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.createdAt.localeCompare(right.createdAt))
      const costedAvailable = availableBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0)
      if (costedAvailable < quantityRemaining) {
        setIsProcessing(false)
        checkoutLock.current = false
        showToast(`Cost the opening stock for ${item.name} before selling it.`, 'error')
        return false
      }

      const allocations = []
      let lineCogs = 0
      for (const batch of availableBatches) {
        if (quantityRemaining <= 0) break
        const allocationQuantity = Math.min(quantityRemaining, batch.remainingQuantity)
        const cost = allocationQuantity * batch.unitPurchaseCost
        batch.remainingQuantity -= allocationQuantity
        quantityRemaining -= allocationQuantity
        lineCogs += cost
        allocations.push({
          batchId: batch.id,
          quantity: allocationQuantity,
          unitPurchaseCost: batch.unitPurchaseCost,
          totalCost: cost,
        })
      }

      const revenue = item.price * item.quantity
      productRevenue += revenue
      totalCogs += lineCogs
      saleItems.push({
        productId: item.id,
        productName: item.name,
        categoryId: item.categoryId,
        categoryName: item.categoryName ?? item.category ?? 'Uncategorized',
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: revenue,
        revenue,
        cogs: lineCogs,
        grossProfit: revenue - lineCogs,
        batchAllocations: allocations,
      })

      const inventory = products.find((candidate) => candidate.id === item.id)
      if (inventory) {
        let movementStock = inventory.stock
        for (const allocation of allocations) {
          const nextStock = movementStock - allocation.quantity
          newMovements.push(createMovement(item.id, 'sale', -allocation.quantity, movementStock, nextStock, {
            batchId: allocation.batchId,
            unitPurchaseCost: allocation.unitPurchaseCost,
            notes: `Sale ${saleId}`,
          }))
          movementStock = nextStock
        }
      }
    }

    const sale: SaleRecord = {
      id: saleId,
      createdAt: new Date().toISOString(),
      items: saleItems,
      total: productRevenue,
      itemCount: saleItems.reduce((sum, item) => sum + item.quantity, 0),
      productRevenue,
      totalCogs,
      grossProfit: productRevenue - totalCogs,
      packagingExpense,
      netProfit: productRevenue - totalCogs - packagingExpense,
    }

    const nextData: AppData = {
      ...data,
      batches: updatedBatches,
      movements: newMovements,
      sales: [sale, ...sales],
      products: products.map((product) => {
        const sold = cart.find((item) => item.id === product.id)
        return sold ? { ...product, stock: product.stock - sold.quantity } : product
      }),
    }
    const saved = commit(nextData)
    if (saved) {
      setCart([])
      showToast(`Sale complete. ${formatCurrency(productRevenue)} product revenue recorded.`)
    }
    setIsProcessing(false)
    checkoutLock.current = false
    return saved
  }

  const saveProduct = (product: Product, isEditing: boolean, purchasePrice: number) => {
    if (!isAdmin) {
      showToast('Switch to Admin mode to manage products.', 'error')
      return false
    }
    if (isEditing) {
      const next = {
        ...data,
        products: products.map((current) => current.id === product.id ? { ...product, purchasePrice, isActive: true } : current),
      }
      const saved = commit(next)
      if (saved) setCart((items) => items.map((item) => item.id === product.id ? { ...product, purchasePrice, quantity: item.quantity } : item))
      return saved
    }
    const initialBatch = product.stock > 0 ? createBatch(product.id, product.stock, purchasePrice, product.createdAt, '', 'Initial stock') : null
    const next = {
      ...data,
      products: [{ ...product, purchasePrice, isActive: true }, ...products],
      batches: initialBatch ? [...batches, initialBatch] : batches,
      movements: initialBatch
        ? [...movements, createMovement(product.id, 'restock', product.stock, 0, product.stock, { batchId: initialBatch.id, unitPurchaseCost: purchasePrice, notes: 'Initial stock' })]
        : movements,
    }
    return commit(next)
  }

  const deleteProduct = (productId: string) => {
    if (!isAdmin) {
      showToast('Switch to Admin mode to manage products.', 'error')
      return
    }
    const next = { ...data, products: products.map((product) => product.id === productId ? { ...product, isActive: false } : product) }
    if (commit(next)) setCart((items) => items.filter((item) => item.id !== productId))
  }

  const restock = (productId: string, quantity: number, unitCost: number, receivedAt: string, supplier: string, notes: string) => {
    if (!isAdmin) return false
    const product = products.find((item) => item.id === productId)
    if (!product || !product.isActive || !Number.isInteger(quantity) || quantity <= 0 || unitCost < 0) {
      showToast('Invalid restock details.', 'error')
      return false
    }
    const batch = createBatch(productId, quantity, unitCost, receivedAt, supplier, notes)
    return commit({
      ...data,
      products: products.map((item) => item.id === productId ? { ...item, stock: item.stock + quantity, purchasePrice: unitCost } : item),
      batches: [...batches, batch],
      movements: [...movements, createMovement(productId, 'restock', quantity, product.stock, product.stock + quantity, { batchId: batch.id, unitPurchaseCost: unitCost, notes })],
    })
  }

  const setOpeningCost = (productId: string, unitCost: number, receivedAt: string, notes: string) => {
    if (!isAdmin) return false
    const product = products.find((item) => item.id === productId)
    if (!product || product.stock <= 0 || unitCost < 0) return false
    const recorded = batches.filter((batch) => batch.productId === productId).reduce((sum, batch) => sum + batch.remainingQuantity, 0)
    const uncosted = product.stock - recorded
    if (uncosted <= 0) {
      showToast('All current stock already has a recorded cost.', 'error')
      return false
    }
    const batch = createBatch(productId, uncosted, unitCost, receivedAt, '', notes || 'Opening stock cost assigned', true)
    return commit({
      ...data,
      products: products.map((item) => item.id === productId ? { ...item, purchasePrice: unitCost } : item),
      batches: [...batches, batch],
      movements: [...movements, createMovement(productId, 'opening-cost', 0, product.stock, product.stock, { batchId: batch.id, unitPurchaseCost: unitCost, notes: notes || 'Opening stock cost assigned' })],
    })
  }

  const adjustStock = (productId: string, newStock: number, reason: string, unitCost: number | null) => {
    if (!isAdmin) return false
    const product = products.find((item) => item.id === productId)
    if (!product || !Number.isInteger(newStock) || newStock < 0 || !reason.trim()) return false
    const difference = newStock - product.stock
    let nextBatches: InventoryBatch[] = batches.map((batch) => ({ ...batch }))
    let newBatch: InventoryBatch | null = null
    if (difference > 0) {
      if (unitCost === null || unitCost < 0) {
        showToast('A purchase cost is required when an adjustment increases stock.', 'error')
        return false
      }
      newBatch = createBatch(productId, difference, unitCost, new Date().toISOString(), '', `Adjustment: ${reason}`)
      nextBatches = [...nextBatches, newBatch]
    } else if (difference < 0) {
      let removal = -difference
      const costed = nextBatches.filter((batch) => batch.productId === productId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      const uncosted = Math.max(0, product.stock - costed.reduce((sum, batch) => sum + batch.remainingQuantity, 0))
      removal = Math.max(0, removal - Math.min(removal, uncosted))
      for (const batch of costed) {
        if (removal <= 0) break
        const amount = Math.min(removal, batch.remainingQuantity)
        batch.remainingQuantity -= amount
        removal -= amount
      }
      if (removal > 0) {
        showToast('Adjustment exceeds available batch quantities. Review inventory history first.', 'error')
        return false
      }
    }
    return commit({
      ...data,
      products: products.map((item) => item.id === productId ? { ...item, stock: newStock, ...(difference > 0 && unitCost !== null ? { purchasePrice: unitCost } : {}) } : item),
      batches: nextBatches,
      movements: [...movements, createMovement(productId, 'adjustment', difference, product.stock, newStock, { batchId: newBatch?.id, unitPurchaseCost: newBatch?.unitPurchaseCost, notes: reason.trim() })],
    })
  }

  const editBatch = (
    originalBatch: InventoryBatch,
    updates: Pick<InventoryBatch, 'quantityReceived' | 'unitPurchaseCost' | 'receivedAt' | 'supplier' | 'notes'>,
  ) => {
    if (!isAdmin) return false
    const batch = batches.find((item) => item.id === originalBatch.id)
    const product = products.find((item) => item.id === originalBatch.productId)
    if (!batch || !product || updates.quantityReceived < 1 || updates.unitPurchaseCost < 0) {
      showToast('This batch can no longer be edited.', 'error')
      return false
    }
    const hasBeenConsumed = batch.remainingQuantity !== batch.quantityReceived
    if (hasBeenConsumed && (
      updates.quantityReceived !== batch.quantityReceived ||
      updates.unitPurchaseCost !== batch.unitPurchaseCost
    )) {
      showToast('Quantity and cost are locked after a batch has been sold.', 'error')
      return false
    }
    const stockDifference = hasBeenConsumed ? 0 : updates.quantityReceived - batch.quantityReceived
    const nextBatch = {
      ...batch,
      ...updates,
      remainingQuantity: hasBeenConsumed ? batch.remainingQuantity : updates.quantityReceived,
    }
    const batchWasEdited =
      updates.quantityReceived !== batch.quantityReceived ||
      updates.unitPurchaseCost !== batch.unitPurchaseCost ||
      updates.receivedAt !== batch.receivedAt ||
      updates.supplier !== batch.supplier ||
      updates.notes !== batch.notes
    return commit({
      ...data,
      batches: batches.map((item) => item.id === batch.id ? nextBatch : item),
      products: stockDifference === 0 ? products : products.map((item) => item.id === product.id ? { ...item, stock: item.stock + stockDifference } : item),
      movements: batchWasEdited
        ? [...movements, createMovement(product.id, 'adjustment', stockDifference, product.stock, product.stock + stockDifference, { batchId: batch.id, unitPurchaseCost: updates.unitPurchaseCost, notes: stockDifference === 0 ? 'Batch record edited' : 'Unsold batch quantity corrected' })]
        : movements,
    })
  }

  const changeLowStockThreshold = (threshold: number) => {
    if (!isAdmin || !Number.isInteger(threshold) || threshold < 0) return false
    return commit({ ...data, lowStockThreshold: threshold })
  }

  const addCategory = (name: string) => {
    if (!isAdmin || !name.trim() || categories.some((category) => category.name.toLowerCase() === name.trim().toLowerCase())) return false
    const category: Category = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() }
    return commit({ ...data, categories: [...categories, category] })
  }

  const renameCategory = (categoryId: string, name: string) => {
    if (!isAdmin || !name.trim() || categories.some((category) => category.id !== categoryId && category.name.toLowerCase() === name.trim().toLowerCase())) return false
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return false
    return commit({
      ...data,
      categories: categories.map((item) => item.id === categoryId ? { ...item, name: name.trim() } : item),
      products: products.map((product) => product.categoryId === categoryId ? { ...product, categoryName: name.trim() } : product),
    })
  }

  const navItems = [
    { label: 'Checkout', to: '/', icon: ShoppingCart },
    { label: 'Add Products', to: '/products', icon: PackagePlus },
    { label: 'Inventory', to: '/inventory', icon: Boxes },
    { label: 'Daily Sales', to: '/sales', icon: ReceiptText },
  ]
  const formattedDate = currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const formattedTime = currentTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  return (
    <BrowserRouter>
      <div className="min-h-dvh overflow-visible bg-[#f3f5f7] text-slate-900">
        <div className="mx-auto min-h-dvh max-w-[1440px] px-3 py-3 pb-0 sm:px-5 sm:py-5 sm:pb-5">
          <div className="min-h-[calc(100dvh-1.5rem)] overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm sm:min-h-[calc(100dvh-2.5rem)]">
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-amber-950"><Store className="h-4 w-4" /></div>
                <div><p className="text-sm font-bold leading-tight text-slate-900">SoftLight Co.</p><p className="text-[10px] leading-tight text-slate-500">Point of Sale</p></div>
              </div>
              <div className="flex items-center justify-end gap-2 md:hidden">
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-medium text-slate-700">{formattedDate}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <Clock3 className="h-3 w-3" />{formattedTime}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  onClick={() => setIsNavigationOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </div>
              <nav className="hidden justify-center gap-1 rounded-lg bg-slate-100 p-1 md:flex">
                {navItems.map(({ label, to, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-[10px] font-medium transition lg:px-3 lg:text-xs ${isActive ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>
                    <Icon className="h-3.5 w-3.5" />{label}
                  </NavLink>
                ))}
              </nav>
              <div className="hidden items-center justify-end gap-3 md:flex">
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-medium text-slate-700">{formattedDate}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <Clock3 className="h-3 w-3" />{formattedTime}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                  <span className={`text-[10px] font-semibold ${isAdmin ? 'text-amber-700' : 'text-slate-500'}`}>{isAdmin ? 'Admin' : 'Staff'} mode</span>
                  <button type="button" role="switch" aria-checked={isAdmin} aria-label="Toggle Admin mode" onClick={() => changeAdminMode(!isAdmin)} className={`relative h-5 w-9 rounded-full transition ${isAdmin ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${isAdmin ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-[1320px] px-3 py-4 pb-24 sm:px-5 sm:py-5 md:pb-5">
              <Routes>
                <Route path="/" element={<CheckoutPage products={products.filter((product) => product.isActive !== false)} cart={cart} onAddToCart={addToCart} onIncrease={onIncrease} onDecrease={onDecrease} onRemove={onRemove} onClearCart={() => setCart([])} onCheckout={onCheckout} isProcessing={isProcessing} />} />
                <Route path="/products" element={<AddProductsPage products={products.filter((product) => product.isActive !== false)} categories={categories} isAdmin={isAdmin} onSaveProduct={saveProduct} onDeleteProduct={deleteProduct} onShowToast={showToast} />} />
                <Route path="/inventory" element={<InventoryPage products={products} categories={categories} batches={batches} movements={movements} isAdmin={isAdmin} lowStockThreshold={data.lowStockThreshold} onLowStockThresholdChange={changeLowStockThreshold} onRestock={restock} onSetOpeningCost={setOpeningCost} onAdjustStock={adjustStock} onEditBatch={editBatch} onAddCategory={addCategory} onRenameCategory={renameCategory} onShowToast={showToast} />} />
                <Route path="/sales" element={<DailySalesPage sales={sales} />} />
              </Routes>
            </main>
          </div>
        </div>
        <Sheet open={isNavigationOpen} onOpenChange={setIsNavigationOpen}>
          <SheetContent className="max-w-xs p-4">
            <SheetTitle className="mb-4 pr-8 text-base font-semibold text-slate-900">SoftLight Co. menu</SheetTitle>
            <nav className="flex flex-col gap-1">
              {navItems.map(({ label, to, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsNavigationOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="h-4 w-4" />{label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3">
              <span className={`text-xs font-semibold ${isAdmin ? 'text-amber-700' : 'text-slate-500'}`}>{isAdmin ? 'Admin' : 'Staff'} mode</span>
              <button type="button" role="switch" aria-checked={isAdmin} aria-label="Toggle Admin mode" onClick={() => changeAdminMode(!isAdmin)} className={`relative h-6 w-10 rounded-full transition ${isAdmin ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${isAdmin ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
          </SheetContent>
        </Sheet>
        <MobileCartShortcut cart={cart} />
        <div className="fixed bottom-2 left-2 z-30 hidden max-w-xs text-[9px] text-slate-400 md:block">Demo mode only. Browser-side roles are not secure authentication.</div>
        {toast ? <div className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">{toast.message}</div> : null}
      </div>
    </BrowserRouter>
  )
}

export default App
