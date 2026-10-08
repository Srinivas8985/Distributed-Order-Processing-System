import { api } from '@/lib/api-client';
import AutoRefresh from '@/components/AutoRefresh';
import EventPayload from '@/components/EventPayload';
import ReplayButton from '@/components/ReplayButton';
import { format } from 'date-fns';
import { AlertOctagon } from 'lucide-react';

export default async function DlqPage() {
  const events = await api.user.getDlqEvents();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <AutoRefresh intervalMs={15000} />
      
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight flex items-center gap-3">
            <AlertOctagon className="w-8 h-8 text-red-600" />
            DLQ & Failure Management
          </h1>
          <p className="text-slate-500 mt-2">Manage poison messages, view failure reasons, and replay events.</p>
        </div>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-slate-500 border-b border-gray-200">
              <tr>
                <th className="px-5 py-4 font-semibold">Event Info</th>
                <th className="px-5 py-4 font-semibold">Failure Reason</th>
                <th className="px-5 py-4 font-semibold">Timing</th>
                <th className="px-5 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!Array.isArray(events) || events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="text-slate-700 font-bold">No Dead Letter Events</p>
                      <p className="text-slate-500 text-sm mt-1">The system is healthy.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                events.map((e: any) => (
                  <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-5 py-4 align-top">
                      <div className="font-mono text-slate-700 text-xs mb-1 truncate max-w-[200px]" title={e.eventId}>
                        {e.eventId}
                      </div>
                      <div className="text-blue-900 font-semibold">{e.eventType}</div>
                      <div className="mt-2 text-xs">
                        <span className="text-slate-500">Attempts: </span>
                        <span className="text-red-600 font-bold">{e.attemptCount}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top max-w-md">
                      <div className="text-red-700 bg-red-50 border border-red-100 p-2.5 rounded text-xs font-mono whitespace-pre-wrap overflow-y-auto max-h-32">
                        {e.failureReason}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-slate-600 whitespace-nowrap text-xs space-y-1.5">
                      <div><span className="text-slate-400 block font-semibold">First Failed</span> {format(new Date(e.firstFailureAt), 'MMM d, HH:mm:ss')}</div>
                      <div><span className="text-slate-400 block font-semibold">Last Failed</span> {format(new Date(e.latestFailureAt), 'MMM d, HH:mm:ss')}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <ReplayButton 
                        eventId={e.id} 
                        isReplayed={e.replayStatus === 'REPLAYED' || e.replayStatus === 'RESOLVED'} 
                      />
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

function Check({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
