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

  it("clears roles without calling the API when signed out", async () => {
    authState.userId = null;
    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
