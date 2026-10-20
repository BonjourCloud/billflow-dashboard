import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Palette, ImageIcon, Users, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { usePricingTiers } from '@/hooks/usePricingTiers';

export default function AdminDashboard() {
  const { settings } = useSiteSettings();
  const { tiers } = usePricingTiers({ includeHidden: true });
  const [adminCount, setAdminCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    apiRequest<{ adminCount: number; pricingTiersCount: number }>('/api/admin/summary')
      .then((data) => {
        if (mounted) {
          setAdminCount(data.adminCount ?? 0);
        }
      })
      .catch((err) => {
        console.error('Failed to load admin summary:', err);
        if (mounted) {
          setAdminCount(0);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cards = [
    { to: '/admin/pricing', icon: DollarSign, label: 'Pricing tiers', value: `${tiers.length} tiers`, desc: 'Edit Free / Pro / Enterprise plans' },
    { to: '/admin/branding', icon: ImageIcon, label: 'Branding', value: settings.brand_name, desc: 'Logo, brand name, hero copy' },
    { to: '/admin/theme', icon: Palette, label: 'Theme', value: settings.theme_font_pair, desc: 'Colors and typography' },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Admin overview</h1>
        <p className="text-muted-foreground">Manage pricing, branding, and theme. Changes go live immediately.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {cards.map(c => (
          <Link key={c.to} to={c.to}
            className="group glass-card-hover rounded-2xl p-5 block">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</div>
            <div className="font-semibold text-lg mt-0.5 truncate">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          {adminCount === null ? 'Loading admins…' : `${adminCount} admin${adminCount === 1 ? '' : 's'} configured`}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Grant or revoke admin access in the{' '}
          <Link to="/admin/users" className="text-primary underline hover:text-primary/80">
            Users tab
          </Link>{' '}
          or configure <code className="font-mono-data text-foreground">ADMIN_CLERK_USER_IDS</code>.
        </p>
      </div>
    </div>
  );
}
