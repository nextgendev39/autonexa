"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlertIcon, MailIcon, SendIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postAuthJson } from "@/lib/auth/client";
import { firstFieldErrors } from "@/lib/validation";
import { inviteUserSchema } from "@/lib/validation/user";
import type { RoleOption } from "@/lib/users/service";
import { roleLabel } from "@/components/users/role-label";
import { RoleChip } from "@/components/users/role-chip";

export function InviteUserDialog({
  roles,
  onSuccess,
}: {
  roles: RoleOption[];
  onSuccess: () => void;
}) {
  const t = useTranslations("modules.users");
  const tRoot = useTranslations();
  const msg = (key: string) => tRoot(key as Parameters<typeof tRoot>[0]);
  const label = (role: RoleOption) => roleLabel(role, (k) => t(k as Parameters<typeof t>[0]));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function validate(values: {
    email: string;
    firstName: string;
    lastName: string;
    roleKey: string;
  }) {
    const parsed = inviteUserSchema.safeParse(values);
    const errors = parsed.success ? {} : firstFieldErrors(parsed.error);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function update(field: "email" | "firstName" | "lastName" | "roleKey", value: string) {
    const next = { email, firstName, lastName, roleKey, [field]: value };
    if (field === "email") setEmail(value);
    if (field === "firstName") setFirstName(value);
    if (field === "lastName") setLastName(value);
    if (field === "roleKey") setRoleKey(value);
    if (submitted) validate(next);
  }

  function reset() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRoleKey("");
    setSubmitted(false);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!validate({ email, firstName, lastName, roleKey })) return;

    setLoading(true);
    const result = await postAuthJson("/api/users/invite", { email, firstName, lastName, roleKey });

    setLoading(false);

    if (result.status === "error") {
      if (Object.keys(result.fieldErrors).length > 0) {
        setFieldErrors(result.fieldErrors);
      } else {
        setFormError(result.formError);
      }
      return;
    }

    toast.success(t("inviteSuccess"));
    setOpen(false);
    reset();
    onSuccess();
  }

  const errorProps = (field: string, id: string) =>
    fieldErrors[field] ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="brand" />}>
        <UserPlusIcon />
        {t("invite")}
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          <DialogHeader className="flex-row items-start gap-3 pe-8">
            <span className="bg-brand-soft text-brand-strong ring-brand/30 dark:text-brand flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset">
              <UserPlusIcon className="size-5" aria-hidden />
            </span>
            <div className="grid gap-1">
              <DialogTitle className="text-base">{t("inviteTitle")}</DialogTitle>
              <DialogDescription>{t("inviteDescription")}</DialogDescription>
            </div>
          </DialogHeader>

          <fieldset disabled={loading} className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <FormField
                label={t("firstName")}
                htmlFor="invite-first-name"
                error={fieldErrors.firstName && msg(fieldErrors.firstName)}
                required
              >
                <Input
                  id="invite-first-name"
                  value={firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  placeholder={t("firstNamePlaceholder")}
                  autoComplete="off"
                  autoFocus
                  {...errorProps("firstName", "invite-first-name")}
                />
              </FormField>
              <FormField
                label={t("lastName")}
                htmlFor="invite-last-name"
                error={fieldErrors.lastName && msg(fieldErrors.lastName)}
                required
              >
                <Input
                  id="invite-last-name"
                  value={lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  placeholder={t("lastNamePlaceholder")}
                  autoComplete="off"
                  {...errorProps("lastName", "invite-last-name")}
                />
              </FormField>
            </div>

            <FormField
              label={t("email")}
              htmlFor="invite-email"
              error={fieldErrors.email && msg(fieldErrors.email)}
              hint={t("emailHint")}
              required
            >
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  autoComplete="off"
                  {...errorProps("email", "invite-email")}
                />
              </InputGroup>
            </FormField>

            <FormField
              label={t("role")}
              htmlFor="invite-role"
              error={fieldErrors.roleKey && msg(fieldErrors.roleKey)}
              hint={t("roleHint")}
              required
            >
              <Select
                value={roleKey}
                onValueChange={(v) => update("roleKey", v ?? "")}
                disabled={loading}
              >
                <SelectTrigger
                  id="invite-role"
                  className="w-full"
                  {...errorProps("roleKey", "invite-role")}
                >
                  <SelectValue placeholder={t("rolePlaceholder")}>
                    {(value: string | null) => {
                      const role = roles.find((r) => r.key === value);
                      return role ? (
                        <RoleChip label={label(role)} />
                      ) : (
                        <span className="text-muted-foreground">{t("rolePlaceholder")}</span>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      <RoleChip label={label(role)} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {formError && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{msg(formError)}</AlertDescription>
              </Alert>
            )}
          </fieldset>

          <DialogFooter showCloseButton>
            <LoadingButton type="submit" variant="brand" loading={loading}>
              {!loading ? <SendIcon /> : null}
              {t("sendInvite")}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
