"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { EnrichedCartView } from "@/lib/cart/enrich";

type CartContextType = {
  cart: EnrichedCartView | null;
  isOpen: boolean;
  isLoading: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (variantId: string, quantity?: number, marketCode?: string, productId?: string) => Promise<boolean>;
  updateQuantity: (lineId: string, quantity: number) => Promise<boolean>;
  removeItem: (lineId: string) => Promise<boolean>;
  refreshCart: () => Promise<void>;
  totalQuantity: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<EnrichedCartView | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      if (res.ok) {
        const data = await res.json();
        setCart(data.cart ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch cart:", err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const res = await fetch("/api/cart");
        if (res.ok && !ignore) {
          const data = await res.json();
          setCart(data.cart ?? null);
        }
      } catch (err) {
        console.error("Failed to fetch cart:", err);
      }
    };
    void load();

    const handleExternalOpen = () => setIsOpen(true);
    window.addEventListener("cart:open", handleExternalOpen);

    return () => {
      ignore = true;
      window.removeEventListener("cart:open", handleExternalOpen);
    };
  }, []);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const addItem = async (
    variantId: string,
    quantity: number = 1,
    marketCode: string = "US",
    productId?: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity, marketCode, productId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data.cart ?? null);
        setIsOpen(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to add to bag:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuantity = async (lineId: string, quantity: number): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cart/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId, quantity }),
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data.cart ?? null);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to update cart line:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const removeItem = async (lineId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cart/item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCart(data.cart ?? null);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to remove cart line:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const totalQuantity = cart?.totalQuantity ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        isOpen,
        isLoading,
        openCart,
        closeCart,
        addItem,
        updateQuantity,
        removeItem,
        refreshCart,
        totalQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
