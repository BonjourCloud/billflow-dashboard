import { NavLink, Outlet } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

const tabs = [
  { to: '/budget/income', label: 'Income' },
  { to: '/budget/budgets', label: 'Budgets' },
  { to: '/budget/goals', label: 'Goals' },
  { to: '/budget/settings', label: 'Settings' },
];

export default function BudgetLayout() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <DashboardHeader />
        <nav className="flex gap-6 border-b border-border/40 mb-6" aria-label="Budget sections">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `py-3 -mb-px text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
