import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AnalyticsPeriod = {
  visitors: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  orderSuccesses: number;
};

export type AnalyticsDailyPoint = {
  date: string;
  visitors: number;
  pageViews: number;
};

export type AnalyticsTopProduct = {
  slug: string;
  views: number;
};

export type AnalyticsDashboardStats = {
  today: AnalyticsPeriod;
  last7Days: AnalyticsPeriod;
  last30Days: AnalyticsPeriod;
  daily: AnalyticsDailyPoint[];
  topProducts: AnalyticsTopProduct[];
};

const emptyPeriod: AnalyticsPeriod = {
  visitors: 0,
  pageViews: 0,
  productViews: 0,
  addToCarts: 0,
  checkoutStarts: 0,
  orderSuccesses: 0,
};

const emptyStats: AnalyticsDashboardStats = {
  today: { ...emptyPeriod },
  last7Days: { ...emptyPeriod },
  last30Days: { ...emptyPeriod },
  daily: [],
  topProducts: [],
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePeriod(value: unknown): AnalyticsPeriod {
  const row = objectValue(value);

  return {
    visitors: numberValue(row.visitors),
    pageViews: numberValue(row.pageViews ?? row.page_views),
    productViews: numberValue(row.productViews ?? row.product_views),
    addToCarts: numberValue(row.addToCarts ?? row.add_to_carts),
    checkoutStarts: numberValue(row.checkoutStarts ?? row.checkout_starts),
    orderSuccesses: numberValue(row.orderSuccesses ?? row.order_successes),
  };
}

export async function getAnalyticsDashboardStats(): Promise<AnalyticsDashboardStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyStats;

  const { data, error } = await supabase.rpc("get_analytics_dashboard_stats");

  if (error) {
    throw new Error(`Erro ao carregar estatísticas: ${error.message}`);
  }

  const root = objectValue(data);
  const dailyRaw = Array.isArray(root.daily) ? root.daily : [];
  const topProductsRaw = Array.isArray(root.topProducts)
    ? root.topProducts
    : Array.isArray(root.top_products)
      ? root.top_products
      : [];

  return {
    today: normalizePeriod(root.today),
    last7Days: normalizePeriod(root.last7Days ?? root.last_7_days),
    last30Days: normalizePeriod(root.last30Days ?? root.last_30_days),
    daily: dailyRaw
      .map((value) => {
        const row = objectValue(value);
        return {
          date: String(row.date || ""),
          visitors: numberValue(row.visitors),
          pageViews: numberValue(row.pageViews ?? row.page_views),
        };
      })
      .filter((row) => row.date),
    topProducts: topProductsRaw
      .map((value) => {
        const row = objectValue(value);
        return {
          slug: String(row.slug || "").slice(0, 160),
          views: numberValue(row.views),
        };
      })
      .filter((row) => row.slug),
  };
}
