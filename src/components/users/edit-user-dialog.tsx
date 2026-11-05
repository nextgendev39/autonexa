"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlertIcon, MailIcon, SaveIcon, UserPenIcon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { roleLabel } from "@/components/users/role-label";
import { RoleChip } from "@/components/users/role-chip";
import type { RoleOption, UserListItem } from "@/lib/users/service";
import { firstFieldErrors } from "@/lib/validation";
import { editableUserStatuses, editUserFormSchema } from "@/lib/validation/user";

type Status = UserListItem["status"];
type FormValues = {
  email: string;
  firstName: string;
  lastName: string;
  roleKey: string;
  status: Status;
};

const STATUS_LABEL_KEY: Record<Status, string> = {
  active: "statusActive",
  invited: "statusInvited",
  suspended: "statusSuspended",
  disabled: "statusDisabled",
};

async function patchUser(id: string, body: Record<string, string>) {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return res
    .json()
    .catch(() => ({
      status: "error",
      formError: "auth.errors.generic",
      fieldErrors: {},
      redirectTo: null,
      details: null,
    }));
}

type Props = {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  onSuccess: () => void;
};

export function EditUserDialog({ user, open, onOpenChange, roles, onSuccess }: Props) {
  const t = useTranslations("modules.users");
  const tRoot = useTranslations();
  const msg = (key: string) => tRoot(key as Parameters<typeof tRoot>[0]);
  const label = (role: RoleOption) => roleLabel(role, (k) => t(k as Parameters<typeof t>[0]));
  const statusLabel = (status: Status) => t(STATUS_LABEL_KEY[status] as Parameters<typeof t>[0]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function validate(values: FormValues) {
    const parsed = editUserFormSchema.safeParse(values);
    const errors = parsed.success ? {} : firstFieldErrors(parsed.error);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    const next = { email, firstName, lastName, roleKey, status, [field]: value };
    if (field === "email") setEmail(value as string);
    if (field === "firstName") setFirstName(value as string);
    if (field === "lastName") setLastName(value as string);
    if (field === "roleKey") setRoleKey(value as string);
    if (field === "status") setStatus(value as Status);
    if (submitted) validate(next);
  }

  // Reset the form whenever a different user is opened (during render, not in an effect).
  const [loadedUser, setLoadedUser] = useState<typeof user | null>(null);
  if (user !== loadedUser) {
    setLoadedUser(user);
    if (user) {
      setEmail(user.email ?? "");
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setRoleKey(user.roles[0]?.key ?? "");
      setStatus(user.status);
      setFieldErrors({});
      setFormError(null);
      setSubmitted(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitted(true);
    setFormError(null);
    if (!validate({ email, firstName, lastName, roleKey, status })) return;

    const updates: Record<string, string> = {};
    if (email.trim() !== user.email) updates.email = email.trim();
    if (firstName.trim() !== user.firstName) updates.firstName = firstName.trim();
    if (lastName.trim() !== user.lastName) updates.lastName = lastName.trim();
    if (user.roles.length !== 1 || user.roles[0].key !== roleKey) updates.roleKey = roleKey;
    if (status !== user.status) updates.status = status;

    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
      return;
    }

    setLoading(true);

    const result = await patchUser(user.id, updates);
    setLoading(false);

    if (result.status === "error") {
      if (Object.keys(result.fieldErrors ?? {}).length > 0) {
        setFieldErrors(result.fieldErrors);
      } else {
        setFormError(result.formError);
      }
      return;
    }

    toast.success(t("editSuccess"));
    onOpenChange(false);
    onSuccess();
  }

  const errorProps = (field: string, id: string) =>
    fieldErrors[field] ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          <DialogHeader className="flex-row items-start gap-3 pe-8">
            <span className="bg-brand-soft text-brand-strong ring-brand/30 dark:text-brand flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset">
              <UserPenIcon className="size-5" aria-hidden />
            </span>
            <div className="grid min-w-0 gap-1">
              <DialogTitle className="text-base">{t("editTitle")}</DialogTitle>
              <DialogDescription className="truncate">
                {user?.displayName}
                {user?.email ? <span dir="ltr"> · {user.email}</span> : null}
              </DialogDescription>
            </div>
          </DialogHeader>

          <fieldset disabled={loading} className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <FormField
                label={t("firstName")}
                htmlFor="edit-first-name"
                error={fieldErrors.firstName && msg(fieldErrors.firstName)}
                required
              >
                <Input
                  id="edit-first-name"
                  value={firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  placeholder={t("firstNamePlaceholder")}
                  autoComplete="off"
                  {...errorProps("firstName", "edit-first-name")}
                />
              </FormField>
              <FormField
                label={t("lastName")}
                htmlFor="edit-last-name"
                error={fieldErrors.lastName && msg(fieldErrors.lastName)}
                required
              >
                <Input
                  id="edit-last-name"
                  value={lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  placeholder={t("lastNamePlaceholder")}
                  autoComplete="off"
                  {...errorProps("lastName", "edit-last-name")}
                />
              </FormField>
            </div>

            <FormField
              label={t("email")}
              htmlFor="edit-email"
              error={fieldErrors.email && msg(fieldErrors.email)}
              required
            >
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="edit-email"
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  autoComplete="off"
                  {...errorProps("email", "edit-email")}
                />
              </InputGroup>
            </FormField>

            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <FormField
                label={t("role")}
                htmlFor="edit-role"
                error={fieldErrors.roleKey && msg(fieldErrors.roleKey)}
                required
              >
                <Select
                  value={roleKey}
                  onValueChange={(v) => update("roleKey", v ?? "")}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="edit-role"
                    className="w-full"
                    {...errorProps("roleKey", "edit-role")}
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
              <FormField
                label={t("status")}
                htmlFor="edit-status"
                error={fieldErrors.status && msg(fieldErrors.status)}
                hint={user?.status === "invited" ? t("invitedStatusHint") : undefined}
                required
              >
                <Select
                  value={status}
                  onValueChange={(v) => v && update("status", v as Status)}
                  disabled={loading || user?.status === "invited"}
                >
                  <SelectTrigger
                    id="edit-status"
                    className="w-full"
                    {...errorProps("status", "edit-status")}
                  >
                    <SelectValue>
                      {(value: Status | null) => (value ? statusLabel(value) : t("status"))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {user?.status === "invited" && (
                      <SelectItem value="invited">{statusLabel("invited")}</SelectItem>
                    )}
                    {editableUserStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {formError && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{msg(formError)}</AlertDescription>
              </Alert>
            )}
          </fieldset>

          <DialogFooter showCloseButton>
            <LoadingButton type="submit" variant="brand" loading={loading}>
              {!loading ? <SaveIcon /> : null}
              {msg("common.save")}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
