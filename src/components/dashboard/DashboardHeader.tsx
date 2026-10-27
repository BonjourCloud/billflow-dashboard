import { DemoBanner } from '@/components/DemoBanner';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Receipt, Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function DashboardHeader() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('billwill_theme');
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
    return !document.documentElement.classList.contains('light');
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { settings } = useSiteSettings();

  useEffect(() => {
    localStorage.setItem('billwill_theme', isDark ? 'dark' : 'light');
    if (!isDark) {
      document.documentElement.classList.add('light');
      document.documentElement.style.removeProperty('--background');
    } else {
      document.documentElement.classList.remove('light');
      if (settings?.theme_background_hsl) {
        document.documentElement.style.setProperty(
          '--background',
          settings.theme_background_hsl,
        );
      }
    }
  }, [isDark, settings]);

  const isBillsActive =
    location.pathname === '/dashboard' ||
    location.pathname.startsWith('/bill/');
  const isInstallmentsActive =
    location.pathname === '/installments' ||
    location.pathname.startsWith('/installments');
  const isSubsActive = location.pathname === '/subscriptions';
  const isBudgetActive = location.pathname.startsWith('/budget');

  return (
    <>
    <DemoBanner />
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-3">
        {settings.logo_url ? (
          <img
            src={settings.logo_display_url || settings.logo_url || ''}
            alt={settings.brand_name}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-contain shrink-0"
          />
        ) : (
          <div className="p-2 rounded-2xl bg-primary/10 overflow-hidden">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight">{settings.brand_name}</h1>
          <p className="text-xs text-muted-foreground">Subscriptions & Bill Management</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-2xl border border-border/40">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            isBillsActive
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Bills
        </button>
        <button
          type="button"
          onClick={() => navigate('/installments')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            isInstallmentsActive
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Installments
        </button>
        <button
          type="button"
          onClick={() => navigate('/subscriptions')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            isSubsActive
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Subscriptions
        </button>
        <button
          type="button"
          onClick={() => navigate('/budget')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            isBudgetActive
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Budget
        </button>
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell />
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-2">
            <Shield className="w-4 h-4" /> Admin
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDark(!isDark)}
          className="rounded-xl active:scale-95 transition-transform"
          title="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        {user && (
          <Button variant="ghost" size="icon" onClick={() => { signOut(); navigate('/'); }} title="Sign out" className="rounded-xl">
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </header>
    </>
  );
}
