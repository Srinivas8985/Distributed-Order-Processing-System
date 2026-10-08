'use client';
import { useState } from 'react';

export default function EventPayload({ payload }: { payload: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

  return (
    <div>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
      >
        {isOpen ? 'Hide Payload' : 'View Payload'}
      </button>
      {isOpen && (
        <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded text-xs text-slate-300 overflow-x-auto">
          {data}
        </pre>
      )}
    </div>
  );
}
