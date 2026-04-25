import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import WorkspaceSetup from "./pages/WorkspaceSetup";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  return !user ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public marketing & auth routes */}
      <Route path="/"              element={<PublicRoute><Home /></PublicRoute>} />
      <Route path="/login"         element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register"      element={<PublicRoute><Register /></PublicRoute>} />

      {/* OAuth callback — accessible without auth (processes token from URL) */}
      <Route path="/auth/callback"     element={<AuthCallback />} />
      <Route path="/reset-password"    element={<ResetPassword />} />

      {/* Static pages — always accessible */}
      <Route path="/about"         element={<About />} />
      <Route path="/contact"       element={<Contact />} />
      <Route path="/privacy"       element={<Privacy />} />
      <Route path="/terms"         element={<Terms />} />

      {/* Protected app routes */}
      <Route path="/onboarding"    element={<ProtectedRoute><WorkspaceSetup /></ProtectedRoute>} />
      <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
