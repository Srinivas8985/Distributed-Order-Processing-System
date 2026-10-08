import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatCard from '@/components/StatCard';
import StatusCard from '@/components/StatusCard';
import ReplayButton from '@/components/ReplayButton';

// Mock the server action
jest.mock('@/app/actions', () => ({
  replayDlqEventAction: jest.fn().mockResolvedValue({ success: true })
}));

describe('StatCard', () => {
  it('renders correctly with normal values', () => {
    render(<StatCard title="Outbox Pending" value={5} />);
    expect(screen.getByText('Outbox Pending')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders correctly with urgent styling when urgent=true', () => {
    render(<StatCard title="Outbox Failed" value={2} urgent={true} />);
    const valueEl = screen.getByText('2');
    expect(valueEl).toHaveClass('text-red-500');
  });
});

describe('StatusCard', () => {
  it('renders healthy status', () => {
    render(<StatusCard title="User Service" status="healthy" />);
    expect(screen.getByText('User Service')).toBeInTheDocument();
    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
  });

  it('renders unavailable status', () => {
    render(<StatusCard title="RabbitMQ Broker" status="unavailable" />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});

describe('ReplayButton', () => {
  it('renders already replayed state correctly', () => {
    render(<ReplayButton eventId="123" isReplayed={true} />);
    expect(screen.getByText(/Replayed/i)).toBeInTheDocument();
  });

  it('handles click and confirms replay successfully', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    
    render(<ReplayButton eventId="123" isReplayed={false} />);
    const btn = screen.getByRole('button', { name: /Replay Event/i });
    
    fireEvent.click(btn);
    
    expect(window.confirm).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(screen.getByText(/Requeued/i)).toBeInTheDocument();
    });
  });
});
