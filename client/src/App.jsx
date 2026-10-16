import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './layouts/AppShell.jsx';
import { Loading } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useLocale } from './lib/i18n.js';
import { Empty } from './components/ui.jsx';
import { ShieldAlert } from 'lucide-react';

import { t } from './lib/i18n.js';
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const POS = lazy(() => import('./pages/POS.jsx'));
const Sales = lazy(() => import('./pages/Sales.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const Stock = lazy(() => import('./pages/Stock.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Suppliers = lazy(() => import('./pages/Suppliers.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Team = lazy(() => import('./pages/Team.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

function Protected() {
  const { account, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!account) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <AppShell><Suspense fallback={<Loading />}><Outlet /></Suspense></AppShell>;
}

/** Hides a route from people whose role lacks `perm` (the server enforces the same rules). */
function Guard({ perm, children }) {
  const { can } = useAuth();
  if (can(perm)) return children;
  return <div className="card"><Empty icon={ShieldAlert} title={t('You don’t have access to this page')}>{t('Ask the shop owner if you need it.')}</Empty></div>;
}

function Home() {
  const { can } = useAuth();
  return can('dashboard.view') ? <Dashboard /> : <Navigate to="/pos" replace />;
}

function Public() {
  const { account, loading } = useAuth();
  if (loading) return <Loading />;
  if (account) return <Navigate to="/" replace />;
  return <Suspense fallback={<Loading />}><Outlet /></Suspense>;
}

export default function App() {
  const locale = useLocale();
  // Keying on the language remounts the pages so every string is re-translated.
  return (
    <Routes key={locale}>
      <Route element={<Public />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="/pos" element={<Guard perm="sell"><POS /></Guard>} />
        <Route path="/sales" element={<Guard perm="sales.view"><Sales /></Guard>} />
        <Route path="/products" element={<Guard perm="products.view"><Products /></Guard>} />
        <Route path="/stock" element={<Guard perm="stock.manage"><Stock /></Guard>} />
        <Route path="/purchases" element={<Guard perm="stock.manage"><Purchases /></Guard>} />
        <Route path="/categories" element={<Guard perm="categories.manage"><Categories /></Guard>} />
        <Route path="/suppliers" element={<Guard perm="suppliers.manage"><Suppliers /></Guard>} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/expenses" element={<Guard perm="expenses.manage"><Expenses /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/team" element={<Guard perm="team.manage"><Team /></Guard>} />
        <Route path="/settings" element={<Guard perm="settings.manage"><Settings /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
