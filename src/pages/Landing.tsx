import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, Shield, BarChart3, CreditCard, Bell, TrendingUp, CheckCircle2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { usePricingTiers } from '@/hooks/usePricingTiers';
import { useUserRole } from '@/hooks/useUserRole';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.3, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

const features = [
  { icon: CreditCard, title: 'Bill Tracking', desc: 'Track every subscription and bill in one unified dashboard with smart categorization.' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Never miss a payment. Get intelligent reminders before bills are due.' },
  { icon: BarChart3, title: 'Spending Analytics', desc: 'Interactive charts and AI-powered insights to optimize your spending.' },
  { icon: Shield, title: 'Bank-Grade Security', desc: 'Your financial data is encrypted end-to-end with enterprise-level protection.' },
  { icon: TrendingUp, title: 'Trend Analysis', desc: 'Spot spending patterns and forecast future expenses with precision.' },
  { icon: Zap, title: 'Instant Sync', desc: 'Real-time updates across all your devices. Always up to date.' },
];

const stats = [
  { value: '50K+', label: 'Active Users' },
  { value: '$2.4M', label: 'Bills Tracked' },
  { value: '99.9%', label: 'Uptime' },
  { value: '4.9★', label: 'App Rating' },
];

const testimonials = [
  { name: 'Sarah Chen', role: 'Product Manager', text: 'Completely transformed how I manage subscriptions. Saved me $340/month by catching duplicate charges.', avatar: 'SC' },
  { name: 'Marcus Rivera', role: 'Freelancer', text: 'The AI insights are incredible. It predicted my spending pattern and helped me budget three months ahead.', avatar: 'MR' },
  { name: 'Emily Nakamura', role: 'Startup Founder', text: 'Best financial tool I\'ve used. The interface is gorgeous and the analytics are genuinely useful.', avatar: 'EN' },
];

function formatPrice(monthly: number, period: string) {
  if (period === 'forever') return { price: '$0', suffix: '/forever' };
  if (period === 'year') return { price: `$${monthly}`, suffix: '/year' };
  return { price: `$${monthly}`, suffix: '/month' };
}

export default function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const { settings } = useSiteSettings();
  const { tiers } = usePricingTiers();

  const Logo = () => settings.logo_url ? (
    <img src={settings.logo_display_url || settings.logo_url || ''} alt={settings.brand_name} className="w-8 h-8 rounded-lg object-contain" />
  ) : (
    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
      <Zap className="w-4 h-4 text-primary-foreground" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-bold text-lg tracking-tight">{settings.brand_name}</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>Admin</Button>}
            {session ? (
              <Button onClick={() => navigate('/dashboard')} size="sm">Dashboard</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
                <Button size="sm" onClick={() => navigate('/login')}>
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-accent/6 rounded-full blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm mb-8">
            <Star className="w-3.5 h-3.5" /> Now with AI-powered insights
          </motion.div>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1}
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6">
            {settings.hero_headline}
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            {settings.hero_subheadline}
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-12" onClick={() => navigate('/login')}>
              {settings.hero_cta_label} <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8 h-12" onClick={() => navigate('/dashboard')}>
              View Demo
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="py-12 border-y border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-8 px-6">
          {stats.map((s, i) => (
            <motion.div key={s.label} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}
              className="text-center">
              <div className="text-3xl md:text-4xl font-extrabold text-primary font-mono">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="features" className="py-24 md:py-32 px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0}
            className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Everything you need to manage bills</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Powerful features designed to simplify your financial life.</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}
                className="group glass-card-hover rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-24 bg-card/30 border-y border-border/40 px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0}
            className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Loved by thousands</h2>
            <p className="text-muted-foreground text-lg">See what our users are saying.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}
                className="glass-card rounded-xl p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-primary text-primary" />)}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{t.avatar}</div>
                  <div>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 md:py-32 px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0}
            className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">Start free. Upgrade when you need more.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {tiers.map((t, i) => {
              const { price, suffix } = formatPrice(t.price_monthly, t.billing_period);
              return (
                <motion.div key={t.id} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}
                  className={`rounded-xl p-6 border ${t.is_highlighted ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border glass-card'}`}>
                  <h3 className="font-semibold text-lg mb-1">{t.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold">{price}</span>
                    <span className="text-muted-foreground text-sm">{suffix}</span>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {t.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={t.is_highlighted ? 'default' : 'outline'} onClick={() => navigate('/login')}>
                    {t.cta_label}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0}
          className="mx-auto max-w-3xl text-center glass-card rounded-2xl p-12 md:p-16 border border-primary/20">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Ready to simplify your bills?</h2>
          <p className="text-muted-foreground text-lg mb-8">Join 50,000+ users who've taken control of their finances.</p>
          <Button size="lg" className="text-base px-8 h-12" onClick={() => navigate('/login')}>
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </section>

      <footer className="border-t border-border/40 py-12 px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-semibold text-sm">{settings.brand_name}</span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {settings.brand_name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
