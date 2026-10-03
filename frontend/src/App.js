import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Link } from 'react-router-dom';
import { CartProvider, useCart } from './context/CartContext';
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
import OrderBoard from './pages/OrderBoard';
import { Privacy, Support } from './pages/Legal';
import { SignIn, AccountPage } from './pages/Account';
import AppHome from './pages/AppHome';
import { isNativeApp, getCustomerToken, isGuest, openInBrowser } from './utils/customer';

// Mobile app bottom tabs
function TabBar({ onCart }) {
  const { pathname } = useLocation();
  const { itemCount } = useCart();
  const tab = (to, label, icon, active) => (
    <Link to={to} className={`tab ${active ? 'on' : ''}`}><span className="tab-ic">{icon}</span><span>{label}</span></Link>
  );
  return (
    <nav className="app-tabbar">
      {tab('/', 'Home', '⌂', pathname === '/')}
      {tab('/orders', 'Orders', '☰', pathname.startsWith('/orders') || pathname.startsWith('/order/'))}
      <button type="button" className="tab" onClick={onCart}>
        <span className="tab-ic">🛍{itemCount > 0 && <b className="tab-badge">{itemCount}</b>}</span><span>Cart</span>
      </button>
      {tab('/account', 'Account', '◯', pathname.startsWith('/account'))}
    </nav>
  );
}

// In the mobile app: start at sign-in, and send restaurant/merchant pages
// to the phone's browser instead of showing them inside the app.
const MERCHANT_PATHS = /^\/(register|login|merchant|admin|kitchen|setup|kiosk|board)/;
const OPEN_PATHS = /^\/(signin|privacy|support)/;
function NativeGate() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (!isNativeApp()) return;
    if (MERCHANT_PATHS.test(pathname)) {
      openInBrowser(pathname + search);
      navigate('/', { replace: true });
      return;
    }
    if (!getCustomerToken() && !isGuest() && !OPEN_PATHS.test(pathname)) {
      navigate('/signin', { replace: true });
    }
  }, [pathname, search, navigate]);
  return null;
}

// Merchant/staff screens get a clean portal chrome instead of the
// customer navbar (no search, cart, or 'List Your Restaurant').
function Shell() {
  const [cartOpen, setCartOpen] = React.useState(false);
  const { pathname } = useLocation();
  const isMerchantArea = /^\/(merchant|admin|kitchen|login|setup)/.test(pathname);
  const isKiosk = pathname.startsWith('/kiosk') || pathname.startsWith('/board');
  const native = isNativeApp();
  const isAuth = pathname.startsWith('/signin');

  return (
        <div className={`app ${native && !isAuth ? 'has-tabbar' : ''}`}>
          <NativeGate />
          {isKiosk || isAuth || (native && /^\/(account|orders)?$/.test(pathname)) ? null : isMerchantArea ? (
            <nav className="portal-nav">
              <Link to="/" className="portal-brand">🛵 App-Thru <span>Merchant</span></Link>
            </nav>
          ) : (
            <Navbar onCartClick={() => setCartOpen(true)} />
          )}
          <main className="main-content">
            <Routes>
              <Route path="/" element={native ? <AppHome /> : <Home />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/restaurant/:id" element={<Restaurant />} />
              <Route path="/search" element={<Search />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:id" element={<OrderConfirmation />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/kitchen" element={<KitchenPickup />} />
              <Route path="/voice" element={<VoiceOrder />} />
              <Route path="/kiosk" element={<KioskSelect />} />
              <Route path="/kiosk/:restaurantId" element={<Kiosk />} />
              <Route path="/board/:restaurantId" element={<OrderBoard />} />
              <Route path="/admin/:id" element={<RestaurantAdmin />} />
              <Route path="/register" element={<MerchantRegister />} />
              <Route path="/login" element={<MerchantLogin />} />
              <Route path="/merchant/:id" element={<MerchantDashboard />} />
              <Route path="/setup/:id" element={<SetupGuide />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/support" element={<Support />} />
            </Routes>
          </main>
          {native && !isAuth && !isMerchantArea && !isKiosk && <TabBar onCart={() => setCartOpen(true)} />}
          {!isMerchantArea && !isKiosk && !isAuth && (
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
