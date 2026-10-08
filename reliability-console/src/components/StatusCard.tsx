import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface StatusCardProps {
  title: string;
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  details?: string;
}

export default function StatusCard({ title, status, details }: StatusCardProps) {
  let bg = 'bg-white border-gray-200 shadow-sm';
  let icon = <div className="w-6 h-6 rounded-full bg-slate-200 animate-pulse" />;
  let text = 'text-slate-500';

  if (status === 'healthy') {
    bg = 'bg-emerald-50 border-emerald-200 shadow-sm';
    icon = <CheckCircle className="w-6 h-6 text-emerald-600" />;
    text = 'text-emerald-700';
  } else if (status === 'degraded') {
    bg = 'bg-yellow-50 border-yellow-200 shadow-sm';
    icon = <AlertTriangle className="w-6 h-6 text-yellow-600" />;
    text = 'text-yellow-700';
  } else if (status === 'unavailable') {
    bg = 'bg-red-50 border-red-200 shadow-sm';
    icon = <XCircle className="w-6 h-6 text-red-600" />;
    text = 'text-red-700';
  }

  return (
    <div className={`p-4 rounded-xl border ${bg} transition-colors flex items-center justify-between`}>
      <div>
        <h3 className="font-bold text-blue-900">{title}</h3>
        <p className={`text-sm mt-1 capitalize font-bold ${text}`}>
          {status} {details && <span className="text-slate-500 text-xs ml-2 normal-case font-medium">({details})</span>}
        </p>
      </div>
      <div>{icon}</div>
    </div>
  );
}
