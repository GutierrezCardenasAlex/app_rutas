import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import AdminDrawControl from "../components/AdminDrawControl.jsx";
import {
  clearAdminPassword,
  createRoute,
  deleteRoute,
  fetchRoutes,
  hasAdminPassword,
  setAdminPassword,
  updateRoute,
  verifyAdminSession,
} from "../lib/api.js";

const defaultCenter = [-19.5836, -65.7531];
const emptyForm = {
  lineaDisplay: "",
  lineaOperativa: "",
  sentido: "subida",
  nombre: "",
  descripcion: "",
  referencias: "",
};

function geometryToLatLngs(geometry) {
  if (!geometry?.coordinates) {
    return [];
  }

  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

function AdminPage() {
  const [form, setForm] = useState(emptyForm);
  const [draftGeoJson, setDraftGeoJson] = useState(null);
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState([]);
  const [clearSignal, setClearSignal] = useState(0);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(hasAdminPassword());
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  useEffect(() => {
    fetchRoutes()
      .then((items) => {
        setRoutes(items);
        setSelectedRouteId(items[0]?.id ?? null);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!hasAdminPassword()) {
      setIsAuthenticated(false);
      return;
    }

    setIsAuthorizing(true);
    verifyAdminSession()
      .then(() => {
        setIsAuthenticated(true);
        setMessage("Sesion de admin activa.");
      })
      .catch(() => {
        clearAdminPassword();
        setIsAuthenticated(false);
      })
      .finally(() => setIsAuthorizing(false));
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setDraftGeoJson(null);
    setEditingRouteId(null);
    setClearSignal((current) => current + 1);
    setSelectedRouteId(routes[0]?.id ?? null);
  };

  const reloadRoutes = async () => {
    const updatedRoutes = await fetchRoutes();
    setRoutes(updatedRoutes);
    setSelectedRouteId(updatedRoutes[0]?.id ?? null);
  };

  const handleGeometryChange = (geoJson) => {
    setDraftGeoJson(geoJson);
    setMessage(editingRouteId ? "Geometria actualizada. Guarda los cambios cuando estes listo." : "Linea capturada. Completa el formulario para guardar la ruta.");
  };

  const handleDeleted = () => {
    setDraftGeoJson(null);
    setMessage("La geometria fue eliminada del mapa.");
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!draftGeoJson) {
      setMessage("Dibuja una linea en el mapa antes de guardar.");
      return;
    }

    try {
      const payload = {
        ...form,
        geojson: draftGeoJson,
      };

      if (editingRouteId) {
        await updateRoute(editingRouteId, payload);
      } else {
        await createRoute(payload);
      }

      resetForm();
      setMessage(editingRouteId ? "Ruta actualizada correctamente." : "Ruta guardada correctamente.");
      await reloadRoutes();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsAuthorizing(true);
    setMessage("");

    try {
      setAdminPassword(passwordInput);
      await verifyAdminSession();
      setIsAuthenticated(true);
      setPasswordInput("");
      setMessage("Acceso admin concedido.");
    } catch (error) {
      clearAdminPassword();
      setIsAuthenticated(false);
      setMessage(error.message);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleLogout = () => {
    clearAdminPassword();
    setIsAuthenticated(false);
    setPasswordInput("");
    setMessage("Sesion cerrada.");
  };

  const handleEditRoute = (route) => {
    setEditingRouteId(route.id);
    setForm({
      lineaDisplay: route.linea_display,
      lineaOperativa: route.linea_operativa,
      sentido: route.sentido,
      nombre: route.nombre,
      descripcion: route.descripcion || "",
      referencias: Array.isArray(route.referencias) ? route.referencias.join(", ") : "",
    });
    setDraftGeoJson(route.geometry);
    setSelectedRouteId(route.id);
    setMessage(`Editando la ruta ${route.linea_display} (${route.linea_operativa}). Puedes mover sus puntos en el mapa.`);
  };

  const handleDeleteRoute = async (routeId) => {
    try {
      await deleteRoute(routeId);

      if (editingRouteId === routeId) {
        resetForm();
      }

      setMessage("Ruta eliminada correctamente.");
      await reloadRoutes();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const highlightedRouteId = editingRouteId || selectedRouteId;
  const routeSummary = useMemo(
    () => routes.find((route) => route.id === highlightedRouteId) || null,
    [highlightedRouteId, routes]
  );

  if (!isAuthenticated) {
    return (
      <section className="admin-login-shell">
        <div className="admin-login-card">
          <h2>Acceso administrador</h2>
          <p className="muted">Protege el registro de rutas con una contrasena compartida. Configurala en la VPS con la variable `ADMIN_PASSWORD`.</p>

          <form className="admin-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Contrasena</span>
              <input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="Ingresa la contrasena admin"
                required
              />
            </label>

            <button className="primary-button" type="submit" disabled={isAuthorizing}>
              {isAuthorizing ? "Verificando..." : "Entrar al admin"}
            </button>
          </form>

          {message ? <p className="error">{message}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="layout admin-layout">
      <aside className="panel">
        <h2>Panel admin</h2>
        <p className="muted">Registra lineas de Potosi con su sentido real. Ejemplos: G-L con G de subida y L de bajada, o CH para ambos sentidos.</p>
        <p className="muted">Usa una ruta por sentido y apoya el trazado mirando las rutas ya registradas en el mismo mapa.</p>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Cerrar sesion admin
        </button>

        <form className="admin-form" onSubmit={handleSave}>
          <label className="field">
            <span>Linea visible</span>
            <input
              type="text"
              value={form.lineaDisplay}
              onChange={(event) => setForm((current) => ({ ...current, lineaDisplay: event.target.value.toUpperCase() }))}
              placeholder="Ej. G-L, CH, A, 010"
              required
            />
          </label>

          <label className="field">
            <span>Linea operativa de esta ruta</span>
            <input
              type="text"
              value={form.lineaOperativa}
              onChange={(event) => setForm((current) => ({ ...current, lineaOperativa: event.target.value.toUpperCase() }))}
              placeholder="Ej. G, L, CH, 010"
              required
            />
          </label>

          <label className="field">
            <span>Sentido</span>
            <select
              value={form.sentido}
              onChange={(event) => setForm((current) => ({ ...current, sentido: event.target.value }))}
            >
              <option value="subida">Subida</option>
              <option value="bajada">Bajada</option>
              <option value="ambos">Subida y bajada</option>
            </select>
          </label>

          <label className="field">
            <span>Nombre de la ruta</span>
            <input
              type="text"
              value={form.nombre}
              onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
              placeholder="Ej. Trufi Sopocachi - Centro"
              required
            />
          </label>

          <label className="field">
            <span>Descripcion</span>
            <textarea
              rows="4"
              value={form.descripcion}
              onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))}
              placeholder="Referencia, sentido o notas operativas"
            />
          </label>

          <label className="field">
            <span>Puntos de referencia</span>
            <textarea
              rows="3"
              value={form.referencias}
              onChange={(event) => setForm((current) => ({ ...current, referencias: event.target.value }))}
              placeholder="Ej. calle Villa, rotonda, Cabezon, exterminal, mercado Chuquimia, pasarela, extransito"
            />
          </label>

          <button className="primary-button" type="submit">
            {editingRouteId ? "Guardar cambios" : "Guardar ruta"}
          </button>
          {editingRouteId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancelar edicion
            </button>
          ) : null}
        </form>

        <div className="card">
          <h3>Estado</h3>
          <p>{draftGeoJson ? "Hay una geometria lista para guardar." : "Aun no hay una linea dibujada."}</p>
          <p className="muted">Cada trazo debe representar una sola operacion: una subida, una bajada o una linea bidireccional. Tambien puedes editar puntos de una ruta ya guardada.</p>
          <p className="muted">{mapEnabled ? "El editor del mapa esta listo." : "Cargando herramientas de dibujo..."}</p>
          {mapError ? <p className="error">{mapError}</p> : null}
          {message ? <p className="muted">{message}</p> : null}
        </div>

        <div className="card">
          <h3>Guia de trazado</h3>
          <p className="muted">1. Dibuja una sola direccion por vez.</p>
          <p className="muted">2. Usa varias paradas o curvas para que la linea siga mejor el recorrido real.</p>
          <p className="muted">3. Si editas una ruta existente, selecciona `Editar` y arrastra los puntos en el mapa.</p>
          {routeSummary ? (
            <p>{`Ruta destacada: ${routeSummary.linea_display} · ${routeSummary.linea_operativa} · ${routeSummary.sentido}`}</p>
          ) : null}
        </div>

        <div className="card">
          <h3>Rutas registradas</h3>
          <ul className="route-list compact">
            {routes.map((route) => (
              <li key={route.id} className={route.id === highlightedRouteId ? "active-list-item" : ""}>
                <div className="route-item-header">
                  <strong>{route.linea_display}</strong>
                  <span>{` ${route.linea_operativa} · ${route.sentido}`}</span>
                </div>
                <small>{route.nombre}</small>
                {route.referencias?.length ? <small>{route.referencias.join(" · ")}</small> : null}
                <div className="route-actions">
                  <button className="small-button" type="button" onClick={() => setSelectedRouteId(route.id)}>
                    Ver
                  </button>
                  <button className="small-button" type="button" onClick={() => handleEditRoute(route)}>
                    Editar
                  </button>
                  <button className="small-button danger" type="button" onClick={() => handleDeleteRoute(route.id)}>
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="map-panel">
        <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom className="map" style={{ height: "70vh" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {routes.map((route) => (
            <Polyline
              key={route.id}
              positions={geometryToLatLngs(route.geometry)}
              pathOptions={{
                color: route.id === highlightedRouteId ? "#d9480f" : "#64748b",
                weight: route.id === highlightedRouteId ? 6 : 3,
                opacity: route.id === highlightedRouteId ? 0.95 : 0.5,
              }}
              eventHandlers={{
                click: () => setSelectedRouteId(route.id),
              }}
            >
              <Popup>
                <strong>{route.linea_display}</strong>
                <br />
                {`${route.linea_operativa} · ${route.sentido}`}
                <br />
                {route.nombre}
              </Popup>
            </Polyline>
          ))}
          <AdminDrawControl
            onGeometryChange={handleGeometryChange}
            onDeleted={handleDeleted}
            clearSignal={clearSignal}
            initialGeometry={draftGeoJson}
            onReadyStateChange={setMapEnabled}
            onError={(error) => setMapError(error.message)}
          />
        </MapContainer>
      </div>
    </section>
  );
}

export default AdminPage;
