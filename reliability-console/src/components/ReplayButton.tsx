'use client';

import { useState } from 'react';
import { RefreshCcw, Check, X } from 'lucide-react';
import { replayDlqEventAction } from '@/app/actions';

export default function ReplayButton({ eventId, isReplayed }: { eventId: string, isReplayed: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (isReplayed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-400 rounded cursor-not-allowed">
        <Check className="w-3.5 h-3.5" /> Replayed
      </span>
    );
  }

  const handleReplay = async () => {
    if (!confirm('Are you sure you want to replay this event to the main queue?')) return;
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    const result = await replayDlqEventAction(eventId);
    
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleReplay}
        disabled={loading || success}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
          success 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : loading
            ? 'bg-blue-600/50 text-blue-300 cursor-wait'
            : 'bg-blue-600 hover:bg-blue-500 text-white shadow shadow-blue-900/20'
        }`}
      >
        {loading ? (
          <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
        ) : success ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <RefreshCcw className="w-3.5 h-3.5" />
        )}
        {loading ? 'Replaying...' : success ? 'Requeued' : 'Replay Event'}
      </button>
      {error && (
        <span className="text-xs text-red-400 flex items-center gap-1">
          <X className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
