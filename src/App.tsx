import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { Boxes, Clock3, Cloud, CloudOff, LogOut, Menu, PackagePlus, ReceiptText, ShoppingCart, Store } from 'lucide-react'
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'

import { Button } from './components/ui/button'
import { AddProductsPage } from './pages/AddProductsPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { DailySalesPage } from './pages/DailySalesPage'
import { InventoryPage } from './pages/InventoryPage'
import { applySale, SaleError } from './lib/sale'
import { createBatch, createMovement, loadAdminMode, loadAppData, saveAdminMode, saveAppData } from './lib/storage'
import type { AppData, CartItem, Category, InventoryBatch, Product } from './types'
import { Sheet, SheetContent, SheetTitle } from './components/ui/sheet'
import { firebaseAuth, firebaseConfigError, firestoreDb } from './lib/firebase'

type ToastState = {
  message: string
  type: 'success' | 'error'
}

type CloudStatus = 'local' | 'connecting' | 'syncing' | 'connected' | 'error'
type UserRole = 'owner' | 'staff'

const emptyAppData: AppData = {
  version: 2,
  products: [],
  categories: [],
  batches: [],
  movements: [],
  sales: [],
  lowStockThreshold: 5,
}

function isAppData(value: unknown): value is AppData {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AppData>
  return candidate.version === 2 &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.batches) &&
    Array.isArray(candidate.movements) &&
    Array.isArray(candidate.sales)
}

class CloudConflictError extends Error {}

function SignInScreen({
  user,
  message,
  onSignedOut,
}: {
  user: User | null
  message: string
  onSignedOut: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!firebaseAuth) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
    } catch (cause) {
      console.error('Unable to sign in to Firebase Authentication.', cause)
      setError('အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားနေပါသည်။')
    } finally {
      setPending(false)
    }
  }

  const resetPassword = async () => {
    if (!firebaseAuth || !email.trim()) {
      setError('Password ပြန်သတ်မှတ်ရန် အီးမေးလ်ကို အရင်ထည့်ပါ။')
      return
    }
    setPending(true)
    setError('')
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim())
      setNotice('Password reset link ကို အီးမေးလ်သို့ ပို့လိုက်ပါပြီ။')
    } catch (cause) {
      console.error('Unable to send a Firebase password reset email.', cause)
      setError('Password reset အီးမေးလ်ပို့မရပါ။ အီးမေးလ်ကို စစ်ဆေးပါ။')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400 text-amber-950"><Store className="h-5 w-5" /></div>
          <div><h1 className="text-base font-bold text-slate-900">SoftLight Co.</h1><p className="text-xs text-slate-500">ဝန်ထမ်းအကောင့်ဖြээр ဝင်ပါ</p></div>
        </div>
        {message ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{message}</p> : null}
        {user ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">{user.email} အကောင့်အတွက် access role မရှိပါ။ Owner ထံဆက်သွယ်ပါ။</p>
            <Button type="button" variant="outline" className="w-full" onClick={onSignedOut}>အကောင့်ထွက်ရန်</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1 text-xs font-medium text-slate-700">အီးမေးလ်
              <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 px-3 text-base font-normal" />
            </label>
            <label className="block space-y-1 text-xs font-medium text-slate-700">စကားဝှက်
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 px-3 text-base font-normal" />
            </label>
            {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
            {notice ? <p role="status" className="text-xs text-emerald-700">{notice}</p> : null}
            <Button type="submit" disabled={pending} className="h-11 w-full bg-blue-700 text-sm hover:bg-blue-800">{pending ? 'စစ်ဆေးနေသည်…' : 'ဝင်မည်'}</Button>
            <button type="button" disabled={pending} onClick={resetPassword} className="w-full py-1 text-xs text-blue-700 hover:underline">စကားဝှက် မေ့နေပါသလား?</button>
          </form>
        )}
      </section>
    </main>
  )
}

