'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Inbox, AlertOctagon, Zap, BarChart2 } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Outbox', href: '/outbox', icon: Inbox },
    { name: 'DLQ & Failures', href: '/dlq', icon: AlertOctagon },
    { name: 'Failure Engine', href: '/faults', icon: Zap },
    { name: 'Observability', href: '/observability', icon: BarChart2 },
  ];

  return (
    <div className="w-64 bg-white text-slate-600 h-screen flex flex-col border-r border-gray-200 shadow-sm">
      <div className="p-6">
        <h1 className="text-xl font-bold text-blue-900 flex items-center gap-2">
          <Activity className="text-blue-600" />
          Reliability
        </h1>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">Control Plane</p>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 font-medium ${
                isActive ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-xs font-medium text-slate-400 text-center border-t border-gray-100">
        Distributed Order System
      </div>
    </div>
  );
}
