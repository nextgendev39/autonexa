const placeholderMarkers = ["your-project", "your-anon-key", "your-anon", "your-publishable"];

/**
 * Prefer NEXT_PUBLIC_SUPABASE_ANON_KEY. Also accept
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (current Supabase dashboard label).
 */
export function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = getSupabaseAnonKey();
  if (!url || !key) return false;
  if (placeholderMarkers.some((marker) => url.includes(marker) || key.includes(marker))) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function requireSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = getSupabaseAnonKey();
  if (!url || !key || !isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  return { url, key };
}
