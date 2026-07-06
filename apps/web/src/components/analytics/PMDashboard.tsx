'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface PmDashboardRow {
  eventDate: string;
  manpowerTotal: number;
  issueOpenCount: number;
  inspectionFailCount: number;
  reportCount: number;
}

export interface CostTrendRow {
  eventDate: string;
  committed: string;
  actual: string;
}

export interface ProcurementTrendRow {
  eventDate: string;
  poCount: number;
  rfqCount: number;
  invoiceCount: number;
  overdueInvoiceCount: number;
}

export interface SiteTrendRow {
  eventDate: string;
  reportCount: number;
  issueOpenCount: number;
  inspectionFailCount: number;
  manpowerTotal: number;
}

interface Props {
  pmRows: PmDashboardRow[];
  costTrend: CostTrendRow[];
  procurementTrend: ProcurementTrendRow[];
  siteTrend: SiteTrendRow[];
  isLoading?: boolean;
}

export function PMDashboard({ pmRows, costTrend, procurementTrend, siteTrend, isLoading }: Props) {
  if (isLoading) return <div className="h-96 animate-pulse rounded-lg bg-gray-100" />;

  // Headline KPIs from the latest day of the PM dashboard series (§20.7.2 — manpower, open issues,
  // inspection rate, reports). Data comes from GET /analytics/pm/{projectId}.
  const latest = pmRows.length > 0 ? pmRows[pmRows.length - 1] : null;

  return (
    <div className="space-y-8">
      {latest && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Manpower (latest)" value={latest.manpowerTotal} />
          <Kpi
            label="Open issues"
            value={latest.issueOpenCount}
            danger={latest.issueOpenCount > 0}
          />
          <Kpi
            label="Inspection fails"
            value={latest.inspectionFailCount}
            danger={latest.inspectionFailCount > 0}
          />
          <Kpi label="Reports" value={latest.reportCount} />
        </div>
      )}

      <Section title="Cost Trend — Committed vs Actual">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={costTrend.map((r) => ({
              date: r.eventDate.slice(5),
              committed: parseFloat(r.committed),
              actual: parseFloat(r.actual),
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="committed" stroke="#6366f1" dot={false} />
            <Line type="monotone" dataKey="actual" stroke="#f59e0b" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Procurement Activity">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={procurementTrend.map((r) => ({
              date: r.eventDate.slice(5),
              po: r.poCount,
              rfq: r.rfqCount,
              invoice: r.invoiceCount,
              overdue: r.overdueInvoiceCount,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="po" name="PO" fill="#3b82f6" />
            <Bar dataKey="rfq" name="RFQ" fill="#a855f7" />
            <Bar dataKey="invoice" name="Invoice" fill="#22c55e" />
            <Bar dataKey="overdue" name="Overdue Invoice" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Site Activity">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={siteTrend.map((r) => ({
              date: r.eventDate.slice(5),
              manpower: r.manpowerTotal,
              issues: r.issueOpenCount,
              inspectionFail: r.inspectionFailCount,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="manpower" name="Manpower" stroke="#0ea5e9" dot={false} />
            <Line
              type="monotone"
              dataKey="issues"
              name="Open Issues"
              stroke="#f97316"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="inspectionFail"
              name="Inspection Fail"
              stroke="#ef4444"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-600">{title}</p>
      {children}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${
          danger ? 'text-red-600' : 'text-gray-800'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
