import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { apiRequestMock, authState } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  authState: { userId: null as string | null },
}));

vi.mock("@/lib/api", () => ({ apiRequest: apiRequestMock }));

// Mirrors AuthProvider, which builds a fresh `user` object on every render.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: authState.userId
      ? {
          id: authState.userId,
          email: null,
          user_metadata: { full_name: null, avatar_url: null },
        }
      : null,
  }),
}));

import { useUserRole } from "@/hooks/useUserRole";

describe("Phase 4E — useUserRole fetch frequency", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ role: "admin" });
    authState.userId = "user_alice";
  });

  it("fetches the role once despite new user objects on re-render", async () => {
    const { result, rerender } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    rerender();
    rerender();
    rerender();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/users/me/role");
  });

  it("refetches when the signed-in user changes", async () => {
    const { result, rerender } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    apiRequestMock.mockResolvedValue({ role: "user" });
    authState.userId = "user_bob";
    rerender();

    await waitFor(() => expect(result.current.isAdmin).toBe(false));
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("reports loading, not a stale result, in the render where a user first appears", async () => {
    // Clerk starts unloaded with no user, as on a direct visit to /admin.
    // Record every render: act() flushes effects, so only a render log shows
    // what AdminRoute saw in the render where the user first appeared.
    authState.userId = null;
    const renders: Array<{ userId: string | null; loading: boolean; isAdmin: boolean }> = [];
    const { result, rerender } = renderHook(() => {
      const value = useUserRole();
      renders.push({ userId: authState.userId, loading: value.loading, isAdmin: value.isAdmin });
      return value;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    authState.userId = "user_alice";
    rerender();
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    // No render for the signed-in user may claim "loaded, not an admin" before
    // the role arrives; that is what redirected admins to /dashboard.
    const staleRenders = renders.filter(
      (r) => r.userId === "user_alice" && !r.loading && !r.isAdmin,
    );
    expect(staleRenders).toEqual([]);
  });

  it("never exposes the previous user's roles while the next user's load", async () => {
    const { result, rerender } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    let resolveNext: (value: { role: "user" }) => void = () => {};
    apiRequestMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      }),
    );
    authState.userId = "user_bob";
    rerender();

    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.roles).toEqual([]);

    resolveNext({ role: "user" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual(["user"]);
  });

  it("clears roles without calling the API when signed out", async () => {
    authState.userId = null;
    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
