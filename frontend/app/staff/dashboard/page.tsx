"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  Users, BookOpen, MessageSquare, Brain,
  TrendingUp, TrendingDown, Minus,
  CheckCircle, Clock, XCircle,
} from "lucide-react";
import api from "@/lib/api";

// SSR-safe recharts
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then(m => m.Line), { ssr: false });
const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false });
const PieChart = dynamic(() => import("recharts").then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then(m => m.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then(m => m.Cell), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then(m => m.Legend), { ssr: false });

// ── Fetchers ───────────────────────────────────────────────────────────────────

async function fetchStats() {
  const res = await api.get("/admin/stats");
  return res.data.data;
}

async function fetchCharts() {
  const res = await api.get("/admin/charts?days=30");
  return res.data.data;
}

// ── StatsCard ──────────────────────────────────────────────────────────────────

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  trendText?: string;
  accent?: string;
}

function StatsCard({ icon, label, value, sub, trend, trendText, accent = "#ec2028" }: StatsCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-start gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5 font-heading">{value.toLocaleString("vi-VN")}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {trendText && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trendText}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return <div className="h-28 rounded-2xl bg-muted animate-pulse" />;
}

function ChartSkeleton() {
  return <div className="h-64 rounded-2xl bg-muted animate-pulse" />;
}

// ── Chart wrappers (guard for SSR) ────────────────────────────────────────────

function LineChartCard({ title, data, dataKey, color }: {
  title: string;
  data: { date: string; count: number }[];
  dataKey: string;
  color: string;
}) {
  const formatted = data.map(d => ({ ...d, date: d.date.slice(5) }));

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formatted}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              contentStyle={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              labelFormatter={(l) => `Ngày ${l}`}
            />
            <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: "#2D6A4F",
  pending: "#ec2028",
  rejected: "#DC2626",
};
const STATUS_LABELS: Record<string, string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  rejected: "Từ chối",
};

function RecipeStatusPie({ stats }: { stats: { approved: number; pending: number; rejected: number } }) {
  const data = [
    { name: "approved", value: stats.approved },
    { name: "pending", value: stats.pending },
    { name: "rejected", value: stats.rejected },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Công thức theo trạng thái</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name?: string; percent?: number }) => `${STATUS_LABELS[name ?? ""] ?? name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#ccc"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [(value as number)?.toLocaleString?.("vi-VN") ?? String(value ?? 0), STATUS_LABELS[String(name)] ?? String(name)]}
              contentStyle={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 justify-center mt-2 flex-wrap">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.name] }} />
            {STATUS_LABELS[d.name]}: {d.value.toLocaleString("vi-VN")}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopKeywordsBar({ data }: { data: { keyword: string; count: number }[] }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Top 10 từ khóa</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="keyword" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={72} />
            <Tooltip
              contentStyle={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#ec2028" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSWR("/admin/stats", fetchStats);
  const { data: charts, isLoading: chartsLoading } = useSWR("/admin/charts", fetchCharts);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground font-heading">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hệ thống VNFood Platform</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : stats ? (
          <>
            <StatsCard
              icon={<Users className="w-5 h-5" />}
              label="Người dùng"
              value={stats.users.total}
              sub={`+${stats.users.new_today} hôm nay`}
              trend="up"
              trendText={`+${stats.users.new_this_week} tuần này`}
              accent="#2D6A4F"
            />
            <StatsCard
              icon={<BookOpen className="w-5 h-5" />}
              label="Công thức"
              value={stats.recipes.total}
              sub={`${stats.recipes.pending} chờ duyệt`}
              trend={stats.recipes.pending > 0 ? "up" : "neutral"}
              trendText={`+${stats.recipes.new_today} hôm nay`}
              accent="#ec2028"
            />
            <StatsCard
              icon={<MessageSquare className="w-5 h-5" />}
              label="Bình luận"
              value={stats.engagement.total_comments}
              sub={`${stats.engagement.total_ratings} đánh giá`}
              accent="#666666"
            />
            <StatsCard
              icon={<Brain className="w-5 h-5" />}
              label="AI nhận diện"
              value={stats.engagement.ai_recognitions_today}
              sub="hôm nay"
              trend="neutral"
              trendText={`${stats.engagement.total_saves} lượt lưu`}
              accent="#8B5CF6"
            />
          </>
        ) : null}
      </div>

      {/* Recipe status row */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-green-700 font-medium">Đã duyệt</p>
              <p className="text-lg font-bold text-green-800">{stats.recipes.approved.toLocaleString("vi-VN")}</p>
            </div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <p className="text-xs text-orange-700 font-medium">Chờ duyệt</p>
              <p className="text-lg font-bold text-orange-800">{stats.recipes.pending.toLocaleString("vi-VN")}</p>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-red-700 font-medium">Từ chối</p>
              <p className="text-lg font-bold text-red-800">{stats.recipes.rejected.toLocaleString("vi-VN")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {chartsLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} />)}
        </div>
      ) : charts ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineChartCard
            title="Người dùng mới (30 ngày qua)"
            data={charts.users_by_day}
            dataKey="count"
            color="#2D6A4F"
          />
          <LineChartCard
            title="Công thức mới từ người dùng (30 ngày qua)"
            data={charts.recipes_by_day}
            dataKey="count"
            color="#ec2028"
          />
          {stats && <RecipeStatusPie stats={stats.recipes} />}
          <TopKeywordsBar data={charts.top_keywords} />
        </div>
      ) : null}
    </div>
  );
}
