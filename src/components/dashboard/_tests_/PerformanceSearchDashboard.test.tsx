/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ISplitTransactionRecord } from '@/types/search';

import PerformanceSearchDashboard from '../PerformanceSearchDashboard';

const MOCK_DATA: ISplitTransactionRecord[] = [
  {
    id: '1',
    title: 'Escrow Grant Finalization',
    amount: '5000',
    assetSymbol: 'XLM',
    senderAddress: 'GABC123',
    timestamp: '2026-01-01',
    category: 'escrow',
  },
  {
    id: '2',
    title: 'Direct Operational Fee Split',
    amount: '120',
    assetSymbol: 'USDC',
    senderAddress: 'GXYZ789',
    timestamp: '2026-01-02',
    category: 'fee_allocation',
  },
];

describe('PerformanceSearchDashboard — Concurrent useTransition Pipeline', () => {
  it('should process structural typing updates concurrently without blocking internal fields', async () => {
    render(<PerformanceSearchDashboard initialTransactions={MOCK_DATA} />);

    const searchBar = screen.getByPlaceholderText(/Search by title/i) as HTMLInputElement;

    // Simulate input typing event loops
    await act(async () => {
      fireEvent.change(searchBar, { target: { value: 'Escrow' } });
    });

    // The text input field receives state updates immediately
    expect(searchBar.value).toBe('Escrow');
  });

  it('should cleanly transition between selected filtering categories', async () => {
    render(<PerformanceSearchDashboard initialTransactions={MOCK_DATA} />);

    const dropdown = screen.getByLabelText(/Filter by distribution track category/i);

    await act(async () => {
      fireEvent.change(dropdown, { target: { value: 'fee_allocation' } });
    });

    expect(screen.getByText('Direct Operational Fee Split')).toBeTruthy();
    expect(screen.queryByText('Escrow Grant Finalization')).toBeNull();
  });
});
