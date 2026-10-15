import { useState } from 'react'
import { Boxes, ClipboardList, PackagePlus, Pencil, Plus, Scale, Tags, Trash2, X } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import type { Category, InventoryBatch, InventoryMovement, Product } from '../types'
import { formatCurrency, formatDateTime } from '../lib/utils'

type InventoryPageProps = {
  products: Product[]
  categories: Category[]
  batches: InventoryBatch[]
  movements: InventoryMovement[]
  isAdmin: boolean
  lowStockThreshold: number
  onLowStockThresholdChange: (threshold: number) => boolean
  onDeleteProduct: (productId: string) => boolean
  onRestock: (productId: string, quantity: number, unitCost: number, receivedAt: string, supplier: string, notes: string) => boolean
  onAdjustStock: (productId: string, newStock: number, reason: string, unitCost: number | null) => boolean
  onEditBatch: (batch: InventoryBatch, updates: Pick<InventoryBatch, 'quantityReceived' | 'unitPurchaseCost' | 'receivedAt' | 'supplier' | 'notes'>) => boolean
  onAddCategory: (name: string) => boolean
  onRenameCategory: (categoryId: string, name: string) => boolean
  onDeleteCategory: (categoryId: string) => boolean
  onShowToast: (message: string, type?: 'success' | 'error') => void
}

type DialogState =
  | { kind: 'restock' | 'adjust'; product: Product }
  | { kind: 'history'; product: Product }
  | { kind: 'edit-batch'; product: Product; batch: InventoryBatch }
  | null

