// No lucide-react icons needed
import StatCard from '../../components/StatCard';
import { api } from '../../lib/api-client';
import AutoRefresh from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function ObservabilityPage() {
  const reqTotal = await api.prometheus.query('sum(http_requests_total)');
  const totalRequests = reqTotal?.[0]?.value?.[1] ? parseInt(reqTotal[0].value[1]) : 0;

  const errTotal = await api.prometheus.query('sum(http_requests_total{code=~"5.."})');
  const totalErrors = errTotal?.[0]?.value?.[1] ? parseInt(errTotal[0].value[1]) : 0;

  const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00';

  const circuitBreakerData = await api.prometheus.query('sum(circuit_breaker_events_total{state="OPEN"})');
  const circuitBreakerOpenCount = circuitBreakerData?.[0]?.value?.[1] ? parseInt(circuitBreakerData[0].value[1]) : 0;

  const eventProcData = await api.prometheus.query('sum(event_processing_total{status="failed"})');
  const eventFailures = eventProcData?.[0]?.value?.[1] ? parseInt(eventProcData[0].value[1]) : 0;

  const retriesData = await api.prometheus.query('sum(retry_attempts_total)');
  const retryCount = retriesData?.[0]?.value?.[1] ? parseInt(retriesData[0].value[1]) : 0;

  const outboxData = await api.prometheus.query('sum(outbox_pending_events)');
  const outboxPending = outboxData?.[0]?.value?.[1] ? parseInt(outboxData[0].value[1]) : 0;

  const getMetricSafe = (data: any) => data?.[0]?.value?.[1] ? parseFloat(data[0].value[1]) : 0;

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={5000} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Observability Metrics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time backend telemetry gathered from Prometheus.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Total HTTP Requests"
          value={totalRequests.toString()}
        />
        <StatCard
          title="Global Error Rate"
          value={`${errorRate}%`}
          urgent={parseFloat(errorRate) > 5}
        />
        <StatCard
          title="Circuit Breaker Trips"
          value={circuitBreakerOpenCount.toString()}
          urgent={circuitBreakerOpenCount > 0}
        />
        <StatCard
          title="Consumer Failures"
          value={eventFailures.toString()}
          urgent={eventFailures > 0}
        />
        <StatCard
          title="System Retries"
          value={retryCount.toString()}
        />
        <StatCard
          title="Pending Outbox"
          value={outboxPending.toString()}
          urgent={outboxPending > 10}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-gray-100 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-800">Distributed Tracing</h3>
          <p className="text-xs text-slate-500 mt-1">Investigate request traces</p>
        </div>
        <div className="p-6">
          <p className="text-slate-600 text-sm">
            OpenTelemetry is capturing spans across the User and Order services. 
            To view detailed waterfall traces of the requests, open Jaeger:
          </p>
          <a href="http://localhost:16686" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            Open Jaeger UI
          </a>
        </div>
      </div>
    </div>
  );
}
