import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import Navbar from './components/Navbar';
import CartSidebar from './components/CartSidebar';
import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Search from './pages/Search';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import Orders from './pages/Orders';
import KitchenPickup from './pages/KitchenPickup';
import VoiceOrder from './pages/VoiceOrder';
import Kiosk from './pages/Kiosk';
import KioskSelect from './pages/KioskSelect';
import RestaurantAdmin from './pages/RestaurantAdmin';
import MerchantRegister from './pages/MerchantRegister';
import MerchantLogin from './pages/MerchantLogin';
import MerchantDashboard from './pages/MerchantDashboard';
import SetupGuide from './pages/SetupGuide';

function App() {
  const [cartOpen, setCartOpen] = React.useState(false);

  return (
    <CartProvider>
      <Router>
        <div className="app">
          <Navbar onCartClick={() => setCartOpen(true)} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/restaurant/:id" element={<Restaurant />} />
              <Route path="/search" element={<Search />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:id" element={<OrderConfirmation />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/kitchen" element={<KitchenPickup />} />
              <Route path="/voice" element={<VoiceOrder />} />
              <Route path="/kiosk" element={<KioskSelect />} />
              <Route path="/kiosk/:restaurantId" element={<Kiosk />} />
              <Route path="/admin/:id" element={<RestaurantAdmin />} />
              <Route path="/register" element={<MerchantRegister />} />
              <Route path="/login" element={<MerchantLogin />} />
              <Route path="/merchant/:id" element={<MerchantDashboard />} />
              <Route path="/setup/:id" element={<SetupGuide />} />
            </Routes>
          </main>
          <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />
        </div>
      </Router>
    </CartProvider>
  );
}

export default App;
