import "server-only";

import { createClient as createPlainClient } from "@supabase/supabase-js";

import { platformClient } from "@/lib/server/privileged";
import { requireSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ChangePasswordValues, UpdateProfileValues } from "@/lib/validation/profile";
import type { UserContext } from "@/types/auth";

export type MyProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  employeeCode: string | null;
  roles: string[];
  branch: { name: string; city: string | null } | null;
  status: string;
  memberSince: string;
  lastSignInAt: string | null;
};

type ProfileError = { code: string; message: string; fieldErrors?: Record<string, string> };
type Result<T> = { data: T; error: null } | { data: null; error: ProfileError };

const fail = (code: string, message: string, fieldErrors?: Record<string, string>) => ({
  data: null,
  error: { code, message, fieldErrors },
});

/** The signed-in user's own profile, read through their session. */
export async function getMyProfile(context: UserContext): Promise<MyProfile | null> {
  const supabase = await createClient();
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "first_name, last_name, display_name, phone, avatar_url, employee_code, status, created_at",
      )
      .eq("id", context.userId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const row = profile as {
    first_name: string;
    last_name: string;
    display_name: string;
    phone: string | null;
    avatar_url: string | null;
    employee_code: string | null;
    status: string;
    created_at: string;
  } | null;
  if (!row) return null;

  let branch: MyProfile["branch"] = null;
  if (context.branchId) {
    const { data } = await supabase
      .from("branches")
      .select("name, city")
      .eq("id", context.branchId)
      .maybeSingle();
    branch = (data as { name: string; city: string | null } | null) ?? null;
  }

  return {
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    email: context.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    employeeCode: row.employee_code,
    roles: context.roles,
    branch,
    status: row.status,
    memberSince: row.created_at,
    lastSignInAt: auth.user?.last_sign_in_at ?? null,
  };
}

/** Name and phone. RLS limits the write to the caller's own row; a trigger guards the rest. */
export async function updateMyProfile(
  values: UpdateProfileValues,
  context: UserContext,
): Promise<Result<true>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: values.firstName,
      last_name: values.lastName,
      display_name: `${values.firstName} ${values.lastName}`,
      phone: values.phone || null,
    })
    .eq("id", context.userId);
  if (error) return fail(error.code ?? "db_error", error.message);
  return { data: true, error: null };
}

/**
 * Checks the current password, then sets the new one. The check signs in on a throwaway
 * client (no cookies) and revokes only that session, so the caller stays signed in.
 */
export async function changeMyPassword(
  values: ChangePasswordValues,
  context: UserContext,
): Promise<Result<true>> {
  if (!context.email) return fail("no_email", "This account has no email to verify.");

  const { url, key } = requireSupabaseEnv();
  const verifier = createPlainClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: check, error: checkError } = await verifier.auth.signInWithPassword({
    email: context.email,
    password: values.currentPassword,
  });
  if (checkError || !check.session) {
    return fail("wrong_password", "The current password is incorrect.", {
      currentPassword: "profile.password.wrongCurrent",
    });
  }
  await platformClient()
    .auth.admin.signOut(check.session.access_token, "local")
    .catch(() => undefined);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: values.password });
  if (error) {
    if (error.code === "weak_password") {
      return fail("weak_password", error.message, { password: "profile.password.weak" });
    }
    return fail(error.code ?? "auth_error", error.message);
  }
  return { data: true, error: null };
}
