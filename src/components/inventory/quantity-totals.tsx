"use client";

import { useTranslations } from "next-intl";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { quantityTotal } from "@/lib/vehicles/quantity";

export type QuantityTotalRow = {
  label: string;
  unitPrice: number | null | undefined;
  currency?: string;
};

/** Per-unit and total amounts for multi-unit inventory records. Hidden for a single unit. */
export function QuantityTotals({ quantity, rows }: { quantity: number; rows: QuantityTotalRow[] }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const visible = rows.filter((row) => row.unitPrice != null);
  if (!Number.isInteger(quantity) || quantity < 2 || visible.length === 0) return null;

  const money = (amount: number | null, currency?: string) =>
    amount == null ? "—" : formatCurrency(amount, locale, currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inventory.totals.title", { count: quantity })}</CardTitle>
        <CardDescription>{t("inventory.totals.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-border grid divide-y text-sm">
          {visible.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="text-muted-foreground text-xs">
                  {money(row.unitPrice ?? null, row.currency)} × {quantity}
                </span>
                <span className="font-semibold">
                  {money(quantityTotal(row.unitPrice, quantity), row.currency)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
