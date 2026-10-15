import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Pencil, ReceiptText, Trash2 } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import type { InventoryMovement, Product, SaleItem, SaleRecord } from '../types'
import { formatCurrency, formatDateOnly, formatDateTime } from '../lib/utils'
import type { SaleRequestItem } from '../lib/sale'

type DailySalesPageProps = {
  sales: SaleRecord[]
  products: Product[]
  movements: InventoryMovement[]
  onDeleteSale: (saleId: string) => boolean
  onUpdateSale: (saleId: string, items: SaleRequestItem[], packagingExpense: number) => boolean
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

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function getSaleCogs(sale: SaleRecord): number | null {
  if (sale.totalCogs !== undefined) return sale.totalCogs
  if (sale.items.some((item) => item.cogs === null || item.cogs === undefined)) return null
  return sale.items.reduce((sum, item) => sum + (item.cogs ?? 0), 0)
}

const badgeTones = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  slate: 'bg-slate-900 text-white',
} as const

function ExpandableRow({
  badge,
  title,
  subtitle,
  details,
  defaultOpen = false,
}: {
  badge: { label: string; tone: keyof typeof badgeTones }
  title: string
  subtitle: string
  details: [string, string][]
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeTones[badge.tone]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />{badge.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{title}</span>
          <span className="block text-xs text-slate-500">{subtitle}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <dl className="space-y-2.5 border-t border-slate-100 p-3 text-xs sm:p-4">
        {details.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function SaleEditor({
  sale,
  products,
  onSave,
  onCancel,
}: {
  sale: SaleRecord
  products: Product[]
  onSave: (items: SaleRequestItem[], packagingExpense: number) => boolean
  onCancel: () => void
}) {
  const [quantities, setQuantities] = useState(() => sale.items.map((item) => String(item.quantity)))
  const [packaging, setPackaging] = useState(String(sale.packagingExpense ?? 0))
  const [error, setError] = useState('')

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const packagingExpense = Number(packaging)
    const items: SaleRequestItem[] = []
    for (const [index, item] of sale.items.entries()) {
      const quantity = Number(quantities[index])
      if (!Number.isInteger(quantity) || quantity < 0) {
        setError('အရေအတွက်ကို 0 သို့မဟုတ် အပေါင်းကိန်းပြည့်ဖြင့် ထည့်ပါ။')
        return
      }
      if (quantity > 0) items.push({ productId: item.productId, quantity })
    }
    if (items.length === 0) {
      setError('ပစ္စည်းအားလုံးကို ဖယ်ရှားလိုပါက အရောင်းမှတ်တမ်းကို ဖျက်ပါ။')
      return
    }
    if (!Number.isFinite(packagingExpense) || packagingExpense < 0) {
      setError('ထုပ်ပိုးစရိတ်ကို မှန်ကန်စွာ ထည့်ပါ။')
      return
    }
    if (onSave(items, packagingExpense)) onCancel()
  }

  return (
    <form onSubmit={save} className="space-y-2 border-t border-slate-100 bg-blue-50/40 p-3 text-[10px]">
      <p className="font-semibold text-slate-800">အရောင်းမှတ်တမ်း ပြင်ဆင်ရန်</p>
      {sale.items.map((item, index) => {
        const available = (products.find((product) => product.id === item.productId)?.stock ?? 0) + item.quantity
        return (
          <label key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-white p-2">
            <span><b>{item.productName}</b><span className="block text-slate-500">{formatCurrency(item.unitPrice)} · အများဆုံး {available} ခု</span></span>
            <Input aria-label={`${item.productName} quantity`} type="number" min={0} max={available} step={1} value={quantities[index]} onChange={(event) => setQuantities((current) => current.map((value, position) => position === index ? event.target.value : value))} className="h-8 w-20 text-xs" />
          </label>
        )
      })}
      <label className="flex items-center justify-between gap-3 rounded-md bg-white p-2">
        <b>ထုပ်ပိုးစရိတ်</b>
        <Input aria-label="Packaging cost" type="number" min={0} step="any" value={packaging} onChange={(event) => setPackaging(event.target.value)} className="h-8 w-28 text-xs" />
      </label>
      <p className="text-slate-500">အရေအတွက်ကို 0 ထားလျှင် ထိုပစ္စည်းကို ဖယ်ရှားပြီး stock ပြန်ထည့်ပါမည်။</p>
      {error ? <p role="alert" className="text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="h-8 text-xs">မလုပ်တော့ပါ</Button>
        <Button type="submit" className="h-8 bg-blue-700 text-xs hover:bg-blue-800">သိမ်းမည်</Button>
      </div>
    </form>
  )
}

export function DailySalesPage({ sales, products, movements, onDeleteSale, onUpdateSale }: DailySalesPageProps) {
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom' | 'range'>('today')
  const [customDate, setCustomDate] = useState(today)
  const [rangeStart, setRangeStart] = useState(today)
  const [rangeEnd, setRangeEnd] = useState(today)
  const [reportMonth, setReportMonth] = useState(today.slice(0, 7))
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'profit'>('revenue')
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)

  const confirmDeleteSale = (sale: SaleRecord) => {
    const message = `အရောင်း #${sale.id.slice(-6).toUpperCase()} (${formatCurrency(getSaleRevenue(sale))}) ကို ဖျက်မလား?\nရောင်းထားသောပစ္စည်းများကို stock ထဲ ပြန်ထည့်ပါမည်။`
    if (window.confirm(message)) onDeleteSale(sale.id)
  }

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

  const monthlySales = useMemo(
    () => sales.filter((sale) => formatDateOnly(sale.createdAt).slice(0, 7) === reportMonth),
    [sales, reportMonth],
  )
  const monthlyMovements = useMemo(
    () => movements.filter((movement) => formatDateOnly(movement.createdAt).slice(0, 7) === reportMonth),
    [movements, reportMonth],
  )
  const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + getSaleRevenue(sale), 0)
  const monthlyUnits = monthlySales.reduce((sum, sale) => sum + sale.itemCount, 0)
  const monthlyPackaging = monthlySales.reduce((sum, sale) => sum + (sale.packagingExpense ?? 0), 0)
  const monthlyCostsIncomplete = monthlySales.some((sale) => getSaleCogs(sale) === null)
  const monthlyCogs = monthlyCostsIncomplete ? null : monthlySales.reduce((sum, sale) => sum + (getSaleCogs(sale) ?? 0), 0)
  const monthlyGrossProfit = monthlyCogs === null ? null : monthlyRevenue - monthlyCogs
  const monthlyNetProfit = monthlyGrossProfit === null ? null : monthlyGrossProfit - monthlyPackaging
  const monthlyRestocks = useMemo(
    () => monthlyMovements.filter((movement) => movement.type === 'restock' && movement.quantityChange > 0),
    [monthlyMovements],
  )
  const monthlyRestockCost = monthlyRestocks.reduce((sum, movement) => sum + movement.quantityChange * (movement.unitPurchaseCost ?? 0), 0)
  const monthlyRestockUnits = monthlyRestocks.reduce((sum, movement) => sum + movement.quantityChange, 0)
  const monthlyCashiers = useMemo(() => {
    const rows = new Map<string, { sales: number; units: number; revenue: number }>()
    for (const sale of monthlySales) {
      const key = sale.cashierEmail || 'Owner'
      const row = rows.get(key) ?? { sales: 0, units: 0, revenue: 0 }
      row.sales += 1
      row.units += sale.itemCount
      row.revenue += getSaleRevenue(sale)
      rows.set(key, row)
    }
    return [...rows.entries()].map(([cashier, values]) => ({ cashier, ...values })).sort((a, b) => b.revenue - a.revenue)
  }, [monthlySales])
  const monthlyProducts = useMemo(() => {
    const rows = new Map<string, { name: string; sold: number; revenue: number; cogs: number | null; restocks: number; restocked: number; restockCost: number }>()
    const emptyRow = (name: string) => ({ name, sold: 0, revenue: 0, cogs: 0 as number | null, restocks: 0, restocked: 0, restockCost: 0 })
    for (const sale of monthlySales) {
      for (const item of sale.items) {
        const row = rows.get(item.productId) ?? emptyRow(item.productName)
        row.sold += item.quantity
        row.revenue += getItemRevenue(item)
        row.cogs = row.cogs === null || item.cogs === null || item.cogs === undefined ? null : row.cogs + item.cogs
        rows.set(item.productId, row)
      }
    }
    for (const movement of monthlyRestocks) {
      const product = products.find((item) => item.id === movement.productId)
      const row = rows.get(movement.productId) ?? emptyRow(product?.name ?? 'Deleted product')
      row.restocks += 1
      row.restocked += movement.quantityChange
      row.restockCost += movement.quantityChange * (movement.unitPurchaseCost ?? 0)
      rows.set(movement.productId, row)
    }
    return [...rows.entries()]
      .map(([productId, values]) => ({
        productId,
        ...values,
        currentStock: products.find((product) => product.id === productId)?.stock ?? 0,
      }))
      .sort((left, right) => right.revenue - left.revenue || right.sold - left.sold)
  }, [monthlySales, monthlyRestocks, products])

  const downloadMonthlyCsv = () => {
    const header = ['Product', 'Units sold', 'Revenue', 'Cost (FIFO)', 'Gross profit', 'Restock count', 'Units restocked', 'Restock cost', 'Current stock']
    const rows = monthlyProducts.map((product) => [
      product.name,
      product.sold,
      product.revenue,
      product.cogs ?? '',
      product.cogs === null ? '' : product.revenue - product.cogs,
      product.restocks,
      product.restocked,
      product.restockCost,
      product.currentStock,
    ])
    const summary = [
      [],
      ['Month', reportMonth],
      ['Total revenue', monthlyRevenue],
      ['Number of sales', monthlySales.length],
      ['Units sold', monthlyUnits],
      ['Cost (FIFO)', monthlyCogs ?? 'incomplete'],
      ['Packaging', monthlyPackaging],
      ['Gross profit', monthlyGrossProfit ?? 'incomplete'],
      ['Net profit', monthlyNetProfit ?? 'incomplete'],
      ['Restocks', monthlyRestocks.length],
      ['Units restocked', monthlyRestockUnits],
      ['Restock spending', monthlyRestockCost],
      [],
      ['Cashier', 'Sales', 'Units', 'Revenue'],
      ...monthlyCashiers.map((row) => [row.cashier, row.sales, row.units, row.revenue]),
    ]
    const csv = [header, ...rows, ...summary].map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `softlight-${reportMonth}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

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

  const profitLabel = (value: number | null) => value === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(value)
  const dateModeLabels = {
    today: 'ယနေ့',
    yesterday: 'မနေ့က',
    custom: 'ရက်ရွေးရန်',
    range: 'ကာလရွေးရန်',
  } as const

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-sm font-semibold text-slate-800">အရောင်းနှင့် အမြတ်အစီရင်ခံစာ</h1>
          <p className="mt-0.5 text-[10px] text-slate-500">ရောင်းရငွေ၊ FIFO အရင်း၊ ထုပ်ပိုးစရိတ်နှင့် ကုန်ပစ္စည်းရောင်းအား။</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
            {(['today', 'yesterday', 'custom', 'range'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setDateMode(mode)} className={`rounded px-2 py-1.5 text-[10px] font-medium ${dateMode === mode ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{dateModeLabels[mode]}</button>
            ))}
          </div>
          {dateMode === 'custom' ? <Input aria-label="Select report date" type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="h-9 w-36 text-xs" /> : null}
          {dateMode === 'range' ? <div className="flex items-center gap-1"><Input aria-label="Range start" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="h-9 w-36 text-xs" /><span className="text-xs text-slate-400">to</span><Input aria-label="Range end" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="h-9 w-36 text-xs" /></div> : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <div>
            <CardTitle className="text-sm">လစဉ်စာရင်းပေါင်းချုပ်</CardTitle>
            <p className="mt-1 text-[10px] text-slate-500">လအလိုက် ရောင်းအား၊ ပစ္စည်းတစ်မျိုးချင်းရောင်းရငွေနှင့် stock ဖြည့်သွင်းမှုများ။</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] text-slate-600">
              လရွေးရန်
              <Input aria-label="Select report month" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="h-9 w-40 text-xs" />
            </label>
            <Button type="button" variant="outline" disabled={monthlyProducts.length === 0} onClick={downloadMonthlyCsv} className="h-9 gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[10px] text-emerald-800">ရောင်းရငွေ</p><p className="mt-1 text-sm font-bold text-emerald-900">{formatCurrency(monthlyRevenue)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-600">အရောင်းအကြိမ်</p><p className="mt-1 text-sm font-bold text-slate-900">{monthlySales.length}</p></div>
            <div className="rounded-lg bg-blue-50 p-3"><p className="text-[10px] text-blue-800">ရောင်းချသည့်အရေအတွက်</p><p className="mt-1 text-sm font-bold text-blue-900">{monthlyUnits} ခု</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-600">ကုန်ပစ္စည်းအရင်း</p><p className="mt-1 text-sm font-bold text-slate-900">{profitLabel(monthlyCogs)}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] text-amber-800">ထုပ်ပိုးစရိတ်</p><p className="mt-1 text-sm font-bold text-amber-900">{formatCurrency(monthlyPackaging)}</p></div>
            <div className="rounded-lg bg-blue-50 p-3"><p className="text-[10px] text-blue-800">စုစုပေါင်းအမြတ်</p><p className="mt-1 text-sm font-bold text-blue-900">{profitLabel(monthlyGrossProfit)}</p></div>
            <div className="rounded-lg bg-violet-50 p-3"><p className="text-[10px] text-violet-800">အသားတင်အမြတ်</p><p className="mt-1 text-sm font-bold text-violet-900">{profitLabel(monthlyNetProfit)}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] text-amber-800">Stock ဖြည့်သွင်းမှု</p><p className="mt-1 text-sm font-bold text-amber-900">{monthlyRestocks.length} ကြိမ် · {monthlyRestockUnits} ခု</p><p className="text-[10px] text-amber-800">{formatCurrency(monthlyRestockCost)}</p></div>
          </div>
          {monthlyProducts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">ရွေးထားသောလတွင် အရောင်း သို့မဟုတ် stock ဖြည့်သွင်းမှု မရှိပါ။</p>
          ) : (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">ကုန်ပစ္စည်းအလိုက်</h3>
              <div className="grid items-start gap-2 lg:grid-cols-2">
                {monthlyProducts.map((product) => (
                  <ExpandableRow
                    key={product.productId}
                    badge={product.sold > 0 ? { label: `${product.sold} ခု ရောင်း`, tone: 'emerald' } : { label: 'Stock ဖြည့်', tone: 'amber' }}
                    title={product.name}
                    subtitle={formatCurrency(product.revenue)}
                    details={[
                      ['ရောင်းရသည့်အရေအတွက်', `${product.sold} ခု`],
                      ['ရောင်းရငွေ', formatCurrency(product.revenue)],
                      ['အမြတ်', product.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(product.revenue - product.cogs)],
                      ['Stock ဖြည့်သည့်အကြိမ်', `${product.restocks} ကြိမ်`],
                      ['ဖြည့်သည့်အရေအတွက်', `${product.restocked} ခု`],
                      ['ဖြည့်သည့်ငွေ', formatCurrency(product.restockCost)],
                      ['လက်ရှိ Stock', `${product.currentStock} ခု`],
                    ]}
                  />
                ))}
              </div>
              <ExpandableRow
                defaultOpen
                badge={{ label: 'စုစုပေါင်း', tone: 'slate' }}
                title={`${monthlyUnits} ခု ရောင်းရ`}
                subtitle={formatCurrency(monthlyRevenue)}
                details={[
                  ['ရောင်းရငွေ', formatCurrency(monthlyRevenue)],
                  ['စုစုပေါင်းအမြတ်', profitLabel(monthlyGrossProfit)],
                  ['Stock ဖြည့်သည့်အကြိမ်', `${monthlyRestocks.length} ကြိမ်`],
                  ['ဖြည့်သည့်အရေအတွက်', `${monthlyRestockUnits} ခု`],
                  ['ဖြည့်သည့်ငွေ', formatCurrency(monthlyRestockCost)],
                ]}
              />
            </section>
          )}
          {monthlyCashiers.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">ရောင်းသူအလိုက်</h3>
              <div className="grid items-start gap-2 lg:grid-cols-2">
                {monthlyCashiers.map((row) => (
                  <ExpandableRow
                    key={row.cashier}
                    badge={{ label: `${row.sales} ကြိမ်`, tone: 'blue' }}
                    title={row.cashier}
                    subtitle={formatCurrency(row.revenue)}
                    details={[
                      ['အရောင်းအကြိမ်', String(row.sales)],
                      ['ရောင်းချသည့်အရေအတွက်', `${row.units} ခု`],
                      ['ရောင်းရငွေ', formatCurrency(row.revenue)],
                    ]}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {[
          { label: 'ကုန်ပစ္စည်းရောင်းရငွေ', value: formatCurrency(totalRevenue), tone: 'text-emerald-700' },
          { label: 'အရောင်းအကြိမ်', value: String(filteredSales.length), tone: 'text-slate-900' },
          { label: 'ရောင်းချသည့်အရေအတွက်', value: `${totalUnits} ခု`, tone: 'text-slate-900' },
          { label: 'ကုန်ပစ္စည်းအရင်း (FIFO)', value: totalCogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(totalCogs), tone: 'text-slate-900' },
          { label: 'ထုပ်ပိုးစရိတ်', value: formatCurrency(packagingTotal), tone: 'text-amber-700' },
          { label: 'စုစုပေါင်းအမြတ်', value: profitLabel(grossProfit), tone: 'text-blue-700' },
          { label: 'အသားတင်အမြတ်', value: profitLabel(netProfit), tone: 'text-violet-700' },
        ].map((metric) => (
          <Card key={metric.label}><CardContent className="p-3"><p className="text-[9px] text-slate-500">{metric.label}</p><p className={`mt-1 text-sm font-bold ${metric.tone}`}>{metric.value}</p></CardContent></Card>
        ))}
      </div>

      {cogsIncomplete && filteredSales.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900">
          အချို့သော အရောင်းမှတ်တမ်းများတွင် အရင်းအချက်အလက် မရှိပါ။ ရောင်းရငွေကို ထည့်တွက်ထားပြီး အမြတ်ကို ခန့်မှန်းမည့်အစား မပြည့်စုံဟု ဖော်ပြထားပါသည်။
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <CardTitle className="text-sm">အမျိုးအစားအလိုက် ရောင်းအား</CardTitle>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">စီရန်
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700">
              <option value="revenue">ရောင်းရငွေ</option><option value="quantity">ရောင်းရသည့်အရေအတွက်</option><option value="profit">အမြတ်</option>
            </select>
          </label>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {categories.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">ရွေးထားသော ကာလအတွင်း အရောင်းမရှိပါ။</p> : (
            <div className="space-y-2">
              {categories.map((category) => {
                const expanded = expandedCategories.includes(category.name)
                return (
                  <section key={category.name} className="overflow-hidden rounded-lg border border-slate-200">
                    <button type="button" onClick={() => toggleCategory(category.name)} className="flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 text-left">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{category.name} <Badge>{category.quantity} ခု</Badge></span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]"><span>ရောင်းရငွေ <b>{formatCurrency(category.revenue)}</b></span><span>ကုန်ပစ္စည်းအရင်း <b>{category.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(category.cogs)}</b></span><span className="text-blue-700">စုစုပေါင်းအမြတ် <b>{category.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(category.revenue - category.cogs)}</b></span></span>
                    </button>
                    {expanded ? <div className="divide-y divide-slate-100">
                      {category.lines.map((line) => <div key={`${line.productId}-${line.productName}`} className="grid grid-cols-2 gap-2 px-3 py-2 text-[10px] sm:grid-cols-5">
                        <span className="font-medium text-slate-800">{line.productName}</span><span className="text-slate-500">{line.quantity} ခု</span><span>ရောင်းရငွေ {formatCurrency(line.revenue)}</span><span>ကုန်ပစ္စည်းအရင်း {line.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(line.cogs)}</span><span className="font-semibold text-blue-700">အမြတ် {line.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(line.revenue - line.cogs)}</span>
                      </div>)}
                    </div> : null}
                  </section>
                )
              })}
              <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-900 p-3 text-[10px] text-white">
                <b>စုစုပေါင်း · {totalUnits} ခု</b><span>ရောင်းရငွေ {formatCurrency(totalRevenue)} · အရင်း {totalCogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(totalCogs)} · စုစုပေါင်းအမြတ် {profitLabel(grossProfit)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="p-4 pb-3"><CardTitle className="text-sm">အရောင်းရဆုံး ကုန်ပစ္စည်းများ</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {bestSellers.length === 0 ? <p className="text-xs text-slate-500">ဤကာလအတွင်း ကုန်ပစ္စည်းရောင်းချမှု မရှိပါ။</p> : <div className="space-y-2">{bestSellers.map((line) => <div key={`${line.productId}-${line.productName}`} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[10px]"><div><p className="font-semibold text-slate-800">{line.productName}</p><p className="text-slate-500">{line.categoryName} · {line.quantity} ခု ရောင်းရ</p></div><div className="text-right"><p className="font-medium">{formatCurrency(line.revenue)}</p><p className="text-blue-700">အမြတ် {line.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(line.revenue - line.cogs)}</p></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ReceiptText className="h-4 w-4" />အရောင်းမှတ်တမ်း</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {filteredSales.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">ရွေးထားသော ကာလအတွင်း ပြီးဆုံးသည့် အရောင်းမရှိပါ။</p> : <div className="space-y-2">
              {filteredSales.map((sale) => <details key={sale.id} className="rounded-lg border border-slate-200">
                <summary className="grid cursor-pointer grid-cols-2 gap-2 p-3 text-[10px] sm:grid-cols-4 lg:grid-cols-8">
                  <span className="font-semibold text-slate-800">#{sale.id.slice(-6).toUpperCase()}<small className="block font-normal text-slate-500">{formatDateTime(sale.createdAt)}</small></span>
                  <span>{sale.itemCount} ခု</span>
                  <span>ရောင်းရငွေ {formatCurrency(getSaleRevenue(sale))}</span>
                  <span>ထုပ်ပိုးစရိတ် {formatCurrency(sale.packagingExpense ?? 0)}</span>
                  <span>ကုန်ပစ္စည်းအရင်း {profitLabel(getSaleCogs(sale))}</span>
                  <span>စုစုပေါင်းအမြတ် {profitLabel(sale.grossProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0)))}</span>
                  <span className="text-violet-700">အသားတင်အမြတ် {profitLabel(sale.netProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0) - (sale.packagingExpense ?? 0)))}</span>
                  <span className="text-blue-700">အသေးစိတ်ကြည့်ရန်</span>
                </summary>
                <div className="border-t border-slate-100 p-3">
                  {sale.items.map((item, index) => <div key={`${item.productId}-${index}`} className="grid grid-cols-2 gap-2 border-b border-slate-100 py-2 text-[10px] sm:grid-cols-4">
                    <div><b>{item.productName}</b><p className="text-slate-500">{item.categoryName ?? 'Category unavailable'}</p></div>
                    <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span><span>ရောင်းရငွေ {formatCurrency(getItemRevenue(item))}</span>
                    <span>အရင်း {item.cogs === undefined || item.cogs === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(item.cogs)} · အမြတ် {item.grossProfit === undefined || item.grossProfit === null ? 'အချက်အလက် မပြည့်စုံ' : formatCurrency(item.grossProfit)}</span>
                    {item.batchAllocations?.length ? <span className="col-span-2 text-slate-500 sm:col-span-4">FIFO: {item.batchAllocations.map((allocation) => `${allocation.quantity} × ${formatCurrency(allocation.unitPurchaseCost)} = ${formatCurrency(allocation.totalCost)}`).join(' + ')}</span> : null}
                  </div>)}
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
                    <span>ကုန်ပစ္စည်းရောင်းရငွေ <b>{formatCurrency(getSaleRevenue(sale))}</b></span><span>ကုန်ပစ္စည်းအရင်း <b>{profitLabel(getSaleCogs(sale))}</b></span><span>ထုပ်ပိုးစရိတ် <b>{formatCurrency(sale.packagingExpense ?? 0)}</b></span><span>စုစုပေါင်း / အသားတင်အမြတ် <b>{profitLabel(sale.grossProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0)))}</b> / <b>{profitLabel(sale.netProfit ?? (getSaleCogs(sale) === null ? null : getSaleRevenue(sale) - (getSaleCogs(sale) ?? 0) - (sale.packagingExpense ?? 0)))}</b></span>
                  </div>
                  {sale.cashierEmail ? <p className="mt-2 text-[10px] text-slate-500">ရောင်းသူ · {sale.cashierEmail}</p> : null}
                  {editingSaleId === sale.id ? null : (
                    <div className="mt-3 flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setEditingSaleId(sale.id)} className="h-8 gap-1.5 text-xs"><Pencil className="h-3.5 w-3.5" />ပြင်ရန်</Button>
                      <Button type="button" variant="outline" onClick={() => confirmDeleteSale(sale)} className="h-8 gap-1.5 border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" />ဖျက်ရန်</Button>
                    </div>
                  )}
                </div>
                {editingSaleId === sale.id ? (
                  <SaleEditor
                    sale={sale}
                    products={products}
                    onSave={(items, packagingExpense) => onUpdateSale(sale.id, items, packagingExpense)}
                    onCancel={() => setEditingSaleId(null)}
                  />
                ) : null}
              </details>)}
            </div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
