import { useRef, useState } from 'react'
import { ImagePlus, PencilLine, Plus, Trash2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import type { Category, Product, ProductFormState } from '../types'
import { formatCurrency } from '../lib/utils'
import { getProductCategory } from '../lib/utils'
import { readFileAsDataUrl } from '../lib/storage'

type AddProductsPageProps = {
  products: Product[]
  categories: Category[]
  isAdmin: boolean
  onSaveProduct: (product: Product, isEditing: boolean, purchasePrice: number) => boolean
  onDeleteProduct: (productId: string) => void
  onShowToast: (message: string, type?: 'success' | 'error') => void
}

const emptyForm: ProductFormState = {
  name: '',
  categoryId: '',
  categoryName: '',
  purchasePrice: '',
  price: '',
  stock: '',
  description: '',
  image: '',
}

export function AddProductsPage({
  products,
  categories,
  isAdmin,
  onSaveProduct,
  onDeleteProduct,
  onShowToast,
}: AddProductsPageProps) {
  const [form, setForm] = useState<ProductFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setImageError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleInputChange = (field: keyof ProductFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(selectedFile)
      setForm((current) => ({ ...current, image: imageDataUrl }))
      setImageError('')
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not read the selected image.')
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = form.name.trim()
    const category = categories.find((item) => item.id === form.categoryId)
    const purchasePriceValue = Number(form.purchasePrice)
    const priceValue = Number(form.price)
    const stockValue = Number(form.stock)

    if (!isAdmin) {
      onShowToast('Switch to Admin mode to manage products.', 'error')
      return
    }

    if (!trimmedName) {
      onShowToast('Product name is required.', 'error')
      return
    }

    if (!category) {
      onShowToast('Product category is required.', 'error')
      return
    }

    if (form.price.trim() === '' || !Number.isFinite(priceValue) || priceValue < 0) {
      onShowToast('Selling price must be a non-negative number.', 'error')
      return
    }

    if (form.purchasePrice.trim() === '' || !Number.isFinite(purchasePriceValue) || purchasePriceValue < 0) {
      onShowToast('Purchase price must be a non-negative number.', 'error')
      return
    }

    if ((!editingId && form.stock.trim() === '') || (!editingId && (!Number.isInteger(stockValue) || stockValue < 0))) {
      onShowToast('Stock quantity must be a non-negative integer.', 'error')
      return
    }

    const productPayload: Product = {
      id: editingId ?? crypto.randomUUID(),
      name: trimmedName,
      categoryId: category.id,
      categoryName: category.name,
      purchasePrice: purchasePriceValue,
      price: priceValue,
      stock: editingId ? (products.find((item) => item.id === editingId)?.stock ?? stockValue) : stockValue,
      description: form.description.trim(),
      image: form.image,
      createdAt: editingId ? products.find((product) => product.id === editingId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(),
    }

    if (!onSaveProduct(productPayload, editingId !== null, purchasePriceValue)) {
      return
    }
    onShowToast(
      editingId ? 'Product updated successfully.' : 'Product added successfully.',
      'success',
    )
    resetForm()
  }

  const handleEdit = (product: Product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      categoryId: product.categoryId ?? categories.find((category) => category.name === getProductCategory(product.categoryName ?? product.category))?.id ?? '',
      categoryName: product.categoryName ?? getProductCategory(product.category),
      purchasePrice: product.purchasePrice === undefined ? '' : String(product.purchasePrice),
      price: String(product.price),
      stock: String(product.stock),
      description: product.description ?? '',
      image: product.image ?? '',
    })
    setImageError('')
  }

  const handleDelete = (productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) {
      return
    }

    const confirmed = window.confirm(`Delete ${product.name}? This will not change historical sales.`)
    if (!confirmed) {
      return
    }

    onDeleteProduct(productId)
    if (editingId === productId) {
      resetForm()
    }
    onShowToast('Product removed from inventory.', 'success')
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-sm font-semibold text-slate-800">{editingId ? 'Edit product' : 'Add Products'}</h1>
        <p className="mt-0.5 text-[10px] text-slate-500">New products appear on the Checkout screen right away.</p>
      </div>
      {!isAdmin ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Product management is available in Admin mode only. Switch from Staff to Admin in the top bar.
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[minmax(250px,0.55fr)_minmax(0,1fr)]">
      {isAdmin ? <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-sm">{editingId ? 'Edit product' : 'New product'}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 grid-cols-2">
              <div className="col-span-2 space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Product name
                </label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => handleInputChange('name', event.target.value)}
                  placeholder="e.g. LED Bulb 12W"
                  className="h-9 text-xs"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <label htmlFor="category" className="text-xs font-medium text-slate-700">Category <span className="text-red-500">*</span></label>
                <select
                  id="category"
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
                  required
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="purchase-price" className="text-xs font-medium text-slate-700">
                  Purchase price (Ks)
                </label>
                <Input
                  id="purchase-price"
                  type="number"
                  min="0"
                  step="any"
                  value={form.purchasePrice}
                  onChange={(event) => handleInputChange('purchasePrice', event.target.value)}
                  placeholder="2500"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="price" className="text-xs font-medium text-slate-700">
                  Selling price (Ks)
                </label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="any"
                  value={form.price}
                  onChange={(event) => handleInputChange('price', event.target.value)}
                  placeholder="3500"
                  required
                  className="h-9 text-xs"
                />
              </div>
              {!editingId ? <div className="col-span-2 space-y-1.5">
                <label htmlFor="stock" className="text-xs font-medium text-slate-700">Initial stock</label>
                <Input id="stock" type="number" min="0" step="1" value={form.stock} onChange={(event) => handleInputChange('stock', event.target.value)} placeholder="12" className="h-9 text-xs" required />
              </div> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="text-xs font-medium text-slate-700">
                Description
              </label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => handleInputChange('description', event.target.value)}
                placeholder="Optional product details"
                className="min-h-[68px] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Product photo <span className="text-slate-400">(Optional)</span></label>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-xs">{form.image ? 'Image selected' : 'Choose a product photo'}</span>
                  </div>
                  {form.image ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => handleInputChange('image', '')}>
                      Remove
                    </Button>
                  ) : null}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="mt-2 block w-full text-[10px] text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-[10px] file:font-medium file:text-slate-700 file:ring-1 file:ring-slate-200"
                />

                {form.image ? (
                  <img src={form.image} alt="Product preview" className="mt-3 h-28 w-full rounded-lg object-cover" />
                ) : null}
                {imageError ? <p className="mt-2 text-sm text-red-600">{imageError}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" className="h-10 w-full gap-2 bg-blue-700 text-xs hover:bg-blue-800">
                {editingId ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? 'Update product' : 'Add product'}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card> : null}

      <Card className={isAdmin ? '' : 'md:col-span-2'}>
        <CardHeader className="flex-row items-center justify-between p-4 pb-3">
          <CardTitle className="text-sm">Inventory ({products.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No products yet. Add the first item to begin selling.
              </div>
            ) : (
              products.map((product) => (
                <div key={product.id} className="flex items-center gap-2.5 border-b border-slate-100 py-2.5">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-500">{product.name.slice(0, 1)}</div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900">{product.name}</p>
                    <p className="text-[10px] text-slate-500">{product.categoryName ?? getProductCategory(product.category)} · Sell {formatCurrency(product.price)} · Buy {product.purchasePrice === undefined ? 'cost unknown' : formatCurrency(product.purchasePrice)} · {product.stock} in stock</p>
                  </div>

                  {isAdmin ? <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-[10px]" onClick={() => handleEdit(product)}>
                      Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1 border-red-200 px-2 text-[10px] text-red-600 hover:bg-red-50" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                  : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