function App() {
  const firebaseEnabled = Boolean(firestoreDb && firebaseAuth)
  const [data, setData] = useState<AppData>(() => firebaseEnabled || firebaseConfigError ? emptyAppData : loadAppData())
  const [localIsAdmin, setLocalIsAdmin] = useState(() => loadAdminMode())
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [authLoading, setAuthLoading] = useState(firebaseEnabled)
  const [authError, setAuthError] = useState('')
  const isAdmin = firebaseEnabled ? userRole === 'owner' : localIsAdmin
  const [cart, setCart] = useState<CartItem[]>([])
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    firebaseConfigError ? 'error' : firebaseEnabled ? 'connecting' : 'local',
  )
  const checkoutLock = useRef(false)
  const checkoutRequestId = useRef<{ payload: string; id: string } | null>(null)
  const cloudSyncReady = useRef(false)
  const lastCloudData = useRef<string | null>(null)
  const lastCloudRevision = useRef(0)
  const cloudWriteQueue = useRef(Promise.resolve())
  const authGeneration = useRef(0)

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
    if (firebaseEnabled && !isAdmin) {
      showToast('Only the owner can change inventory or reports.', 'error')
      return false
    }
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

  useEffect(() => {
    if (!firebaseAuth || !firestoreDb) return
    const db = firestoreDb
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      const generation = ++authGeneration.current
      setFirebaseUser(user)
      setUserRole(null)
      setAuthError('')
      setAuthLoading(true)
      setData(emptyAppData)
      setCart([])
      checkoutRequestId.current = null
      cloudSyncReady.current = false
      lastCloudData.current = null
      lastCloudRevision.current = 0
      if (!user) {
        setAuthLoading(false)
        setCloudStatus('connecting')
        return
      }
      try {
        const profile = await getDoc(doc(db, 'users', user.uid))
        if (generation !== authGeneration.current) return
        const role = profile.data()?.role
        if (!profile.exists() || (role !== 'owner' && role !== 'staff')) {
          setAuthError('ဤအကောင့်တွင် သတ်မှတ်ထားသော owner/staff role မရှိပါ။')
          setCloudStatus('error')
          return
        }
        setUserRole(role)
        setCloudStatus('connecting')
      } catch (error) {
        if (generation !== authGeneration.current) return
        console.error('Unable to load Firebase user access role.', error)
        setAuthError('အကောင့်ခွင့်ပြုချက်ကို မဖတ်နိုင်ပါ။ Firestore rules ကိုစစ်ဆေးပါ။')
        setCloudStatus('error')
      } finally {
        if (generation === authGeneration.current) setAuthLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!firebaseEnabled || !firestoreDb || !firebaseUser || !userRole) return
    const db = firestoreDb
    const dataDocument = doc(db, 'softlight-pos', 'main')
    return onSnapshot(dataDocument, (snapshot) => {
      if (!snapshot.exists()) {
        if (userRole !== 'owner') {
          setCloudStatus('error')
          showToast('Shop data is not set up yet. Ask the owner to sign in first.', 'error')
          return
        }
        const localData = loadAppData()
        const serializedLocalData = JSON.stringify(localData)
        if (new Blob([serializedLocalData]).size > 900_000) {
          console.error('POS data exceeds the supported Firestore document size.')
          setCloudStatus('error')
          showToast('Firebase data is too large. Reduce product image sizes to sync.', 'error')
          return
        }
        setData(localData)
        cloudSyncReady.current = true
        lastCloudData.current = serializedLocalData
        lastCloudRevision.current = 1
        cloudWriteQueue.current = cloudWriteQueue.current.catch(() => undefined).then(async () => {
          setCloudStatus('syncing')
          await setDoc(dataDocument, { appData: localData, revision: 1, updatedAt: serverTimestamp() })
          setCloudStatus('connected')
        }).catch((error: unknown) => {
          console.error('Unable to initialize Firestore POS data.', error)
          setCloudStatus('error')
          showToast('Firebase sync failed. Your changes remain saved locally.', 'error')
        })
        return
      }

      const remoteData: unknown = snapshot.data().appData
      if (!isAppData(remoteData)) {
        console.error('Firestore POS data is missing or has an unsupported version.')
        setCloudStatus('error')
        showToast('Firebase data is invalid or uses an unsupported version.', 'error')
        return
      }

      const serializedRemoteData = JSON.stringify(remoteData)
      cloudSyncReady.current = true
      lastCloudData.current = serializedRemoteData
      lastCloudRevision.current = Number(snapshot.data().revision ?? 0)
      try {
        saveAppData(remoteData)
        setData((current) => JSON.stringify(current) === serializedRemoteData ? current : remoteData)
        setCloudStatus('connected')
      } catch (error) {
        console.error('Unable to cache Firestore POS data locally.', error)
        setCloudStatus('error')
        showToast('Firebase data loaded but could not be cached locally.', 'error')
      }
    }, (error) => {
      console.error('Unable to read POS data from Firestore.', error)
      setCloudStatus('error')
      showToast('Firebase connection failed. Check Firestore configuration and rules.', 'error')
    })
  }, [firebaseEnabled, firebaseUser, userRole])

  useEffect(() => {
    if (!firebaseEnabled || !firestoreDb || userRole !== 'owner' || !cloudSyncReady.current) return
    const db = firestoreDb
    const serializedData = JSON.stringify(data)
    if (serializedData === lastCloudData.current) return
    if (new Blob([serializedData]).size > 900_000) {
      console.error('POS data exceeds the supported Firestore document size.')
      queueMicrotask(() => {
        setCloudStatus('error')
        showToast('Firebase data is too large. Reduce product image sizes to sync.', 'error')
      })
      return
    }

    const dataDocument = doc(db, 'softlight-pos', 'main')
    const baseRevision = lastCloudRevision.current
    cloudWriteQueue.current = cloudWriteQueue.current.catch(() => undefined)
      .then(async () => {
        setCloudStatus('syncing')
        // Staff sales write the same document from their own devices.
        // Refuse to overwrite a newer revision so those sales are never lost.
        const nextRevision = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(dataDocument)
          const remoteRevision = Number(snapshot.data()?.revision ?? 0)
          if (remoteRevision !== baseRevision) throw new CloudConflictError()
          transaction.set(dataDocument, { appData: data, revision: remoteRevision + 1, updatedAt: serverTimestamp() })
          return remoteRevision + 1
        })
        lastCloudData.current = serializedData
        lastCloudRevision.current = Math.max(lastCloudRevision.current, nextRevision)
        setCloudStatus('connected')
      })
      .catch((error: unknown) => {
        if (error instanceof CloudConflictError) {
          setCloudStatus('connected')
          showToast('ဝန်ထမ်းအရောင်းအသစ် ဝင်လာသဖြင့် နောက်ဆုံးပြင်ဆင်မှုကို မသိမ်းရသေးပါ။ စာရင်းအသစ်ကိုကြည့်ပြီး ထပ်ပြင်ပါ။', 'error')
          return
        }
        console.error('Unable to save POS data to Firestore.', error)
        setCloudStatus('error')
        showToast('Firebase sync failed. Your changes remain saved locally.', 'error')
      })
  }, [data, firebaseEnabled, userRole])

  const changeAdminMode = (nextMode: boolean) => {
    if (firebaseEnabled) return
    try {
      saveAdminMode(nextMode)
      setLocalIsAdmin(nextMode)
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

  const onRemove = (productId: string) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId))
  }

  const onCheckout = async (packagingExpense: number) => {
    if (checkoutLock.current) return false
    if (cart.length === 0) {
      showToast('Add at least one item before completing a sale.', 'error')
      return false
    }
    const saleItems = cart.map((item) => ({ productId: item.id, quantity: item.quantity }))
    const requestPayload = JSON.stringify({ items: saleItems, packagingExpense })
    const saleId = checkoutRequestId.current?.payload === requestPayload
      ? checkoutRequestId.current.id
      : crypto.randomUUID()
    checkoutRequestId.current = { payload: requestPayload, id: saleId }
    checkoutLock.current = true
    setIsProcessing(true)

    try {
      if (firebaseEnabled && firestoreDb && firebaseUser) {
        const dataDocument = doc(firestoreDb, 'softlight-pos', 'main')
        // The transaction re-reads the latest stock and prices, so two devices
        // selling the last item at the same time cannot both succeed.
        await runTransaction(firestoreDb, async (transaction) => {
          const snapshot = await transaction.get(dataDocument)
          const remoteData: unknown = snapshot.data()?.appData
          if (!isAppData(remoteData)) throw new SaleError('Shop data is not set up yet.')
          // A retry after a lost response must not record the sale twice.
          if (remoteData.sales.some((sale) => sale.id === saleId)) return
          const nextData = applySale(remoteData, saleItems, packagingExpense, saleId, {
            cashierUid: firebaseUser.uid,
            cashierEmail: firebaseUser.email ?? '',
          })
          transaction.set(dataDocument, {
            appData: nextData,
            revision: Number(snapshot.data()?.revision ?? 0) + 1,
            updatedAt: serverTimestamp(),
          })
        })
      } else {
        const nextData = applySale(data, saleItems, packagingExpense, saleId)
        if (!commit(nextData)) return false
      }
      checkoutRequestId.current = null
      setCart([])
      showToast('Sale complete.')
      return true
    } catch (error) {
      console.error('Checkout failed.', error)
      showToast(error instanceof SaleError ? error.message : 'Sale could not be completed. Check your connection, then retry.', 'error')
      return false
    } finally {
      setIsProcessing(false)
      checkoutLock.current = false
    }
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
      return false
    }
    const next = { ...data, products: products.map((product) => product.id === productId ? { ...product, isActive: false } : product) }
    const saved = commit(next)
    if (saved) setCart((items) => items.filter((item) => item.id !== productId))
    return saved
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
  ].filter((item) => isAdmin || item.to === '/')
  const formattedDate = currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const formattedTime = currentTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const cloudStatusLabel = {
    local: 'Local only',
    connecting: 'Connecting',
    syncing: 'Syncing',
    connected: 'Cloud connected',
    error: 'Cloud error',
  }[cloudStatus]

  if (firebaseConfigError) {
    return <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4"><section className="max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow"><h1 className="text-base font-semibold text-slate-900">Firebase configuration incomplete</h1><p className="mt-2 text-sm text-slate-600">Set all Firebase environment values from <code>.env.example</code> in <code>.env.local</code>, then restart the app. Local/demo access is disabled while Firebase is partially configured.</p></section></main>
  }
  if (firebaseEnabled && authLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-600">အကောင့်ကို စစ်ဆေးနေသည်…</main>
  }
  if (firebaseEnabled && (!firebaseUser || !userRole)) {
    return <SignInScreen user={firebaseUser} message={authError} onSignedOut={() => { if (firebaseAuth) void signOut(firebaseAuth) }} />
  }

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
                <span className={`flex items-center gap-1 text-[10px] ${cloudStatus === 'connected' ? 'text-emerald-700' : cloudStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`} title={cloudStatusLabel}>
                  {cloudStatus === 'error' ? <CloudOff className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
                  {cloudStatusLabel}
                </span>
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-medium text-slate-700">{formattedDate}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <Clock3 className="h-3 w-3" />{formattedTime}
                  </p>
                </div>
                {firebaseEnabled ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                    <span className={`text-[10px] font-semibold ${isAdmin ? 'text-amber-700' : 'text-slate-500'}`}>{isAdmin ? 'Owner' : 'Staff'}</span>
                    <button type="button" onClick={() => { if (firebaseAuth) void signOut(firebaseAuth) }} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Sign out"><LogOut className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                    <span className={`text-[10px] font-semibold ${isAdmin ? 'text-amber-700' : 'text-slate-500'}`}>{isAdmin ? 'Admin' : 'Staff'} demo</span>
                    <button type="button" role="switch" aria-checked={isAdmin} aria-label="Toggle Admin mode" onClick={() => changeAdminMode(!isAdmin)} className={`relative h-5 w-9 rounded-full transition ${isAdmin ? 'bg-amber-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${isAdmin ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}
              </div>
            </header>

            <main className="mx-auto max-w-[1320px] px-3 py-4 pb-5 sm:px-5 sm:py-5">
              <Routes>
                <Route path="/" element={<CheckoutPage products={products.filter((product) => product.isActive !== false)} cart={cart} onAddToCart={addToCart} onIncrease={onIncrease} onDecrease={onDecrease} onRemove={onRemove} onClearCart={() => { checkoutRequestId.current = null; setCart([]) }} onCheckout={onCheckout} isProcessing={isProcessing} />} />
                <Route path="/products" element={isAdmin ? <AddProductsPage products={products.filter((product) => product.isActive !== false)} categories={categories} isAdmin={isAdmin} onSaveProduct={saveProduct} onShowToast={showToast} /> : <Navigate to="/" replace />} />
                <Route path="/inventory" element={isAdmin ? <InventoryPage products={products} categories={categories} batches={batches} movements={movements} isAdmin={isAdmin} lowStockThreshold={data.lowStockThreshold} onLowStockThresholdChange={changeLowStockThreshold} onDeleteProduct={deleteProduct} onRestock={restock} onAdjustStock={adjustStock} onEditBatch={editBatch} onAddCategory={addCategory} onRenameCategory={renameCategory} onShowToast={showToast} /> : <Navigate to="/" replace />} />
                <Route path="/sales" element={isAdmin ? <DailySalesPage sales={sales} products={products} movements={movements} /> : <Navigate to="/" replace />} />
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
            {!firebaseEnabled ? (
              <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3">
                <span className={`text-xs font-semibold ${isAdmin ? 'text-amber-700' : 'text-slate-500'}`}>{isAdmin ? 'Admin' : 'Staff'} demo mode</span>
                <button type="button" role="switch" aria-checked={isAdmin} aria-label="Toggle Admin mode" onClick={() => changeAdminMode(!isAdmin)} className={`relative h-6 w-10 rounded-full transition ${isAdmin ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${isAdmin ? 'left-5' : 'left-1'}`} />
                </button>
              </div>
            ) : <button type="button" onClick={() => { if (firebaseAuth) void signOut(firebaseAuth) }} className="mt-5 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-left text-xs font-medium text-slate-700"><LogOut className="h-4 w-4" />Sign out</button>}
            <p className={`mt-3 flex items-center gap-2 px-3 text-xs ${cloudStatus === 'connected' ? 'text-emerald-700' : cloudStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
              {cloudStatus === 'error' ? <CloudOff className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
              {cloudStatusLabel}
            </p>
          </SheetContent>
        </Sheet>
        {!firebaseEnabled ? <div className="fixed bottom-2 left-2 z-30 hidden max-w-xs text-[9px] text-slate-400 md:block">Demo mode only. Browser-side roles are not secure authentication.</div> : null}
        {toast ? <div className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">{toast.message}</div> : null}
      </div>
    </BrowserRouter>
  )
}

export default App
