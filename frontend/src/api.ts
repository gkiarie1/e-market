import { createPhotoForm } from "./photoForm";
import type { Listing, Order, Profile, Review } from "./model";
const base = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
let token: string | null = null;
export function setToken(value: string | null) {
  token = value;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(base + path, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const detail =
        typeof error.detail === "string"
          ? error.detail
          : Array.isArray(error.detail)
            ? error.detail
                .map(
                  (e: { msg: string; loc?: (string | number)[] }) =>
                    `${e.loc?.filter((part) => part !== "body").join(".") || "Input"}: ${e.msg}`,
                )
                .join("\n")
            : "Request failed.";
      throw new Error(detail);
    }
    return response.status === 204 ? (undefined as T) : response.json();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message === "Network request failed" ||
        error.message === "Failed to fetch")
    )
      throw new Error(
        "Cannot reach the marketplace server. Check your connection and API URL.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const login = async (data: unknown, register: boolean) => {
  await checkServer();
  return request<{
    token: string;
    profile: Profile;
  }>(`/auth/${register ? "register" : "login"}`, "POST", data);
};
export const getListings = (query = "") =>
  request<Listing[]>(`/listings${query ? "?" + query : ""}`);
export const getOrders = () => request<Order[]>("/orders");
export const getReviews = () => request<Review[]>("/reviews");
export async function uploadPhoto(uri: string) {
  const form = await createPhotoForm(uri);
  return request<{
    path: string;
  }>("/photos", "POST", form);
}

// Prevent an upgraded app from using stale API processes or uploading photos
// before discovering that a server does not understand the current listing contract.
export async function checkServer() {
  const health = await request<{ apiVersion?: number }>("/health");
  if (!health.apiVersion || health.apiVersion < 3)
    throw new Error(
      "The marketplace server is running an older version. Restart FastAPI from the backend folder, then try again.",
    );
}
