import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Receipt, Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useSiteSettings } from '@/hooks/useSiteSettings';

export function DashboardHeader() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('billflow_theme');
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
    return !document.documentElement.classList.contains('light');
  });
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { settings } = useSiteSettings();

  useEffect(() => {
    localStorage.setItem('billflow_theme', isDark ? 'dark' : 'light');
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

  return (
    <header className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-2xl bg-primary/10 overflow-hidden">
          {settings.logo_url ? (
            <img src={settings.logo_display_url || settings.logo_url || ''} alt={settings.brand_name} className="w-5 h-5 object-contain" />
          ) : (
            <Receipt className="w-5 h-5 text-primary" />
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{settings.brand_name}</h1>
          <p className="text-xs text-muted-foreground">Subscriptions & Bill Management</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
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
  );
}
