import React, { createContext, useContext, useReducer } from 'react';

const CartContext = createContext();

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { item, restaurant } = action.payload;
      // If cart has items from a different restaurant, clear it first
      if (state.restaurantId && state.restaurantId !== restaurant.id) {
        return {
          items: [{ ...item, quantity: 1 }],
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          deliveryFee: restaurant.delivery_fee,
        };
      }
      const existingIndex = state.items.findIndex(i => i.id === item.id);
      if (existingIndex >= 0) {
        const newItems = [...state.items];
        newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
        return { ...state, items: newItems };
      }
      return {
        ...state,
        items: [...state.items, { ...item, quantity: 1 }],
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        deliveryFee: restaurant.delivery_fee,
      };
    }
    case 'REMOVE_ITEM': {
      const index = state.items.findIndex(i => i.id === action.payload);
      if (index < 0) return state;
      const newItems = [...state.items];
      if (newItems[index].quantity > 1) {
        newItems[index] = { ...newItems[index], quantity: newItems[index].quantity - 1 };
      } else {
        newItems.splice(index, 1);
      }
      if (newItems.length === 0) {
        return { items: [], restaurantId: null, restaurantName: null, deliveryFee: 0 };
      }
      return { ...state, items: newItems };
    }
    case 'CLEAR_CART':
      return { items: [], restaurantId: null, restaurantName: null, deliveryFee: 0 };
    default:
      return state;
  }
};

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, {
    items: [],
    restaurantId: null,
    restaurantName: null,
    deliveryFee: 0,
  });

  const addItem = (item, restaurant) => dispatch({ type: 'ADD_ITEM', payload: { item, restaurant } });
  const removeItem = (itemId) => dispatch({ type: 'REMOVE_ITEM', payload: itemId });
  const clearCart = () => dispatch({ type: 'CLEAR_CART' });

  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + cart.deliveryFee + tax) * 100) / 100;
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addItem, removeItem, clearCart, subtotal, tax, total, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