const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function InventoryPage({
  products,
  categories,
  batches,
  movements,
  isAdmin,
  lowStockThreshold,
  onLowStockThresholdChange,
  onDeleteProduct,
  onRestock,
  onAdjustStock,
  onEditBatch,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onShowToast,
}: InventoryPageProps) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [receivedAt, setReceivedAt] = useState(localToday())
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const beginDialog = (next: Exclude<DialogState, null>) => {
    setDialog(next)
    setQuantity('')
    setUnitCost('')
    setReceivedAt(localToday())
    setSupplier('')
    setNotes('')
  }

  const closeDialog = () => setDialog(null)

  const submitStockAction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog || !('product' in dialog) || !isAdmin) return
    const cost = Number(unitCost)
    const receivedDate = new Date(`${receivedAt}T12:00:00`).toISOString()
    let succeeded = false

    if (dialog.kind === 'restock') {
      const amount = Number(quantity)
      if (!Number.isInteger(amount) || amount <= 0) {
        onShowToast('Quantity to add must be a positive whole number.', 'error')
        return
      }
      if (!Number.isFinite(cost) || cost < 0) {
        onShowToast('Enter a valid non-negative purchase cost.', 'error')
        return
      }
      succeeded = onRestock(dialog.product.id, amount, cost, receivedDate, supplier, notes)
    } else {
      const newStock = Number(quantity)
      if (!Number.isInteger(newStock) || newStock < 0) {
        onShowToast('New stock must be a non-negative whole number.', 'error')
        return
      }
      if (!notes.trim()) {
        onShowToast('Enter the reason for this stock adjustment.', 'error')
        return
      }
      if (newStock > dialog.product.stock && (!Number.isFinite(cost) || cost < 0)) {
        onShowToast('Enter a valid non-negative purchase cost for added stock.', 'error')
        return
      }
      succeeded = onAdjustStock(dialog.product.id, newStock, notes, cost)
    }

    if (succeeded) {
      onShowToast(dialog.kind === 'restock' ? 'Stock replenished and batch recorded.' : 'Stock adjustment recorded.')
      closeDialog()
    }
  }

  const deleteProduct = (product: Product) => {
    if (!isAdmin) return
    if (!window.confirm(`Delete ${product.name} from inventory? Historical sales will be preserved.`)) return
    if (onDeleteProduct(product.id)) onShowToast('Product removed from inventory.')
  }

  const handleAddCategory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isAdmin) return
    if (onAddCategory(categoryName)) {
      setCategoryName('')
      onShowToast('Category added.')
    } else {
      onShowToast('Enter a unique category name.', 'error')
    }
  }

  const submitRenameCategory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingCategoryId) return
    if (onRenameCategory(editingCategoryId, editingCategoryName)) {
      setEditingCategoryId(null)
      onShowToast('Category renamed. Historical sale records are unchanged.')
    } else {
      onShowToast('Enter a unique category name.', 'error')
    }
  }

  const deleteCategory = (category: Category) => {
    const productCount = products.filter((product) => product.isActive !== false && product.categoryId === category.id).length
    if (productCount > 0) {
      onShowToast(`${category.name} is used by ${productCount} product${productCount === 1 ? '' : 's'}. Move them to another category first.`, 'error')
      return
    }
    if (!window.confirm(`Delete category ${category.name}? Historical sale records are unchanged.`)) return
    if (onDeleteCategory(category.id)) onShowToast('Category deleted.')
  }

  const submitBatchEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isAdmin || dialog?.kind !== 'edit-batch') return
    const quantityReceived = Number(quantity)
    const cost = Number(unitCost)
    if (!Number.isInteger(quantityReceived) || quantityReceived < 1 || !Number.isFinite(cost) || cost < 0) {
      onShowToast('Enter a valid whole quantity and non-negative cost.', 'error')
      return
    }
    if (onEditBatch(dialog.batch, {
      quantityReceived,
      unitPurchaseCost: cost,
      receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
      supplier,
      notes,
    })) {
      onShowToast('Stock batch updated.')
      setDialog({ kind: 'history', product: dialog.product })
    }
  }

  const productBatches = dialog && (dialog.kind === 'history' || dialog.kind === 'edit-batch') ? batches.filter((batch) => batch.productId === dialog.product.id) : []
  const productMovements = dialog?.kind === 'history' ? movements.filter((movement) => movement.productId === dialog.product.id) : []
  const activeProducts = products.filter((product) => product.isActive !== false)

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-sm font-semibold text-slate-800">Inventory management</h1>
        <p className="mt-0.5 text-[10px] text-slate-500">Stock batches, inventory value, movements, and product categories.</p>
      </header>

      {!isAdmin ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Inventory management is available in Admin mode only. Switch from Staff to Admin in the top bar.
        </div>
      ) : null}

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm"><Boxes className="h-4 w-4" />Inventory overview ({activeProducts.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isAdmin ? <div className="mb-3 flex items-center gap-2 text-[10px] text-slate-600"><label htmlFor="low-stock-threshold">Low-stock warning at</label><Input id="low-stock-threshold" type="number" min="0" step="1" value={lowStockThreshold} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0) onLowStockThresholdChange(value) }} className="h-8 w-20 text-xs" /><span>units</span></div> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {activeProducts.map((product) => {
              const stockTone = product.stock > 10
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : product.stock > 5
                  ? 'border-orange-200 bg-orange-50 text-orange-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              return (
                <article key={product.id} className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{product.categoryName ?? product.category ?? 'Uncategorized'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${stockTone}`} aria-label={`Stock ${product.stock}`}>
                      {product.stock} in stock
                    </span>
                  </div>
                  <p className="mb-3 text-[10px] text-slate-600">Selling price · {formatCurrency(product.price)}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {isAdmin ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[10px]" onClick={() => beginDialog({ kind: 'restock', product })}>
                        <PackagePlus className="h-3 w-3" /> Restock
                      </Button>
                    ) : null}
                    {isAdmin ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[10px]" onClick={() => beginDialog({ kind: 'adjust', product })}>
                        <Scale className="h-3 w-3" /> Adjust
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[10px]" onClick={() => setDialog({ kind: 'history', product })}>
                      <ClipboardList className="h-3 w-3" /> History
                    </Button>
                    {isAdmin ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 border-red-200 px-2 text-[10px] text-red-600 hover:bg-red-50" onClick={() => deleteProduct(product)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
            {activeProducts.length === 0 ? <p className="col-span-full rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No active inventory items.</p> : null}
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Tags className="h-4 w-4" />Category management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category name" className="h-9 max-w-sm text-xs" />
              <Button type="submit" size="sm" className="h-9 gap-1 bg-blue-700 text-xs hover:bg-blue-800"><Plus className="h-3.5 w-3.5" />Add</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1">
                  {editingCategoryId === category.id ? (
                    <form onSubmit={submitRenameCategory} className="flex gap-1">
                      <Input autoFocus value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} className="h-7 w-36 text-[10px]" />
                      <Button type="submit" size="sm" className="h-7 px-2 text-[10px]">Save</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <>
                      <span className="text-[10px] text-slate-700">{category.name}</span>
                      <button type="button" className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Rename ${category.name}`} onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name) }}><Pencil className="h-3 w-3" /></button>
                      <button type="button" className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${category.name}`} onClick={() => deleteCategory(category)}><Trash2 className="h-3 w-3" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
          <div role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 id="inventory-dialog-title" className="text-sm font-semibold text-slate-900">
                  {dialog.kind === 'history' ? `${dialog.product.name} history` : dialog.kind === 'restock' ? 'Restock product' : 'Adjust stock'}
                </h2>
                {dialog.kind === 'history' ? <p className="mt-1 text-[10px] text-slate-500">{dialog.product.categoryName ?? dialog.product.category ?? 'Uncategorized'}</p> : null}
                {dialog.kind !== 'history' ? <p className="mt-1 text-[10px] text-slate-500">{dialog.product.name} · Current stock {dialog.product.stock}</p> : null}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={closeDialog} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>

            {dialog.kind === 'history' ? (
              <div className="space-y-4">
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-slate-800">Purchase batches</h3>
                  {productBatches.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-[10px] text-amber-800">No cost batches recorded. Sales from this stock are recorded without a profit calculation.</p> : (
                    <div className="space-y-2">{productBatches.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((batch) => <div key={batch.id} className="rounded-lg border border-slate-200 p-2.5 text-[10px]"><div className="flex items-start justify-between gap-2"><div><div className="flex justify-between gap-2 font-medium"><span>{batch.openingStock ? 'Opening stock' : `${batch.quantityReceived} received`} · {formatDateTime(batch.receivedAt)}</span><span>{formatCurrency(batch.unitPurchaseCost)} / unit</span></div><p className="mt-1 text-slate-500">Remaining {batch.remainingQuantity} of {batch.quantityReceived} · Batch total {formatCurrency(batch.quantityReceived * batch.unitPurchaseCost)}</p>{batch.supplier ? <p className="text-slate-500">Supplier: {batch.supplier}</p> : null}{batch.notes ? <p className="text-slate-500">{batch.notes}</p> : null}</div>{isAdmin ? <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-[10px]" onClick={() => { setDialog({ kind: 'edit-batch', product: dialog.product, batch }); setQuantity(String(batch.quantityReceived)); setUnitCost(String(batch.unitPurchaseCost)); setReceivedAt(batch.receivedAt.slice(0, 10)); setSupplier(batch.supplier ?? ''); setNotes(batch.notes ?? '') }}><Pencil className="h-3 w-3" />Edit</Button> : null}</div></div>)}</div>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-slate-800">Stock movements</h3>
                  {productMovements.length === 0 ? <p className="text-[10px] text-slate-500">No movement history recorded.</p> : <div className="space-y-1.5">{productMovements.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((movement) => <div key={movement.id} className="flex justify-between gap-3 rounded bg-slate-50 p-2 text-[10px]"><span>{movement.type} · {movement.previousStock} → {movement.newStock}{movement.notes ? ` · ${movement.notes}` : ''}</span><span className="shrink-0 text-slate-500">{formatDateTime(movement.createdAt)}</span></div>)}</div>}
                </section>
              </div>
            ) : dialog.kind === 'edit-batch' ? (
              <form onSubmit={submitBatchEdit} className="space-y-3">
                {dialog.batch.remainingQuantity !== dialog.batch.quantityReceived ? <p className="rounded bg-amber-50 p-2 text-[10px] text-amber-800">Some units from this batch have already been sold. Quantity and purchase cost are locked to protect historical FIFO sale records. You may edit the received date, supplier, and notes.</p> : null}
                <div className="space-y-1"><label htmlFor="edit-batch-quantity" className="text-[10px] font-medium text-slate-700">Quantity received</label><Input id="edit-batch-quantity" type="number" min="1" step="1" required disabled={dialog.batch.remainingQuantity !== dialog.batch.quantityReceived} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-9 text-xs" /></div>
                <div className="space-y-1"><label htmlFor="edit-batch-cost" className="text-[10px] font-medium text-slate-700">Purchase cost per unit (Ks)</label><Input id="edit-batch-cost" type="number" min="0" step="any" required disabled={dialog.batch.remainingQuantity !== dialog.batch.quantityReceived} value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="h-9 text-xs" /></div>
                <div className="space-y-1"><label htmlFor="edit-batch-date" className="text-[10px] font-medium text-slate-700">Received date</label><Input id="edit-batch-date" type="date" required value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="h-9 text-xs" /></div>
                <div className="space-y-1"><label htmlFor="edit-batch-supplier" className="text-[10px] font-medium text-slate-700">Supplier</label><Input id="edit-batch-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-9 text-xs" /></div>
                <div className="space-y-1"><label htmlFor="edit-batch-notes" className="text-[10px] font-medium text-slate-700">Notes</label><textarea id="edit-batch-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:ring-2 focus:ring-slate-300" /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: 'history', product: dialog.product })}>Cancel</Button><Button type="submit" size="sm" className="bg-blue-700 hover:bg-blue-800">Save batch</Button></div>
              </form>
            ) : (
              <form onSubmit={submitStockAction} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="inventory-quantity" className="text-[10px] font-medium text-slate-700">{dialog.kind === 'restock' ? 'Quantity to add' : 'New available stock'}</label>
                  <Input id="inventory-quantity" type="number" min="0" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-9 text-xs" />
                </div>
                {dialog.kind === 'restock' || Number(quantity) > dialog.product.stock ? <div className="space-y-1">
                  <label htmlFor="inventory-cost" className="text-[10px] font-medium text-slate-700">Purchase cost per unit (Ks)</label>
                  <Input id="inventory-cost" type="number" min="0" step="any" required value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="h-9 text-xs" />
                </div> : null}
                {dialog.kind === 'restock' ? (
                  <>
                    <div className="space-y-1">
                      <label htmlFor="received-date" className="text-[10px] font-medium text-slate-700">Received date</label>
                      <Input id="received-date" type="date" required value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="h-9 text-xs" />
                    </div>
                    {dialog.kind === 'restock' ? <div className="space-y-1"><label htmlFor="supplier" className="text-[10px] font-medium text-slate-700">Supplier (optional)</label><Input id="supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-9 text-xs" /></div> : null}
                  </>
                ) : null}
                <div className="space-y-1">
                  <label htmlFor="stock-notes" className="text-[10px] font-medium text-slate-700">{dialog.kind === 'adjust' ? 'Reason for adjustment' : 'Notes (optional)'}</label>
                  <textarea id="stock-notes" required={dialog.kind === 'adjust'} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={closeDialog}>Cancel</Button>
                  <Button type="submit" size="sm" className="bg-blue-700 hover:bg-blue-800">{dialog.kind === 'restock' ? 'Record restock' : 'Save adjustment'}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
