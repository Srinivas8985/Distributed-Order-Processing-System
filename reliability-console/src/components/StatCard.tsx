interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  urgent?: boolean;
}

export default function StatCard({ title, value, subtitle, urgent }: StatCardProps) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm ${urgent ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <h3 className="text-slate-500 text-sm font-semibold">{title}</h3>
      <p className={`text-3xl font-bold mt-2 ${urgent ? 'text-red-600' : 'text-blue-900'}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
