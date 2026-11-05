import { createHash } from "node:crypto";

import { authErrorKeys, mapAuthError } from "@/lib/auth/errors";
import { getBootstrapSecret, isBootstrapEnabled, secretsMatch, getPlatformBootstrapSecret, isAnyBootstrapEnabled } from "@/lib/auth/bootstrap-config";
import { hasServiceRoleKey, platformClient } from "@/lib/server/privileged";
import { createFirstOwner } from "@/lib/server/privileged/platform";
import { hitRateLimit } from "@/lib/server/privileged/storefront";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  authErrorState,
  authFieldErrorState,
  authSuccessState,
  type AuthActionState,
} from "@/types/auth";
import {
  firstFieldErrors,
  bootstrapAdminSchema,
  loginSchema,
  resetPasswordSchema,
  type BootstrapAdminValues,
  type LoginValues,
  type ResetPasswordValues,
} from "@/lib/validation";

type ProfileStatusRow = {
  status: "active" | "invited" | "suspended" | "disabled";
  deleted_at: string | null;
};

async function loadProfileStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ProfileStatusRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("status, deleted_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProfileStatusRow;
}

async function rejectInactiveSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<AuthActionState | null> {
  const profile = await loadProfileStatus(supabase, userId);

  if (!profile || profile.deleted_at) {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.invalidCredentials);
  }

  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.accountSuspended);
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.accountDisabled);
  }

  return null;
}

// The DB's activate_invited_profile RPC is blocked by profiles_guard_self_update
// (users may not change their own status), so flip invited -> active with the
// service role after the caller has proven they own this session.
async function activateInvitedProfile(userId: string) {
  const admin = platformClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "invited")
    .is("deleted_at", null);
  return !error;
}

export async function signIn(input: LoginValues): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return authFieldErrorState(firstFieldErrors(parsed.error));
  }
  if (!isSupabaseConfigured()) {
    return authErrorState(authErrorKeys.notConfigured);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const key = mapAuthError(error);
    // Supabase only reports this after the password matched, so it is safe to
    // send the person to their pending verification instead of a dead end.
    if (key === authErrorKeys.emailNotConfirmed) {
      const query = new URLSearchParams({ email: parsed.data.email, reason: "unverified" });
      return authSuccessState(`/verify-email?${query.toString()}`);
    }
    return authErrorState(key);
  }

  const userId = data.user?.id;
  if (!userId) {
    return authErrorState(authErrorKeys.generic);
  }

  const blocked = await rejectInactiveSession(supabase, userId);
  if (blocked) return blocked;

  const profile = await loadProfileStatus(supabase, userId);
  if (profile?.status === "invited") {
    await activateInvitedProfile(userId);
  }

  return authSuccessState("/dashboard");
}

export async function signOutSession(): Promise<AuthActionState> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return authSuccessState("/login");
}

export async function acceptInvitation(input: ResetPasswordValues): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return authFieldErrorState(firstFieldErrors(parsed.error));
  }
  if (!isSupabaseConfigured()) {
    return authErrorState(authErrorKeys.notConfigured);
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return authErrorState(authErrorKeys.session);
  }

  const profile = await loadProfileStatus(supabase, userId);
  if (!profile || profile.deleted_at) {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.generic);
  }
  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.accountSuspended);
  }
  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return authErrorState(authErrorKeys.accountDisabled);
  }
  // Only a pending invite may set its password here; otherwise an already
  // signed-in account in the same browser would have its password overwritten.
  if (profile.status !== "invited") {
    return authErrorState(authErrorKeys.session);
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  // same_password means an earlier attempt already saved it; finish activating.
  if (error && error.code !== "same_password") return authErrorState(mapAuthError(error));

  if (!(await activateInvitedProfile(userId))) {
    return authErrorState(authErrorKeys.generic);
  }

  return authSuccessState("/dashboard");
}

/**
 * The secret decides what's created: the platform secret makes the first AutoNexa platform owner, and
 * the bootstrap secret the first dealership Super Admin. Checked before anything else, so without a
 * secret nobody can learn whether an owner exists or whether an email is taken.
 */
