import { api } from '@/lib/api-client';
import { FaultManager } from './fault-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FaultsPage() {
  const [userFaults, orderFaults] = await Promise.all([
    api.user.getFaults(),
    api.order.getFaults()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-blue-900">Failure Simulation Engine</h1>
      </div>
      
      <p className="text-slate-500 text-lg">
        Safely inject failures into the distributed system to test resilience and recovery mechanisms like DLQ and Outbox.
      </p>

      <FaultManager 
        initialUserFaults={userFaults} 
        initialOrderFaults={orderFaults} 
      />
    </div>
  );
}
