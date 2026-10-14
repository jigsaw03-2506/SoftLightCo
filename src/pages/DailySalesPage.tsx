import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ReceiptText } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import type { SaleItem, SaleRecord } from '../types'
import { formatCurrency, formatDateOnly, formatDateTime } from '../lib/utils'

type DailySalesPageProps = {
  sales: SaleRecord[]
}

type ReportLine = {
  productId: string
  productName: string
  categoryName: string
  quantity: number
  revenue: number
  cogs: number | null
}

const dateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = dateString(new Date())
const yesterdayDate = new Date()
yesterdayDate.setDate(yesterdayDate.getDate() - 1)
const yesterday = dateString(yesterdayDate)

function getSaleRevenue(sale: SaleRecord) {
  return sale.productRevenue ?? sale.total
}

function getItemRevenue(item: SaleItem) {
  return item.revenue ?? item.subtotal
}

function getSaleCogs(sale: SaleRecord): number | null {
  if (sale.totalCogs !== undefined) return sale.totalCogs
  if (sale.items.some((item) => item.cogs === null || item.cogs === undefined)) return null
  return sale.items.reduce((sum, item) => sum + (item.cogs ?? 0), 0)
}

export function DailySalesPage({ sales }: DailySalesPageProps) {
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom' | 'range'>('today')
  const [customDate, setCustomDate] = useState(today)
  const [rangeStart, setRangeStart] = useState(today)
  const [rangeEnd, setRangeEnd] = useState(today)
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'profit'>('revenue')
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  const filteredSales = useMemo(() => sales
    .filter((sale) => {
      const date = formatDateOnly(sale.createdAt)
      if (dateMode === 'today') return date === today
      if (dateMode === 'yesterday') return date === yesterday
      if (dateMode === 'custom') return date === customDate
      return date >= rangeStart && date <= rangeEnd
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sales, dateMode, customDate, rangeStart, rangeEnd])

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + getSaleRevenue(sale), 0)
  const totalUnits = filteredSales.reduce((sum, sale) => sum + sale.itemCount, 0)
  const packagingTotal = filteredSales.reduce((sum, sale) => sum + (sale.packagingExpense ?? 0), 0)
  const cogsIncomplete = filteredSales.some((sale) => getSaleCogs(sale) === null)
  const totalCogs = cogsIncomplete ? null : filteredSales.reduce((sum, sale) => sum + (getSaleCogs(sale) ?? 0), 0)
  const grossProfit = totalCogs === null ? null : totalRevenue - totalCogs
  const netProfit = grossProfit === null ? null : grossProfit - packagingTotal

  const reportLines = useMemo(() => {
    const lines = new Map<string, ReportLine>()
    for (const sale of filteredSales) {
      for (const item of sale.items) {
        const key = `${item.productId}\u0000${item.productName}\u0000${item.categoryName ?? 'Category unavailable'}`
        const current = lines.get(key)
        const itemCogs = item.cogs === undefined ? null : item.cogs
        if (current) {
          current.quantity += item.quantity
          current.revenue += getItemRevenue(item)
          current.cogs = current.cogs === null || itemCogs === null ? null : current.cogs + itemCogs
        } else {
          lines.set(key, {
            productId: item.productId,
            productName: item.productName,
            categoryName: item.categoryName ?? 'Category unavailable',
            quantity: item.quantity,
            revenue: getItemRevenue(item),
            cogs: itemCogs,
          })
        }
      }
    }
    return [...lines.values()]
  }, [filteredSales])

  const categories = useMemo(() => {
    const groups = new Map<string, ReportLine[]>()
    for (const line of reportLines) groups.set(line.categoryName, [...(groups.get(line.categoryName) ?? []), line])
    return [...groups.entries()].map(([name, lines]) => ({
      name,
      lines: lines.sort((a, b) => {
        if (sortBy === 'quantity') return b.quantity - a.quantity
        if (sortBy === 'profit') return (b.cogs === null ? -Infinity : b.revenue - b.cogs) - (a.cogs === null ? -Infinity : a.revenue - a.cogs)
        return b.revenue - a.revenue
      }),
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      revenue: lines.reduce((sum, line) => sum + line.revenue, 0),
      cogs: lines.some((line) => line.cogs === null) ? null : lines.reduce((sum, line) => sum + (line.cogs ?? 0), 0),
    })).sort((a, b) => {
      if (sortBy === 'quantity') return b.quantity - a.quantity
      if (sortBy === 'profit') return (b.cogs === null ? -Infinity : b.revenue - b.cogs) - (a.cogs === null ? -Infinity : a.revenue - a.cogs)
      return b.revenue - a.revenue
    })
  }, [reportLines, sortBy])

  const bestSellers = [...reportLines].sort((a, b) => {
    if (sortBy === 'quantity') return b.quantity - a.quantity
    if (sortBy === 'profit') return (b.cogs === null ? -Infinity : b.revenue - b.cogs) - (a.cogs === null ? -Infinity : a.revenue - a.cogs)
    return b.revenue - a.revenue
  }).slice(0, 5)

  const toggleCategory = (name: string) => setExpandedCategories((current) =>
    current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
  )

  const profitLabel = (value: number | null) => value === null ? 'Incomplete' : formatCurrency(value)

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-sm font-semibold text-slate-800">Sales & profit report</h1>
          <p className="mt-0.5 text-[10px] text-slate-500">Revenue, FIFO costs, packaging expenses, and product performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
            {(['today', 'yesterday', 'custom', 'range'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setDateMode(mode)} className={`rounded px-2 py-1.5 text-[10px] font-medium capitalize ${dateMode === mode ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{mode}</button>
            ))}
          </div>
          {dateMode === 'custom' ? <Input aria-label="Select report date" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="h-9 w-36 text-xs" /> : null}
          {dateMode === 'range' ? <div className="flex items-center gap-1"><Input aria-label="Range start" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="h-9 w-36 text-xs" /><span className="text-xs text-slate-400">to</span><Input aria-label="Range end" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="h-9 w-36 text-xs" /></div> : null}
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {[
          { label: 'Product revenue', value: formatCurrency(totalRevenue), tone: 'text-emerald-700' },
          { label: 'Orders', value: String(filteredSales.length), tone: 'text-slate-900' },
          { label: 'Units sold', value: String(totalUnits), tone: 'text-slate-900' },
          { label: 'COGS (FIFO)', value: totalCogs === null ? 'Incomplete' : formatCurrency(totalCogs), tone: 'text-slate-900' },
          { label: 'Packaging', value: formatCurrency(packagingTotal), tone: 'text-amber-700' },
          { label: 'Gross profit', value: profitLabel(grossProfit), tone: 'text-blue-700' },
          { label: 'Net profit', value: profitLabel(netProfit), tone: 'text-violet-700' },
        ].map((metric) => (
          <Card key={metric.label}><CardContent className="p-3"><p className="text-[9px] text-slate-500">{metric.label}</p><p className={`mt-1 text-sm font-bold ${metric.tone}`}>{metric.value}</p></CardContent></Card>
        ))}
      </div>

      {cogsIncomplete && filteredSales.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900">
          Some historical sales predate batch costing. Their revenue is included, but profit is marked incomplete instead of estimating cost.
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <CardTitle className="text-sm">Sales by Category</CardTitle>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700">
              <option value="revenue">Revenue</option><option value="quantity">Quantity sold</option><option value="profit">Profit</option>
            </select>
          </label>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {categories.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">No sales in the selected period.</p> : (
            <div className="space-y-2">
              {categories.map((category) => {
                const expanded = expandedCategories.includes(category.name)
                return (
                  <section key={category.name} className="overflow-hidden rounded-lg border border-slate-200">
                    <button type="button" onClick={() => toggleCategory(category.name)} className="flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 text-left">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{category.name} <Badge>{category.quantity} units</Badge></span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span>Revenue <b>{formatCurrency(category.revenue)}</b></span><span>COGS <b>{category.cogs === null ? 'Incomplete' : formatCurrency(category.cogs)}</b></span><span className="text-blue-700">Gross profit <b>{category.cogs === null ? 'Incomplete' : formatCurrency(category.revenue - category.cogs)}</b></span></span>
                    </button>
                    {expanded ? <div className="divide-y divide-slate-100">
                      {category.lines.map((line) => <div key={`${line.productId}-${line.productName}`} className="grid grid-cols-2 gap-2 px-3 py-2 text-[10px] sm:grid-cols-5">
                        <span className="font-medium text-slate-800">{line.productName}</span><span className="text-slate-500">{line.quantity} units</span><span>Revenue {formatCurrency(line.revenue)}</span><span>COGS {line.cogs === null ? 'Incomplete' : formatCurrency(line.cogs)}</span><span className="font-semibold text-blue-700">Profit {line.cogs === null ? 'Incomplete' : formatCurrency(line.revenue - line.cogs)}</span>
                      </div>)}
                    </div> : null}
                  </section>
                )
              })}
              <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-900 p-3 text-[10px] text-white">
                <b>Grand total · {totalUnits} units</b><span>Revenue {formatCurrency(totalRevenue)} · COGS {totalCogs === null ? 'Incomplete' : formatCurrency(totalCogs)} · Gross profit {profitLabel(grossProfit)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="p-4 pb-3"><CardTitle className="text-sm">Best-selling products</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {bestSellers.length === 0 ? <p className="text-xs text-slate-500">No product sales in this period.</p> : <div className="space-y-2">{bestSellers.map((line) => <div key={`${line.productId}-${line.productName}`} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[10px]"><div><p className="font-semibold text-slate-800">{line.productName}</p><p className="text-slate-500">{line.categoryName} · {line.quantity} sold</p></div><div className="text-right"><p className="font-medium">{formatCurrency(line.revenue)}</p><p className="text-blue-700">Profit {line.cogs === null ? 'Incomplete' : formatCurrency(line.revenue - line.cogs)}</p></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ReceiptText className="h-4 w-4" />Transaction history</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {filteredSales.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">No completed sales in this date range.</p> : <div className="space-y-2">
              {filteredSales.map((sale) => <details key={sale.id} className="rounded-lg border border-slate-200">
                <summary className="grid cursor-pointer grid-cols-2 gap-2 p-3 text-[10px] sm:grid-cols-4 lg:grid-cols-8">
                  <span className="font-semibold text-slate-800">#{sale.id.slice(-6).toUpperCase()}<small className="block font-normal text-slate-500">{formatDateTime(sale.createdAt)}</small></span>
                  <span>{sale.itemCount} units</span>
                  <span>Revenue {formatCurrency(getSaleRevenue(sale))}</span>
                  <span>Packaging {formatCurrency(sale.packagingExpense ?? 0)}</span>
                  <span>COGS {profitLabel(getSaleCogs(sale))}</span>
                  <span>Gross {profitLabel(sale.grossProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0)))}</span>
                  <span className="text-violet-700">Net {profitLabel(sale.netProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0) - (sale.packagingExpense ?? 0)))}</span>
                  <span className="text-blue-700">View details</span>
                </summary>
                <div className="border-t border-slate-100 p-3">
                  {sale.items.map((item, index) => <div key={`${item.productId}-${index}`} className="grid grid-cols-2 gap-2 border-b border-slate-100 py-2 text-[10px] sm:grid-cols-4">
                    <div><b>{item.productName}</b><p className="text-slate-500">{item.categoryName ?? 'Category unavailable'}</p></div>
                    <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span><span>Revenue {formatCurrency(getItemRevenue(item))}</span>
                    <span>COGS {item.cogs === undefined || item.cogs === null ? 'Incomplete' : formatCurrency(item.cogs)} · Gross {item.grossProfit === undefined || item.grossProfit === null ? 'Incomplete' : formatCurrency(item.grossProfit)}</span>
                    {item.batchAllocations?.length ? <span className="col-span-2 text-slate-500 sm:col-span-4">FIFO: {item.batchAllocations.map((allocation) => `${allocation.quantity} × ${formatCurrency(allocation.unitPurchaseCost)} = ${formatCurrency(allocation.totalCost)}`).join(' + ')}</span> : null}
                  </div>)}
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
                    <span>Product revenue <b>{formatCurrency(getSaleRevenue(sale))}</b></span><span>COGS <b>{profitLabel(getSaleCogs(sale))}</b></span><span>Packaging <b>{formatCurrency(sale.packagingExpense ?? 0)}</b></span><span>Gross / net <b>{profitLabel(sale.grossProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0)))}</b> / <b>{profitLabel(sale.netProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0) - (sale.packagingExpense ?? 0)))}</b></span>
                  </div>
                </div>
              </details>)}
            </div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
