import { vi } from "vitest";

/** In-memory cookie jar and redirect capture standing in for Next's request context. */
export const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

/** Run an action/page and return the path it redirected to, or the value it returned. */
export async function run<T>(fn: () => Promise<T>): Promise<{ redirectedTo: string | null; value: T | null }> {
  try {
    return { redirectedTo: null, value: await fn() };
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message ?? "");
    if (match) return { redirectedTo: match[1], value: null };
    throw error;
  }
}
