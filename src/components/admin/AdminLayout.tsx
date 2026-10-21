import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, IndianRupee, Palette, ImageIcon, ArrowLeft, LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';

const items = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/pricing', icon: IndianRupee, label: 'Pricing' },
  { to: '/admin/branding', icon: ImageIcon, label: 'Branding' },
  { to: '/admin/theme', icon: Palette, label: 'Theme' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { settings } = useSiteSettings();

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="w-60 border-r border-border/40 bg-card/30 backdrop-blur-xl flex flex-col">
        <div className="px-6 py-5 border-b border-border/40">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Admin</div>
          <div className="font-bold text-lg tracking-tight mt-0.5">{settings.brand_name}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border/40 space-y-1">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4" /> Back to app
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={() => { signOut(); navigate('/'); }}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {/* Admin pages are lazy-loaded; keep the sidebar visible while one loads. */}
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
