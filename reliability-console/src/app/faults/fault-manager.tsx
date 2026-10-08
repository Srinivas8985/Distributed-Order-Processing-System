'use client';

import { useState } from 'react';
import { setFaultAction, disableAllFaultsAction } from '../actions';

interface FaultConfig {
  id: string;
  type: string;
  enabled: boolean;
  targetComponent: string;
  delayMs?: number;
  expiresAt?: string;
}

export function FaultManager({
  initialUserFaults,
  initialOrderFaults
}: {
  initialUserFaults: FaultConfig[];
  initialOrderFaults: FaultConfig[];
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const toggleFault = async (service: 'user' | 'order', id: string, config: any) => {
    setLoading(`${service}-${id}`);
    await setFaultAction(service, config);
    setLoading(null);
  };

  const disableAll = async (service: 'user' | 'order') => {
    setLoading(`disable-${service}`);
    await disableAllFaultsAction(service);
    setLoading(null);
  };

  const isEnabled = (faults: FaultConfig[], id: string) => {
    const f = faults.find(f => f.id === id);
    return f ? f.enabled : false;
  };

  const renderFaultCard = (service: 'user' | 'order', id: string, title: string, desc: string, type: string, targetComponent: string, faults: FaultConfig[]) => {
    const active = isEnabled(faults, id);
    
    return (
      <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between transition-colors ${active ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
        <div>
          <h3 className={`font-bold text-lg ${active ? 'text-red-900' : 'text-blue-900'}`}>{title}</h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">{desc}</p>
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${active ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
          <button
            disabled={loading === `${service}-${id}`}
            onClick={() => toggleFault(service, id, { id, type, enabled: !active, targetComponent, delayMs: type === 'delay' ? 3000 : undefined })}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg text-white shadow-sm transition-all ${
              active ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
            } disabled:opacity-50`}
          >
            {loading === `${service}-${id}` ? 'Updating...' : (active ? 'Disable' : 'Enable')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      {/* User Service Faults */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-blue-900">User Service Faults</h2>
          <button 
            onClick={() => disableAll('user')}
            disabled={loading === 'disable-user'}
            className="text-sm font-semibold text-slate-600 hover:text-blue-700 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:border-blue-200 transition-colors"
          >
            Disable All User Faults
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {renderFaultCard('user', 'user_api_delay', 'API Delay', 'Injects 3s delay into User API requests.', 'delay', 'api', initialUserFaults)}
          {renderFaultCard('user', 'user_api_500', 'API Failure (500)', 'Forces 500 error on User API requests.', 'error_500', 'api', initialUserFaults)}
          {renderFaultCard('user', 'user_consumer_fail', 'Consumer Failure', 'Causes OrderCreated event processing to fail, routing messages to DLQ.', 'event_processing_failure', 'consumer', initialUserFaults)}
        </div>
      </section>

      {/* Order Service Faults */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-blue-900">Order Service Faults</h2>
          <button 
            onClick={() => disableAll('order')}
            disabled={loading === 'disable-order'}
            className="text-sm font-semibold text-slate-600 hover:text-blue-700 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:border-blue-200 transition-colors"
          >
            Disable All Order Faults
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {renderFaultCard('order', 'order_api_delay', 'API Delay', 'Injects 3s delay into Order API requests.', 'delay', 'api', initialOrderFaults)}
          {renderFaultCard('order', 'order_api_500', 'API Failure (500)', 'Forces 500 error on Order API requests.', 'error_500', 'api', initialOrderFaults)}
          {renderFaultCard('order', 'order_outbox_fail', 'Outbox Publisher Failure', 'Simulates failure when Outbox worker tries to publish an event.', 'outbox_publication_failure', 'publisher', initialOrderFaults)}
        </div>
      </section>
    </div>
  );
}
