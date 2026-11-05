"use client";

import {
  BadgeCheckIcon,
  Building2Icon,
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  HashIcon,
  KeyRoundIcon,
  MailIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { PhoneInput } from "@/components/forms/phone-input";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingButton } from "@/components/shared/loading-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RoleChip } from "@/components/users/role-chip";
import { roleLabel } from "@/components/users/role-label";
import type { AppLocale } from "@/config/app";
import { useRouter } from "@/lib/i18n/navigation";
import type { MyProfile } from "@/lib/profile/service";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import { firstFieldErrors } from "@/lib/validation";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation/profile";

type ApiResponse =
  | { status: "success" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string> }
  | null;

async function send(path: string, method: "PATCH" | "POST", body: unknown): Promise<ApiResponse> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return ((await res?.json().catch(() => null)) ?? null) as ApiResponse;
}

/** Validation and server messages are translation keys; anything else is shown as is. */
function useMessage() {
  const t = useTranslations();
  return (key?: string) =>
    key
      ? t.has(key as Parameters<typeof t>[0])
        ? t(key as Parameters<typeof t>[0])
        : key
      : undefined;
}

export function ProfilePageClient({ profile }: { profile: MyProfile }) {
  const t = useTranslations("profile");
  const tRoot = useTranslations();
  const locale = useLocale() as AppLocale;
  const initials = `${profile.firstName.slice(0, 1)}${profile.lastName.slice(0, 1)}`.toUpperCase();
  const roles = profile.roles.map((key) =>
    roleLabel({ key, name: key.replace(/_/g, " ") }, (k) =>
      tRoot(`modules.users.${k}` as Parameters<typeof tRoot>[0]),
    ),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {/* Identity: who you are and what you can do, at a glance. */}
      <section className="bg-carbon text-sidebar-foreground relative overflow-hidden rounded-2xl p-5 shadow-sm sm:p-6">
        <span
          className="bg-brand/25 pointer-events-none absolute -end-16 -top-20 size-56 rounded-full blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="ring-brand/50 size-16 shrink-0 ring-2 sm:size-20">
            {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-gold text-brand-foreground font-heading text-xl font-semibold">
              {initials || "Z"}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <h2 className="font-heading truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {profile.displayName}
            </h2>
            {profile.email ? (
              <p className="text-sidebar-foreground/70 flex items-center gap-1.5 truncate text-sm">
                <MailIcon className="size-4 shrink-0" aria-hidden />
                {profile.email}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {roles.map((role) => (
                <RoleChip key={role} label={role} className="text-sidebar-foreground bg-white/10" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <DetailsCard profile={profile} />
          <PasswordCard />
        </div>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("account.title")}</CardTitle>
            <CardDescription>{t("account.hint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <InfoRow
                icon={HashIcon}
                label={t("account.employeeCode")}
                value={profile.employeeCode}
              />
              <InfoRow
                icon={Building2Icon}
                label={t("account.branch")}
                value={
                  profile.branch
                    ? [profile.branch.name, profile.branch.city].filter(Boolean).join(" · ")
                    : t("account.allBranches")
                }
              />
              <InfoRow
                icon={ShieldCheckIcon}
                label={t("account.roles")}
                value={roles.join(", ") || null}
              />
              <InfoRow
                icon={BadgeCheckIcon}
                label={t("account.status")}
                value={
                  tRoot.has(`profile.statuses.${profile.status}` as Parameters<typeof tRoot>[0])
                    ? tRoot(`profile.statuses.${profile.status}` as Parameters<typeof tRoot>[0])
                    : profile.status
                }
              />
              <InfoRow
                icon={CalendarIcon}
                label={t("account.memberSince")}
                value={formatDate(profile.memberSince, locale)}
              />
              <InfoRow
                icon={ClockIcon}
                label={t("account.lastSignIn")}
                value={
                  profile.lastSignInAt ? formatDate(profile.lastSignInAt, locale, "dateTime") : null
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof HashIcon;
  label: string;
  value: string | null;
}) {
  const t = useTranslations("profile");
  return (
    <div className="flex items-start gap-3">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd
          className={cn("font-medium break-words", !value && "text-muted-foreground font-normal")}
        >
          {value || t("account.notSet")}
        </dd>
      </div>
    </div>
  );
}

function DetailsCard({ profile }: { profile: MyProfile }) {
  const t = useTranslations("profile");
  const message = useMessage();
  const router = useRouter();
  const initial = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone ?? "",
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty =
    form.firstName !== initial.firstName ||
    form.lastName !== initial.lastName ||
    form.phone !== initial.phone;

  function set(key: keyof typeof form, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (Object.keys(errors).length > 0) {
      const parsed = updateProfileSchema.safeParse(next);
      setErrors(parsed.success ? {} : firstFieldErrors(parsed.error));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    const json = await send("/api/profile", "PATCH", parsed.data);
    setSaving(false);
    if (json?.status !== "success") {
      if (json?.fieldErrors && Object.keys(json.fieldErrors).length > 0)
        setErrors(json.fieldErrors);
      else toast.error(t("details.failed"));
      return;
    }
    toast.success(t("details.saved"));
    // The header and menus read the name from the server session.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRoundIcon className="text-muted-foreground size-4" aria-hidden />
          {t("details.title")}
        </CardTitle>
        <CardDescription>{t("details.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("details.firstName")}
              htmlFor="profile-first-name"
              error={message(errors.firstName)}
              required
            >
              <Input
                id="profile-first-name"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                aria-invalid={!!errors.firstName || undefined}
              />
            </FormField>
            <FormField
              label={t("details.lastName")}
              htmlFor="profile-last-name"
              error={message(errors.lastName)}
              required
            >
              <Input
                id="profile-last-name"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                aria-invalid={!!errors.lastName || undefined}
              />
            </FormField>
          </div>
          <FormField
            label={t("details.phone")}
            htmlFor="profile-phone"
            error={message(errors.phone)}
            hint={errors.phone ? undefined : t("details.phoneHint")}
          >
            <PhoneInput
              id="profile-phone"
              value={form.phone}
              onChange={(value) => set("phone", value)}
              invalid={!!errors.phone}
            />
          </FormField>
          <FormField
            label={t("details.email")}
            htmlFor="profile-email"
            hint={t("details.emailHint")}
          >
            <Input id="profile-email" value={profile.email ?? ""} readOnly disabled />
          </FormField>
          <div className="flex justify-end">
            <LoadingButton type="submit" loading={saving} disabled={!dirty}>
              {t("details.save")}
            </LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const emptyPasswords = { currentPassword: "", password: "", confirmPassword: "" };

function PasswordCard() {
  const t = useTranslations("profile");
  const message = useMessage();
  const [form, setForm] = useState(emptyPasswords);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    const json = await send("/api/profile/password", "POST", parsed.data);
    setSaving(false);
    if (json?.status !== "success") {
      if (json?.fieldErrors && Object.keys(json.fieldErrors).length > 0)
        setErrors(json.fieldErrors);
      else toast.error(t("password.failed"));
      return;
    }
    toast.success(t("password.saved"));
    setForm(emptyPasswords);
    setErrors({});
  }

  const field = (key: keyof typeof form, label: string, autoComplete: string, hint?: string) => (
    <FormField
      label={label}
      htmlFor={`profile-${key}`}
      error={message(errors[key] || undefined)}
      hint={errors[key] ? undefined : hint}
      required
    >
      <Input
        id={`profile-${key}`}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        aria-invalid={!!errors[key] || undefined}
      />
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="text-muted-foreground size-4" aria-hidden />
          {t("password.title")}
        </CardTitle>
        <CardDescription>{t("password.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          {field("currentPassword", t("password.current"), "current-password")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("password", t("password.new"), "new-password", t("password.rules"))}
            {field("confirmPassword", t("password.confirm"), "new-password")}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
              aria-pressed={visible}
            >
              {visible ? (
                <EyeOffIcon className="size-4" aria-hidden />
              ) : (
                <EyeIcon className="size-4" aria-hidden />
              )}
              {visible ? t("password.hide") : t("password.show")}
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              disabled={!form.currentPassword || !form.password || !form.confirmPassword}
            >
              {t("password.save")}
            </LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
