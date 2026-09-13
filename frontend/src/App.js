import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Link } from 'react-router-dom';
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

// Merchant/staff screens get a clean portal chrome instead of the
// customer navbar (no search, cart, or 'List Your Restaurant').
function Shell() {
  const [cartOpen, setCartOpen] = React.useState(false);
  const { pathname } = useLocation();
  const isMerchantArea = /^\/(merchant|admin|kitchen|login|setup)/.test(pathname);
  const isKiosk = pathname.startsWith('/kiosk');

  return (
        <div className="app">
          {isKiosk ? null : isMerchantArea ? (
            <nav className="portal-nav">
              <Link to="/" className="portal-brand">🛵 App-Thru <span>Merchant</span></Link>
            </nav>
          ) : (
            <Navbar onCartClick={() => setCartOpen(true)} />
          )}
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
          {!isMerchantArea && !isKiosk && (
            <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />
          )}
        </div>
  );
}

function App() {
  return (
    <CartProvider>
      <Router>
        <Shell />
      </Router>
    </CartProvider>
  );
}

export default App;
