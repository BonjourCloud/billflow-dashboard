import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteSettingsProvider } from "@/hooks/useSiteSettings";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Signed-in and admin pages load on demand so the public landing page does not
// download the dashboard, charts, and admin panel up front.
const Index = lazy(() => import("./pages/Index"));
const BillDetail = lazy(() => import("./pages/BillDetail"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Installments = lazy(() => import("./pages/Installments"));
const InstallmentDetail = lazy(() => import("./pages/InstallmentDetail"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminBranding = lazy(() => import("./pages/admin/AdminBranding"));
const AdminTheme = lazy(() => import("./pages/admin/AdminTheme"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SiteSettingsProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/installments" element={<ProtectedRoute><Installments /></ProtectedRoute>} />
                <Route path="/installments/:id" element={<ProtectedRoute><InstallmentDetail /></ProtectedRoute>} />
                <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
                <Route path="/bill/:id" element={<ProtectedRoute><BillDetail /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="pricing" element={<AdminPricing />} />
                  <Route path="branding" element={<AdminBranding />} />
                  <Route path="theme" element={<AdminTheme />} />
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </SiteSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
