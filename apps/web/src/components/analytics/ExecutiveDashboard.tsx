'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { LoadingState } from '../ui/LoadingState';

export interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  atRisk: boolean;
  overdueInvoiceCount: number;
}

interface Props {
  data: ExecutiveDashboardRow[];
  isLoading?: boolean;
}

const AT_RISK_COLOR = '#ef4444'; // red-500
const ACTUAL_COLOR = '#3b82f6'; // blue-500
const BUDGET_COLOR = '#e5e7eb'; // gray-200

export function ExecutiveDashboard({ data, isLoading }: Props) {
  // The §32.7 loading component (ADR-055) rather than the bare `bg-gray-100` block this rendered
  // before — that block was off-token, which §32.7 "Tokens only" forbids. The wrapper keeps the
  // chart's reserved height so settling data does not jump the page. No `label`: this component
  // takes no `t`, and ADR-055 forbids baking a literal.
  if (isLoading)
    return (
      <div className="h-64">
        <LoadingState variant="widget" />
      </div>
    );
  if (!data || data.length === 0)
    return <p className="text-sm text-gray-500">No data available.</p>;

  const chartData = data.map((r) => ({
    name: r.projectId.slice(0, 8),
    actual: parseFloat(r.totalActual),
    budget: parseFloat(r.totalBudget),
    atRisk: r.atRisk,
  }));

  const totalOverdue = data.reduce((s, r) => s + r.overdueInvoiceCount, 0);
  const atRiskCount = data.filter((r) => r.atRisk).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label="Projects" value={data.length.toString()} />
        <KpiCard label="At-Risk" value={atRiskCount.toString()} warn={atRiskCount > 0} />
        <KpiCard label="Overdue Invoices" value={totalOverdue.toString()} warn={totalOverdue > 0} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-600">Budget Utilisation by Project</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="budget" name="Budget" fill={BUDGET_COLOR} />
            <Bar dataKey="actual" name="Actual">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.atRisk ? AT_RISK_COLOR : ACTUAL_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KpiCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${warn ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? 'text-red-600' : 'text-gray-800'}`}>
        {value}
      </p>
    </div>
  );
}
