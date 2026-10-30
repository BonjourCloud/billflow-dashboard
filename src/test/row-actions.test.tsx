import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pencil, Trash2 } from 'lucide-react';
import { RowActions } from '@/components/RowActions';

describe('RowActions', () => {
  it('renders always-visible, labelled buttons that fire their handlers', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <RowActions
        actions={[
          { label: 'Edit Rent', icon: Pencil, onClick: onEdit },
          { label: 'Delete Rent', icon: Trash2, tone: 'danger', onClick: onDelete },
        ]}
      />,
    );
    const edit = screen.getByRole('button', { name: 'Edit Rent' });
    const del = screen.getByRole('button', { name: 'Delete Rent' });
    expect(edit.className).not.toMatch(/opacity-0/);
    expect(edit.parentElement?.className ?? '').not.toMatch(/opacity-0|group-hover/);
    expect(del).toHaveAttribute('title', 'Delete Rent');
    fireEvent.click(edit);
    fireEvent.click(del);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
