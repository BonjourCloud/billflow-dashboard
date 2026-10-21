import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroWidget } from '@/components/dashboard/HeroWidget';
import { UpcomingBillsWidget } from '@/components/dashboard/UpcomingBillsWidget';
import type { Bill } from '@/data/bills';

describe('dashboard widgets display Indian Rupees', () => {
  it('HeroWidget shows monthly flow and status totals in INR', () => {
    const { container } = render(
      <HeroWidget
        totalAmount={210759}
        paidAmount={200000}
        pendingAmount={5000}
        overdueAmount={5759}
        paidPercent={94.9}
        paidCount={3}
        pendingCount={1}
        overdueCount={1}
      />,
    );

    expect(screen.getByText('₹2,10,759.00')).toBeInTheDocument();
    // Paid total appears in the progress summary and the Paid card.
    expect(screen.getAllByText('₹2,00,000.00')).toHaveLength(2);
    expect(screen.getByText('₹5,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹5,759.00')).toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });

  it('UpcomingBillsWidget shows bill amounts in INR', () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const bills: Bill[] = [
      {
        _id: 'b1',
        name: 'Home Loan EMI',
        amount: 16666.66,
        dueDate: soon,
        status: 'pending',
        category: 'housing',
        isSubscription: false,
      },
      {
        _id: 'b2',
        name: 'Broadband',
        amount: 759,
        dueDate: soon,
        status: 'pending',
        category: 'utilities',
        isSubscription: true,
      },
    ];

    const { container } = render(
      <MemoryRouter>
        <UpcomingBillsWidget bills={bills} />
      </MemoryRouter>,
    );

    expect(screen.getByText('₹16,666.66')).toBeInTheDocument();
    expect(screen.getByText('₹759.00')).toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });
});
