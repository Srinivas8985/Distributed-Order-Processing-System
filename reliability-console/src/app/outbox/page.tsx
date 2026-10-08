import { api } from '@/lib/api-client';
import AutoRefresh from '@/components/AutoRefresh';
import EventPayload from '@/components/EventPayload';
import { format } from 'date-fns';

export default async function OutboxPage() {
  const events = await api.order.getOutboxEvents();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <AutoRefresh intervalMs={15000} />
      
      <header>
        <h1 className="text-3xl font-bold text-blue-900 tracking-tight">Outbox Monitoring</h1>
        <p className="text-slate-500 mt-1">Monitor the transactional outbox table in the Order Service.</p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-slate-500 border-b border-gray-200">
              <tr>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Attempts</th>
                <th className="px-5 py-4 font-semibold">Created At</th>
                <th className="px-5 py-4 font-semibold">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!Array.isArray(events) || events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500 font-medium">No outbox events found.</td>
                </tr>
              ) : (
                events.map((e: any) => (
                  <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-5 py-4 font-mono text-slate-700 font-medium">{e.eventType}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold tracking-wide ${
                        e.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                        e.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-700 font-bold">{e.attempts}</td>
                    <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                      {format(new Date(e.createdAt), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="px-5 py-4 max-w-xs">
                      <EventPayload payload={e.payload} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
