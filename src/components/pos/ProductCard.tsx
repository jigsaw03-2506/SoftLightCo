import { ImageOff } from 'lucide-react'

import type { CartItem, Product } from '../../types'
import { formatCurrency, getProductCategory } from '../../lib/utils'

type ProductCardProps = {
  product: Product
  cartItem?: CartItem
  onAddToCart: (product: Product) => void
}

export function ProductCard({ product, cartItem, onAddToCart }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0

  return (
    <button
      type="button"
      onClick={() => onAddToCart(product)}
      disabled={isOutOfStock}
      aria-label={`Add ${product.name} to cart`}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface text-left transition hover:border-blue-500 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
        cartItem ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200'
      }`}
    >
      {cartItem ? (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white shadow-sm">
          {cartItem.quantity}
        </span>
      ) : null}

      <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 sm:h-24">
        {product.image ? (
          <img src={product.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-5 w-5 text-slate-400" />
        )}
      </div>

      <div className="flex min-h-[66px] flex-1 flex-col justify-between gap-1 p-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold leading-4 text-slate-800">{product.name}</p>
          <p className="mt-0.5 truncate text-[9px] text-slate-400">{getProductCategory(product.category)}</p>
        </div>
        <div className="flex items-end justify-between gap-1">
          <span className="text-xs font-bold leading-4 text-slate-900">{formatCurrency(product.price)}</span>
          <span className={`shrink-0 text-[9px] leading-4 ${isOutOfStock ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
            {isOutOfStock ? 'Out of stock' : `${product.stock} in stock`}
          </span>
        </div>
      </div>
    </button>
  )
}
