import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export interface RecordedSupabaseCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface SupabaseServerClientOptions {
  request?: Request;
  onSetCookies?: (
    cookiesToSet: RecordedSupabaseCookie[],
    headers: Record<string, string>,
  ) => void;
}

function parseRequestCookies(
  cookieHeader: string | null,
): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];
  const result: Array<{ name: string; value: string }> = [];
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    try {
      result.push({ name, value: decodeURIComponent(rawValue) });
    } catch {
      result.push({ name, value: rawValue });
    }
  }
  return result;
}

export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin credentials are not configured.');
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createSupabaseServerClient(
  options?: SupabaseServerClientOptions,
): Promise<SupabaseClient<Database>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error('Supabase public credentials are not configured.');
  }

  if (options?.request) {
    const reqCookies = parseRequestCookies(options.request.headers.get('cookie'));
    return createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return reqCookies;
        },
        setAll(cookiesToSet, headers) {
          options.onSetCookies?.(cookiesToSet, headers);
        },
      },
    });
  }

  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(cookiesToSet, headers) {
        if (options?.onSetCookies) {
          options.onSetCookies(cookiesToSet, headers);
          return;
        }
        try {
          for (const { name, value, options: cookieOpts } of cookiesToSet) {
            cookieStore.set(name, value, cookieOpts);
          }
        } catch {
          return;
        }
      },
    },
  });
}
