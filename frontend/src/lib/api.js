const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Error de red");
  }

  return response.json();
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
    body: JSON.stringify(payload),
  });
}
