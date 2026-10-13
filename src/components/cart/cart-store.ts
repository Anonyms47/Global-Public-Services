"use client";

import { useSyncExternalStore } from "react";

/** Article du panier, conservé uniquement sur cet appareil (localStorage). */
export interface CartItem {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  optionsLabel: string;
  image: string | null;
  /** Prix affiché au moment de l'ajout ; revérifié avant la commande. */
  unitPrice: number;
  quantity: number;
  addedAt: number;
}

const KEY = "gps-panier-v1";
const EMPTY: CartItem[] = [];
let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (i) => i && typeof i.variantId === "string" && i.quantity > 0,
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: CartItem[]) {
  cache = items;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Stockage indisponible (navigation privée…) : le panier vit le temps de la page.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** true une fois le panier lu sur l'appareil (évite d'afficher « vide » trop tôt). */
export function useCartReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export const cart = {
  add(item: Omit<CartItem, "addedAt">, max: number) {
    const items = read();
    const existing = items.find((i) => i.variantId === item.variantId);
    const quantity = Math.min(max, (existing?.quantity ?? 0) + item.quantity);
    const next = existing
      ? items.map((i) =>
          i.variantId === item.variantId ? { ...i, ...item, quantity } : i,
        )
      : [...items, { ...item, quantity, addedAt: Date.now() }];
    write(next);
    return quantity;
  },
  setQuantity(variantId: string, quantity: number) {
    write(
      read().map((i) =>
        i.variantId === variantId
          ? { ...i, quantity: Math.max(1, Math.min(99, quantity)) }
          : i,
      ),
    );
  },
  remove(variantId: string) {
    const items = read();
    const index = items.findIndex((i) => i.variantId === variantId);
    const removed = items[index];
    write(items.filter((i) => i.variantId !== variantId));
    return removed ? { item: removed, index } : null;
  },
  restore(item: CartItem, index: number) {
    const items = read().filter((i) => i.variantId !== item.variantId);
    items.splice(Math.min(index, items.length), 0, item);
    write([...items]);
  },
  replace(items: CartItem[]) {
    write(items);
  },
  clear() {
    write([]);
  },
};

export function cartCount(items: CartItem[]) {
  return items.reduce((s, i) => s + i.quantity, 0);
}
