"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, SimpleSelect, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLES = ["support", "billing", "admin", "owner"];

export function InviteStaffDialog() {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [email, setEmail] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [role, setRole] = useState("support");
  return (
    <ActionDialog
      trigger={
        <Button>
          <PlusIcon />
          {t("admins.invite")}
        </Button>
      }
      title={t("admins.invite")}
      description={t("admins.inviteHint")}
      submitLabel={t("admins.invite")}
      error={error}
      pending={pending}
      onSubmit={() => run("/api/platform/admins", "POST", { email, firstName, lastName, role })}
    >
      <FormField label={t("admins.email")} htmlFor="st-email" required>
        <Input id="st-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("common.firstName")} htmlFor="st-first" required>
          <Input id="st-first" required value={firstName} onChange={(e) => setFirst(e.target.value)} />
        </FormField>
        <FormField label={t("common.lastName")} htmlFor="st-last" required>
          <Input id="st-last" required value={lastName} onChange={(e) => setLast(e.target.value)} />
        </FormField>
      </div>
      <FormField label={t("admins.role")} htmlFor="st-role" hint={t(`roleHints.${role}` as never)} required>
        <SimpleSelect
          id="st-role"
          value={role}
          onChange={setRole}
          options={ROLES.map((value) => ({ value, label: t(`roles.${value}` as never) }))}
        />
      </FormField>
    </ActionDialog>
  );
}

export function StaffRoleAction({ userId, role: initial, email }: { userId: string; role: string; email: string | null }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [role, setRole] = useState(ROLES.includes(initial) ? initial : "support");
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t("admins.changeRole")}
        </Button>
      }
      title={t("admins.changeRole")}
      description={email ?? undefined}
      submitLabel={t("common.save")}
      error={error}
      pending={pending}
      onSubmit={() => run(`/api/platform/admins/${userId}`, "PATCH", { role })}
    >
      <FormField label={t("admins.role")} htmlFor="sr-role" hint={t(`roleHints.${role}` as never)} required>
        <SimpleSelect
          id="sr-role"
          value={role}
          onChange={setRole}
          options={ROLES.map((value) => ({ value, label: t(`roles.${value}` as never) }))}
        />
      </FormField>
    </ActionDialog>
  );
}

export function RemoveStaffAction({ userId, email }: { userId: string; email: string | null }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t("admins.remove")}
        </Button>
      }
      title={t("admins.remove")}
      description={email ?? undefined}
      submitLabel={t("admins.remove")}
      destructive
      error={error}
      pending={pending}
      onSubmit={() => run(`/api/platform/admins/${userId}`, "DELETE")}
    />
  );
}
