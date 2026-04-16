function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof window !== "undefined") {
    return "/api";
  }

  return "/api";
}

const API_URL = resolveApiUrl();
const ADMIN_PASSWORD_KEY = "rutas_admin_password";

function getAdminPassword() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(ADMIN_PASSWORD_KEY) || "";
}

function buildHeaders(options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (options.adminAuth) {
    const password = getAdminPassword();

    if (password) {
      headers["x-admin-password"] = password;
    }
  }

  return headers;
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: buildHeaders(options),
      ...options,
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con el backend en ${API_URL}. Verifica que el proxy y el servidor esten corriendo.`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Error de red");
  }

  return response.json();
}

export function setAdminPassword(password) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_PASSWORD_KEY, password);
  }
}

export function clearAdminPassword() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
  }
}

export function hasAdminPassword() {
  return Boolean(getAdminPassword());
}

export function fetchRoutes() {
  return request("/routes");
}

export function fetchNearbyRoutes(lat, lng) {
  return request(`/routes/near?lat=${lat}&lng=${lng}`);
}

export function createRoute(payload) {
  return request("/admin/routes", {
    method: "POST",
    adminAuth: true,
    body: JSON.stringify(payload),
  });
}

export function updateRoute(id, payload) {
  return request(`/admin/routes/${id}`, {
    method: "PUT",
    adminAuth: true,
    body: JSON.stringify(payload),
  });
}

export function deleteRoute(id) {
  return request(`/admin/routes/${id}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

export function verifyAdminSession() {
  return request("/admin/session", {
    method: "GET",
    adminAuth: true,
  });
}
