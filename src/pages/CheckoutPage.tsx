import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Search, ShoppingCart } from "lucide-react";

import { CartPanel } from "../components/pos/CartPanel";
import { ProductCard } from "../components/pos/ProductCard";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
import type { CartItem, Product } from "../types";
import { formatCurrency, getProductCategory } from "../lib/utils";

type CheckoutPageProps = {
  products: Product[];
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClearCart: () => void;
  onCheckout: (packagingExpense: number) => boolean | Promise<boolean>;
  isProcessing: boolean;
};

export function CheckoutPage({
  products,
  cart,
  onAddToCart,
  onIncrease,
  onDecrease,
  onRemove,
  onClearCart,
  onCheckout,
  isProcessing,
}: CheckoutPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isCartOpen, setIsCartOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("showCart"),
  );
  const [packagingExpense, setPackagingExpense] = useState("0");
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!searchParams.has("showCart")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("showCart");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCheckout = async () => {
    const saved = await onCheckout(Number(packagingExpense));
    if (saved) setPackagingExpense("0");
    return saved;
  };

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          products.map((product) =>
            getProductCategory(product.categoryName ?? product.category),
          ),
        ),
      ).sort(),
    ],
    [products],
  );

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase());
    const matchesCategory =
      selectedCategory === "All" ||
      getProductCategory(product.categoryName ?? product.category) ===
        selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartPanelProps = {
    items: cart,
    onDecrease,
    onIncrease,
    onRemove,
    onClearCart,
    onCheckout: handleCheckout,
    isProcessing,
    packagingExpense,
    onPackagingExpenseChange: setPackagingExpense,
  };

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_270px]">
      <section className="min-w-0">
        <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <h1 className="text-sm font-semibold text-slate-800">
            Products{" "}
            <span className="text-[10px] font-normal text-slate-500">
              ({products.length})
            </span>
          </h1>
          <div className="relative w-full sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search products by name"
              className="h-9 rounded-md border-slate-200 bg-surface pl-8 text-xs"
              aria-label="Search products by name"
            />
          </div>
        </div>

        {categories.length > 1 ? (
          <div
            className="mb-3 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap"
            aria-label="Filter products by category"
          >
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                aria-pressed={selectedCategory === category}
                className={`min-w-0 max-w-full whitespace-normal break-words rounded-md border px-2.5 py-1.5 text-left text-[10px] font-medium transition ${
                  selectedCategory === category
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}

        {filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-8 text-center">
            <p className="text-xs font-medium text-slate-700">
              No products found
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              Try a different search or category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartItem={cart.find((item) => item.id === product.id)}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
        )}
      </section>

      <aside className="hidden md:sticky md:top-4 md:block">
        <CartPanel {...cartPanelProps} />
      </aside>

      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-surface px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] md:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ShoppingCart className="h-5 w-5 shrink-0 text-blue-700" />
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium text-slate-600">
                  Cart · {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
                </p>
                <p className="text-sm font-bold leading-tight text-slate-900">
                  {formatCurrency(cartTotal)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="h-12 min-w-36 shrink-0 gap-1.5 bg-blue-700 px-4 text-sm font-semibold hover:bg-blue-600"
            >
              View Cart
              {cartItemCount > 0 ? (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface px-1 text-[9px] font-bold text-blue-700">
                  {cartItemCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>,
        document.body,
      )}
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent className="inset-x-0 bottom-0 top-auto h-[min(88dvh,680px)] max-h-[calc(100dvh-env(safe-area-inset-top))] max-w-none rounded-t-2xl border-x-0 border-b-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-full md:max-w-sm md:rounded-none md:rounded-l-2xl md:border-l">
          <div className="mb-3 shrink-0 pr-8">
            <SheetTitle className="text-sm font-semibold text-slate-900">
              Checkout
            </SheetTitle>
          </div>
          <CartPanel
            {...cartPanelProps}
            className="min-h-0 flex-1"
            onCheckout={async () => {
              if (await handleCheckout()) setIsCartOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <div className="h-14 md:hidden" />
    </div>
  );
}
