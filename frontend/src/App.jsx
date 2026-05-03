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
import RoleSelection from "./pages/onboarding/RoleSelection";
import Pricing from "./pages/Pricing";
import Payment from "./pages/Payment";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  // Only redirect to onboarding when the fields are explicitly present and incomplete.
  // If onboarding_complete is undefined (old login token without the field), skip guard
  // so existing sessions aren't disrupted until next login.
  const hasOnboardingData = "onboarding_complete" in user;
  if (hasOnboardingData && (!user.onboarding_role || user.onboarding_complete === false)) {
    return <Navigate to="/onboarding/role" replace />;
  }

  return children;
}

function OnboardingRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // If already onboarded, skip to dashboard
  if (user.onboarding_role && user.onboarding_complete !== false) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
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
      <Route path="/auth/callback"  element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Static pages — always accessible */}
      <Route path="/about"   element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms"   element={<Terms />} />

      {/* Pricing — accessible to all, personalised when logged in */}
      <Route path="/pricing" element={<Pricing />} />

      {/* Onboarding flow */}
      <Route path="/onboarding"      element={<ProtectedRoute><WorkspaceSetup /></ProtectedRoute>} />
      <Route path="/onboarding/role" element={<OnboardingRoute><RoleSelection /></OnboardingRoute>} />

      {/* Payment — must be logged in */}
      <Route path="/payment" element={
        <RequireAuth><Payment /></RequireAuth>
      } />

      {/* Protected app routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAuth({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
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
