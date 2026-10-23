import { useMemo, useState } from 'react'
import { Check, Search, Undo2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { isSaleUnpaid } from '../lib/sale'
import { cn, formatCurrency, formatDateTime } from '../lib/utils'
import type { SaleRecord } from '../types'

type PaymentsPageProps = {
  sales: SaleRecord[]
  onSetPaid: (saleId: string, paid: boolean) => boolean
}

type Tab = 'unpaid' | 'paid'

function getSaleAmount(sale: SaleRecord) {
  return sale.productRevenue ?? sale.total
}

// Counts calendar days, so an order from last night reads "Yesterday" this morning.
function daysSinceLabel(value: string) {
  const then = new Date(value)
  const now = new Date()
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86_400_000,
  )
  if (days <= 0) return 'Today'
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

const orderCount = (count: number) => `${count} ${count === 1 ? 'order' : 'orders'}`

export function PaymentsPage({ sales, onSetPaid }: PaymentsPageProps) {
  const [tab, setTab] = useState<Tab>('unpaid')
  const [search, setSearch] = useState('')

  // Oldest first: the customers who have owed the longest are the ones to chase.
  const unpaid = useMemo(() => sales.filter(isSaleUnpaid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [sales])
  // Walk-in sales without a name stay in Daily Sales; this list is about who has paid.
  const paid = useMemo(() => sales
    .filter((sale) => !isSaleUnpaid(sale) && sale.customerName)
    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt)), [sales])

  const query = search.trim().toLowerCase()
  const rows = (tab === 'unpaid' ? unpaid : paid).filter((sale) => !query || sale.customerName?.toLowerCase().includes(query))
  const rowsTotal = rows.reduce((sum, sale) => sum + getSaleAmount(sale), 0)
  const tabs = [
    { value: 'unpaid', label: 'Unpaid', count: unpaid.length },
    { value: 'paid', label: 'Paid', count: paid.length },
  ] as const

  return (
    // A narrow column keeps each customer's name close to the amount they owe.
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-sm font-semibold text-slate-800">Payments</h1>
          <p className="mt-0.5 text-xs text-slate-500">COD orders that are still owed, and customers who have paid.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer name"
            aria-label="Search customer name"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="inline-flex gap-0.5 rounded-full bg-slate-900/5 p-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-semibold transition',
              tab === item.value ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.label} · {item.count}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-0 p-4 pb-3">
          <p className="text-xs text-slate-500">{tab === 'unpaid' ? 'Still to collect' : 'Received'}</p>
          <p className={cn('text-2xl font-semibold tracking-tight', tab === 'unpaid' ? 'text-amber-700' : 'text-emerald-700')}>
            {formatCurrency(rowsTotal)}
          </p>
          <p className="text-xs text-slate-500">
            {orderCount(rows.length)}{query ? ` matching “${search.trim()}”` : ''}
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          {rows.length === 0 ? (
            <p className="mb-2 rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
              {query
                ? `No ${tab} order for a customer matching “${search.trim()}”.`
                : tab === 'unpaid'
                  ? 'No unpaid COD orders. Everyone has paid.'
                  : 'No paid orders with a customer name yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {rows.map((sale) => {
                const reference = `#${sale.id.slice(-6).toUpperCase()}`
                return (
                  <li key={sale.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{sale.customerName}</p>
                      <p className="text-xs text-slate-500">
                        {reference} · {formatDateTime(sale.createdAt)}
                        {tab === 'unpaid' ? ` · ${daysSinceLabel(sale.createdAt)}` : ''}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {sale.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                      </p>
                      {tab === 'paid' ? (
                        <p className="text-xs text-emerald-700">
                          {sale.paymentMethod === 'cod' && sale.paidAt ? `COD · received ${formatDateTime(sale.paidAt)}` : 'Paid at checkout'}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(getSaleAmount(sale))}</p>
                      {tab === 'unpaid' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSetPaid(sale.id, true)}
                          aria-label={`Mark ${reference} from ${sale.customerName} as paid`}
                          className="h-8 gap-1.5 text-xs font-semibold text-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />Mark paid
                        </Button>
                      ) : sale.paymentMethod === 'cod' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onSetPaid(sale.id, false)}
                          aria-label={`Move ${reference} from ${sale.customerName} back to unpaid`}
                          className="h-8 gap-1.5 text-xs font-semibold text-slate-500"
                        >
                          <Undo2 className="h-3.5 w-3.5" />Mark unpaid
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
