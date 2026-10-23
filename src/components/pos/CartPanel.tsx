import { useId } from 'react'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { CartItem, PaymentMethod } from '../../types'
import { formatCurrency, isAmountInput } from '../../lib/utils'
import { cn } from '../../lib/utils'

const paymentOptions: { value: PaymentMethod; label: string }[] = [
  { value: 'paid', label: 'Paid' },
  { value: 'cod', label: 'COD' },
]

type CartPanelProps = {
  className?: string
  items: CartItem[]
  onDecrease: (productId: string) => void
  onIncrease: (productId: string) => void
  onRemove: (productId: string) => void
  onClearCart: () => void
  onCheckout: () => void
  isProcessing: boolean
  packagingExpense: string
  onPackagingExpenseChange: (value: string) => void
  paymentMethod: PaymentMethod
  onPaymentMethodChange: (value: PaymentMethod) => void
  customerName: string
  onCustomerNameChange: (value: string) => void
}

export function CartPanel({
  className,
  items,
  onDecrease,
  onIncrease,
  onRemove,
  onClearCart,
  onCheckout,
  isProcessing,
  packagingExpense,
  onPackagingExpenseChange,
  paymentMethod,
  onPaymentMethodChange,
  customerName,
  onCustomerNameChange,
}: CartPanelProps) {
  const grandTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  // The panel renders twice on phones (sidebar and sheet), so ids must be unique per copy.
  const fieldId = useId()
  const needsCustomerName = paymentMethod === 'cod' && !customerName.trim()

  return (
    <section className={cn('glass flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-blue-700" />
          <h2 className="text-sm font-semibold text-slate-800">Cart</h2>
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearCart}
          disabled={items.length === 0}
          className="text-[10px] font-medium text-slate-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear cart
        </button>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
            <ShoppingBag className="mb-2 h-6 w-6 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">Your cart is empty</p>
            <p className="mt-1 text-[10px] text-slate-400">Choose a product to start a sale.</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-800">{item.name}</p>
                  <p className="text-[9px] text-slate-500">
                    {formatCurrency(item.price)} × {item.quantity}
                  </p>
                </div>
                <p className="shrink-0 text-[11px] font-bold text-slate-800">
                  {formatCurrency(item.price * item.quantity)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={() => onDecrease(item.id)}
                    aria-label={`Decrease quantity of ${item.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="min-w-5 text-center text-xs font-semibold text-slate-800">{item.quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={() => onIncrease(item.id)}
                    aria-label={`Increase quantity of ${item.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-red-200 px-2 text-[10px] text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t-2 border-slate-300 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span id={`${fieldId}-payment`} className="text-2xs font-medium text-slate-600">Payment</span>
          <div role="group" aria-labelledby={`${fieldId}-payment`} className="flex w-40 gap-0.5 rounded-full bg-slate-900/5 p-0.5">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={paymentMethod === option.value}
                onClick={() => onPaymentMethodChange(option.value)}
                className={cn(
                  'h-7 flex-1 rounded-full px-3 text-2xs font-medium transition',
                  paymentMethod === option.value ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor={`${fieldId}-customer`} className="text-2xs font-medium text-slate-600">Customer</label>
          <Input
            id={`${fieldId}-customer`}
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder={paymentMethod === 'cod' ? 'Required for COD' : 'Optional'}
            required={paymentMethod === 'cod'}
            autoComplete="off"
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor={`${fieldId}-packaging`} className="text-2xs font-medium text-slate-600">Packaging (Ks)</label>
          <Input
            id={`${fieldId}-packaging`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={packagingExpense}
            onChange={(event) => { if (isAmountInput(event.target.value)) onPackagingExpenseChange(event.target.value) }}
            className="h-8 w-40 text-right text-xs"
          />
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-medium text-slate-500">Total</span>
          <span className="text-lg font-bold leading-none text-slate-900">{formatCurrency(grandTotal)}</span>
        </div>
        <Button
          type="button"
          className="h-10 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
          onClick={onCheckout}
          disabled={items.length === 0 || isProcessing || needsCustomerName}
        >
          {isProcessing ? 'Processing...' : paymentMethod === 'cod' ? 'Complete COD Sale' : 'Complete Sale'}
        </Button>
      </div>
    </section>
  )
}
