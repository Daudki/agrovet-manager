import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './layouts/AppShell.jsx';
import { Loading } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';

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

function Protected() {
  const { account, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!account) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <AppShell><Suspense fallback={<Loading />}><Outlet /></Suspense></AppShell>;
}

function Public() {
  const { account, loading } = useAuth();
  if (loading) return <Loading />;
  if (account) return <Navigate to="/" replace />;
  return <Suspense fallback={<Loading />}><Outlet /></Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Public />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
