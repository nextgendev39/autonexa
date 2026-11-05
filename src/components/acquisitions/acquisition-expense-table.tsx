"use client";

import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AcquisitionExpenseDialog } from "@/components/acquisitions/acquisition-expense-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { PermissionGate } from "@/components/auth/permission-gate";
import { ResponsiveTable, type TableColumn } from "@/components/tables/responsive-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAcquisitionMutations } from "@/hooks/use-acquisitions";
import { usePermission } from "@/hooks/use-permission";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import type { AcquisitionExpense } from "@/types/acquisition";

export function AcquisitionExpenseTable({
  acquisitionId,
  expenses,
}: {
  acquisitionId: string;
  expenses: AcquisitionExpense[];
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const { removeExpense } = useAcquisitionMutations(acquisitionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcquisitionExpense | null>(null);

  const canView = can("acquisition.expense.view");
  const canCreate = can("acquisition.expense.create");
  const canEdit = can("acquisition.expense.edit");

  const columns = useMemo<TableColumn<AcquisitionExpense>[]>(() => {
    const base: TableColumn<AcquisitionExpense>[] = [
      {
        key: "type",
        header: t("acquisitions.table.expenseType"),
        cell: (row) => t(`acquisitions.expenseTypes.${row.expenseType}`),
      },
      {
        key: "description",
        header: t("acquisitions.table.description"),
        cell: (row) => row.description || "—",
      },
      {
        key: "amount",
        header: t("acquisitions.table.amount"),
        className: "tabular-nums text-end",
        cell: (row) => formatCurrency(row.amount, locale, row.currency),
      },
      {
        key: "date",
        header: t("acquisitions.table.expenseDate"),
        className: "tabular-nums",
        cell: (row) => formatDate(row.expenseDate, locale, "medium"),
      },
      {
        key: "vendor",
        header: t("acquisitions.table.vendor"),
        cell: (row) => row.vendor || "—",
      },
    ];

    if (canEdit) {
      base.push({
        key: "actions",
        header: t("acquisitions.table.actions"),
        className: "text-end",
        cell: (row) => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <PencilIcon aria-hidden />
              <span className="sr-only">{t("acquisitions.actions.edit")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await removeExpense.mutateAsync(row.id);
                  toast.success(t("acquisitions.toasts.expenseRemoved"));
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t("acquisitions.toasts.error"),
                  );
                }
              }}
            >
              <TrashIcon aria-hidden />
              <span className="sr-only">{t("acquisitions.actions.delete")}</span>
            </Button>
          </div>
        ),
      });
    }

    return base;
  }, [t, locale, canEdit, removeExpense]);

  if (!canView) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("acquisitions.sections.expenses")}</CardTitle>
        <PermissionGate permission="acquisition.expense.create">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon aria-hidden />
            {t("acquisitions.actions.addExpense")}
          </Button>
        </PermissionGate>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState
            title={t("acquisitions.empty.expensesTitle")}
            description={t("acquisitions.empty.expensesHint")}
            className="border-0 py-8"
            action={
              canCreate ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <PlusIcon aria-hidden />
                  {t("acquisitions.actions.addExpense")}
                </Button>
              ) : null
            }
          />
        ) : (
          <ResponsiveTable
            bare
            columns={columns}
            rows={expenses}
            renderCard={(expense) => (
              <div key={expense.id} className="bg-card rounded-xl border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t(`acquisitions.expenseTypes.${expense.expenseType}`)}
                    </p>
                    {expense.description ? (
                      <p className="text-muted-foreground mt-0.5">{expense.description}</p>
                    ) : null}
                    <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                      {formatDate(expense.expenseDate, locale, "medium")}
                      {expense.vendor ? ` · ${expense.vendor}` : ""}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(expense.amount, locale, expense.currency)}
                  </p>
                </div>
              </div>
            )}
          />
        )}
      </CardContent>

      {(canCreate || canEdit) && (
        <AcquisitionExpenseDialog
          acquisitionId={acquisitionId}
          expense={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </Card>
  );
}