export async function bootstrapAdmin(input: BootstrapAdminValues, address = "unknown"): Promise<AuthActionState> {
  if (!isAnyBootstrapEnabled()) {
    return authErrorState("auth.bootstrap.disabled");
  }

  if (!isSupabaseConfigured()) {
    return authErrorState("auth.errors.notConfigured");
  }

  if (!hasServiceRoleKey()) {
    return authErrorState("auth.bootstrap.missingServiceRole");
  }

  const parsed = bootstrapAdminSchema.safeParse(input);
  if (!parsed.success) {
    return authFieldErrorState(firstFieldErrors(parsed.error));
  }

  // Guesses are limited per address, and overall in case addresses are spoofed.
  const addressKey = createHash("sha256").update(address).digest("hex");
  const allowed =
    (await hitRateLimit(`bootstrap:${addressKey}`, 5, 60 * 60)) && (await hitRateLimit("bootstrap:all", 20, 60 * 60));
  if (!allowed) return authErrorState("auth.bootstrap.tooMany");

  if (secretsMatch(parsed.data.secret, getPlatformBootstrapSecret())) {
    const { error } = await createFirstOwner({
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      password: parsed.data.password,
    });
    if (error === "already_exists") return authErrorState("auth.bootstrap.platformExists");
    if (error === "email_taken") return authFieldErrorState({ email: "auth.bootstrap.userExists" });
    if (error) return authErrorState("auth.bootstrap.schemaMissing");
    return authSuccessState("/login");
  }

  if (!isBootstrapEnabled() || !secretsMatch(parsed.data.secret, getBootstrapSecret())) {
    return authErrorState("auth.bootstrap.invalidSecret");
  }

  let admin;
  try {
    admin = platformClient();
  } catch {
    return authErrorState("auth.bootstrap.missingServiceRole");
  }

  // Seed may not have been applied yet — ensure the Super Admin role exists.
  const { error: roleUpsertError } = await admin.from("roles").upsert(
    {
      key: "super_admin",
      name: "Super Admin",
      description: "Full platform access",
      is_system: true,
    },
    { onConflict: "key" },
  );

  if (roleUpsertError) {
    return authErrorState(
      "auth.bootstrap.schemaMissing",
      {},
      roleUpsertError.message,
    );
  }

  const { data: superAdminRole, error: roleLookupError } = await admin
    .from("roles")
    .select("id")
    .eq("key", "super_admin")
    .maybeSingle();

  if (roleLookupError || !superAdminRole?.id) {
    return authErrorState(
      "auth.bootstrap.schemaMissing",
      {},
      roleLookupError?.message ?? "super_admin role not found after upsert",
    );
  }

  const roleId = superAdminRole.id as string;

  const { count, error: countError } = await admin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);

  if (countError) {
    return authErrorState("auth.bootstrap.generic", {}, countError.message);
  }

  if ((count ?? 0) > 0) {
    return authErrorState("auth.bootstrap.alreadyExists");
  }

  // First-time setup only: once a second dealership exists this route can't tell whose owner
  // it would be creating. Dealerships are provisioned by platform staff from then on.
  const { data: tenants, error: tenantError } = await admin
    .from("tenants" as never)
    .select("id")
    .limit(2);
  const tenantRows = (tenants ?? []) as unknown as { id: string }[];
  if (tenantError || tenantRows.length !== 1) {
    return authErrorState("auth.bootstrap.alreadyExists");
  }
  const tenantId = tenantRows[0].id;

  // Optional demo branch for profile.branch_id (ignore failures).
  const { data: existingBranch } = await admin
    .from("branches")
    .select("id")
    .eq("tenant_id" as never, tenantId as never)
    .eq("code", "DXB-01")
    .maybeSingle();
  let branch = existingBranch as { id: string } | null;
  if (!branch) {
    const { data: createdBranch } = await admin
      .from("branches")
      .insert({
        tenant_id: tenantId,
        name: "AutoNexa Dubai",
        code: "DXB-01",
        emirate: "dubai",
        address_line_1: "Showroom Road",
        city: "Dubai",
        is_active: true,
      } as never)
      .select("id")
      .maybeSingle();
    branch = createdBranch as { id: string } | null;
  }

  const fullName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      full_name: fullName,
    },
  });

  if (createError || !created.user) {
    const message = (createError?.message ?? "").toLowerCase();
    if (message.includes("already") || message.includes("registered")) {
      return authErrorState("auth.bootstrap.userExists", {}, createError?.message ?? null);
    }
    return authErrorState(
      "auth.bootstrap.generic",
      {},
      createError?.message ?? "User creation failed",
    );
  }

  const userId = created.user.id;

  // Trigger may create the profile; upsert so bootstrap works either way.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      tenant_id: tenantId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      display_name: fullName,
      status: "active",
      branch_id: typeof branch?.id === "string" ? branch.id : null,
      employee_code: "SA-001",
    } as never,
    { onConflict: "id" },
  );

  if (profileError) {
    return authErrorState("auth.bootstrap.generic", {}, profileError.message);
  }

  const { error: roleError } = await admin.from("user_roles").insert({
    user_id: userId,
    role_id: roleId,
    branch_id: null,
    assigned_by: userId,
  });

  if (roleError) {
    return authErrorState("auth.bootstrap.generic", {}, roleError.message);
  }

  return authSuccessState("/login");
}
