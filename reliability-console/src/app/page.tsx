import { api } from '@/lib/api-client';
import StatusCard from '@/components/StatusCard';
import StatCard from '@/components/StatCard';
import AutoRefresh from '@/components/AutoRefresh';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default async function Dashboard() {
  const [userHealth, orderHealth, outboxStats, dlqEvents] = await Promise.all([
    api.user.health(),
    api.order.health(),
    api.order.getOutboxStats(),
    api.user.getDlqEvents(),
  ]);

  const userDbStatus = userHealth.services?.database?.status || 'unknown';
  const orderDbStatus = orderHealth.services?.database?.status || 'unknown';
  const rabbitmqStatus = orderHealth.services?.rabbitmq?.status || 'unknown';

  const recentOutbox = await api.order.getOutboxEvents();
  const latestOutbox = Array.isArray(recentOutbox) ? recentOutbox.slice(0, 5) : [];
  
  const dlqCount = Array.isArray(dlqEvents) ? dlqEvents.length : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <AutoRefresh intervalMs={15000} />
      
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight">System Status</h1>
          <p className="text-slate-500 mt-1">Real-time overview of the distributed control plane.</p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatusCard title="User Service" status={userHealth.status} />
        <StatusCard title="Order Service" status={orderHealth.status} />
        <StatusCard title="RabbitMQ Broker" status={rabbitmqStatus} />
        <StatusCard title="User Database" status={userDbStatus} />
        <StatusCard title="Order Database" status={orderDbStatus} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Outbox Pending" value={outboxStats?.pending ?? '-'} />
        <StatCard title="Outbox Published" value={outboxStats?.published ?? '-'} />
        <StatCard title="Outbox Failed" value={outboxStats?.failed ?? '-'} urgent={(outboxStats?.failed ?? 0) > 0} />
        <StatCard title="Dead Letter Queue" value={dlqCount} urgent={dlqCount > 0} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <h2 className="text-lg font-bold text-blue-900">Recent Outbox Events</h2>
            <Link href="/outbox" className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">View All &rarr;</Link>
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-slate-500 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {latestOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-500">No recent events</td>
                  </tr>
                ) : (
                  latestOutbox.map((e: any) => (
                    <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-700">{e.eventType}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          e.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                          e.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {formatDistanceToNow(new Date(e.createdAt))} ago
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <h2 className="text-lg font-bold text-blue-900">Poison Messages (DLQ)</h2>
            <Link href="/dlq" className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">Manage DLQ &rarr;</Link>
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-slate-500 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Event ID</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold text-right">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!Array.isArray(dlqEvents) || dlqEvents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-500">No dead letter events. System is healthy.</td>
                  </tr>
                ) : (
                  dlqEvents.slice(0, 5).map((e: any) => (
                    <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-600 truncate max-w-[120px]">{e.eventId}</td>
                      <td className="px-5 py-3 text-slate-700">{e.eventType}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-bold">
                        {e.attemptCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
