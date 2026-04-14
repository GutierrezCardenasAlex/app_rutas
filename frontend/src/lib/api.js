function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return "http://localhost:3001";
}

const API_URL = resolveApiUrl();

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con el backend en ${API_URL}. Verifica que el servidor este corriendo en el puerto 3001.`);
  }

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

export function updateRoute(id, payload) {
  return request(`/admin/routes/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteRoute(id) {
  return request(`/admin/routes/${id}`, {
    method: "DELETE",
  });
}
