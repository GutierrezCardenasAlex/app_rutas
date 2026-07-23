import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import AdminDrawControl from "../components/AdminDrawControl.jsx";
import {
  clearAdminPassword,
  createGuideEvent,
  createGuidePlace,
  createRoute,
  deleteGuideEvent,
  deleteGuidePlace,
  fetchGuides,
  deleteRoute,
  fetchRoutes,
  hasAdminPassword,
  setAdminPassword,
  updateGuideEvent,
  updateGuidePlace,
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
const emptyEventForm = {
  title: "",
  subtitle: "",
  type: "Evento",
  dateLabel: "",
  description: "",
  routeColor: "#dc2626",
  fraternities: "",
};
const emptyPlaceForm = {
  name: "",
  category: "Turistico",
  description: "",
  lat: "",
  lng: "",
};

function geometryToLatLngs(geometry) {
  if (!geometry?.coordinates) {
    return [];
  }

  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

function geometryToGuideRoute(geometry) {
  return geometryToLatLngs(geometry);
}

function parseFraternities(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", time = "", meetingPoint = ""] = line.split("|").map((item) => item.trim());
      return { name, time, meetingPoint };
    })
    .filter((item) => item.name);
}

function formatFraternities(fraternities) {
  return (fraternities || [])
    .map((item) => [item.name, item.time, item.meetingPoint].filter(Boolean).join(" | "))
    .join("\n");
}

function ReferencePointPicker({ enabled, onAddPoint, onPickPlace }) {
  useMapEvents({
    click(event) {
      if (!enabled && !onPickPlace) {
        return;
      }

      if (onPickPlace) {
        onPickPlace([event.latlng.lat, event.latlng.lng]);
        return;
      }

      const nombre = window.prompt("Nombre del punto de referencia. Ej. Mercado Chuquimia");

      if (!nombre?.trim()) {
        return;
      }

      onAddPoint({
        nombre: nombre.trim(),
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
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
  const [referencePoints, setReferencePoints] = useState([]);
  const [isAddingReferencePoint, setIsAddingReferencePoint] = useState(false);
  const [guides, setGuides] = useState({ events: [], places: [] });
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [placeForm, setPlaceForm] = useState(emptyPlaceForm);
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [isPickingPlace, setIsPickingPlace] = useState(false);

  useEffect(() => {
    fetchRoutes()
      .then((items) => {
        setRoutes(items);
        setSelectedRouteId(items[0]?.id ?? null);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    fetchGuides()
      .then(setGuides)
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
    setReferencePoints([]);
    setIsAddingReferencePoint(false);
    setEditingRouteId(null);
    setClearSignal((current) => current + 1);
    setSelectedRouteId(routes[0]?.id ?? null);
  };

  const reloadRoutes = async () => {
    const updatedRoutes = await fetchRoutes();
    setRoutes(updatedRoutes);
    setSelectedRouteId(updatedRoutes[0]?.id ?? null);
  };

  const reloadGuides = async () => {
    const updatedGuides = await fetchGuides();
    setGuides(updatedGuides);
  };

  const handleGeometryChange = (geoJson) => {
    setDraftGeoJson(geoJson);
    setMessage(editingRouteId ? "Geometria actualizada. Guarda los cambios cuando estes listo." : "Linea capturada. Completa el formulario para guardar la ruta.");
  };

  const handleDeleted = () => {
    setDraftGeoJson(null);
    setMessage("La geometria fue eliminada del mapa.");
  };

  const resetEventForm = () => {
    setEventForm(emptyEventForm);
    setEditingEventId(null);
    setDraftGeoJson(null);
    setClearSignal((current) => current + 1);
  };

  const resetPlaceForm = () => {
    setPlaceForm(emptyPlaceForm);
    setEditingPlaceId(null);
    setIsPickingPlace(false);
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
        referencePoints,
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

  const handleSaveEvent = async (event) => {
    event.preventDefault();

    if (!draftGeoJson) {
      setMessage("Dibuja el recorrido del evento en el mapa antes de guardar.");
      return;
    }

    try {
      const payload = {
        ...eventForm,
        route: geometryToGuideRoute(draftGeoJson),
        fraternities: parseFraternities(eventForm.fraternities),
      };

      if (editingEventId) {
        await updateGuideEvent(editingEventId, payload);
      } else {
        await createGuideEvent(payload);
      }

      resetEventForm();
      setMessage(editingEventId ? "Evento actualizado correctamente." : "Evento guardado correctamente.");
      await reloadGuides();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleSavePlace = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        ...placeForm,
        lat: Number(placeForm.lat),
        lng: Number(placeForm.lng),
      };

      if (editingPlaceId) {
        await updateGuidePlace(editingPlaceId, payload);
      } else {
        await createGuidePlace(payload);
      }

      resetPlaceForm();
      setMessage(editingPlaceId ? "Lugar actualizado correctamente." : "Lugar guardado correctamente.");
      await reloadGuides();
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
    setReferencePoints(route.reference_points || []);
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

  const handleEditEvent = (event) => {
    setEditingEventId(event.id);
    setEventForm({
      title: event.title,
      subtitle: event.subtitle || "",
      type: event.type || "Evento",
      dateLabel: event.dateLabel || "",
      description: event.description || "",
      routeColor: event.routeColor || "#dc2626",
      fraternities: formatFraternities(event.fraternities),
    });
    setDraftGeoJson({
      type: "LineString",
      coordinates: event.route.map(([lat, lng]) => [lng, lat]),
    });
    setMessage(`Editando evento ${event.title}. Puedes redibujar su recorrido en el mapa.`);
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteGuideEvent(eventId);
      setMessage("Evento eliminado correctamente.");
      await reloadGuides();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleEditPlace = (place) => {
    setEditingPlaceId(place.id);
    setPlaceForm({
      name: place.name,
      category: place.category,
      description: place.description || "",
      lat: place.position[0],
      lng: place.position[1],
    });
    setMessage(`Editando lugar ${place.name}. Puedes marcar otro punto en el mapa.`);
  };

  const handleDeletePlace = async (placeId) => {
    try {
      await deleteGuidePlace(placeId);
      setMessage("Lugar eliminado correctamente.");
      await reloadGuides();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const highlightedRouteId = editingRouteId || selectedRouteId;
  const routeSummary = useMemo(
    () => routes.find((route) => route.id === highlightedRouteId) || null,
    [highlightedRouteId, routes]
  );
  const highlightedReferencePoints = referencePoints.length > 0 ? referencePoints : routeSummary?.reference_points || [];

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

          <div className="card reference-editor">
            <h3>Puntos marcados en mapa</h3>
            <p className="muted">
              Activa el modo y haz clic en el mapa para marcar lugares como mercado Chuquimia, Coliseo La Plata o una calle importante.
            </p>
            <button
              className={isAddingReferencePoint ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => setIsAddingReferencePoint((current) => !current)}
            >
              {isAddingReferencePoint ? "Modo marcar punto activo" : "Agregar punto de referencia"}
            </button>
            {referencePoints.length > 0 ? (
              <ul className="reference-point-list">
                {referencePoints.map((point, index) => (
                  <li key={`${point.nombre}-${point.lat}-${point.lng}`}>
                    <span>{`${index + 1}. ${point.nombre}`}</span>
                    <button
                      className="small-button danger"
                      type="button"
                      onClick={() =>
                        setReferencePoints((current) => current.filter((_, pointIndex) => pointIndex !== index))
                      }
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aun no hay puntos marcados para esta ruta.</p>
            )}
          </div>

          <button className="primary-button" type="submit">
            {editingRouteId ? "Guardar cambios" : "Guardar ruta"}
          </button>
          {editingRouteId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancelar edicion
            </button>
          ) : null}
        </form>

        <form className="admin-form" onSubmit={handleSaveEvent}>
          <div className="card reference-editor">
            <h3>Eventos: Ch'utillos y convites</h3>
            <p className="muted">
              Dibuja en el mapa el recorrido del evento y llena fraternidades con el formato: Nombre | Hora | Punto.
            </p>
            <label className="field">
              <span>Titulo</span>
              <input
                type="text"
                value={eventForm.title}
                onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej. Ch'utillos, Convites"
              />
            </label>
            <label className="field">
              <span>Subtitulo</span>
              <input
                type="text"
                value={eventForm.subtitle}
                onChange={(event) => setEventForm((current) => ({ ...current, subtitle: event.target.value }))}
                placeholder="Ej. Recorrido principal"
              />
            </label>
            <label className="field">
              <span>Tipo y fecha</span>
              <input
                type="text"
                value={eventForm.type}
                onChange={(event) => setEventForm((current) => ({ ...current, type: event.target.value }))}
                placeholder="Ej. Fiesta mayor"
              />
              <input
                type="text"
                value={eventForm.dateLabel}
                onChange={(event) => setEventForm((current) => ({ ...current, dateLabel: event.target.value }))}
                placeholder="Ej. Sabado 24 de agosto, 09:00"
              />
            </label>
            <label className="field">
              <span>Descripcion</span>
              <textarea
                rows="3"
                value={eventForm.description}
                onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Explica por donde pasa y como ayuda a la movilidad."
              />
            </label>
            <label className="field">
              <span>Color del recorrido</span>
              <input
                type="color"
                value={eventForm.routeColor}
                onChange={(event) => setEventForm((current) => ({ ...current, routeColor: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Fraternidades y horarios</span>
              <textarea
                rows="5"
                value={eventForm.fraternities}
                onChange={(event) => setEventForm((current) => ({ ...current, fraternities: event.target.value }))}
                placeholder={"Tinkus Central | 09:00 | Concentracion inicial\nMorenada Potosi | 10:30 | Av. civica"}
              />
            </label>
            <button className="primary-button" type="submit">
              {editingEventId ? "Guardar evento" : "Crear evento"}
            </button>
            {editingEventId ? (
              <button className="secondary-button" type="button" onClick={resetEventForm}>
                Cancelar evento
              </button>
            ) : null}
            <ul className="route-list compact">
              {guides.events.map((event) => (
                <li key={event.id}>
                  <strong>{event.title}</strong>
                  <small>{`${event.type || "Evento"} · ${event.dateLabel || "Sin fecha"}`}</small>
                  <small>{`${event.fraternities?.length || 0} fraternidad(es)`}</small>
                  <div className="route-actions">
                    <button className="small-button" type="button" onClick={() => handleEditEvent(event)}>
                      Editar
                    </button>
                    <button className="small-button danger" type="button" onClick={() => handleDeleteEvent(event.id)}>
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </form>

        <form className="admin-form" onSubmit={handleSavePlace}>
          <div className="card reference-editor">
            <h3>Lugares turisticos, discotecas y referencias</h3>
            <p className="muted">Activa el marcador y haz clic en el mapa para guardar el punto exacto del lugar.</p>
            <label className="field">
              <span>Nombre</span>
              <input
                type="text"
                value={placeForm.name}
                onChange={(event) => setPlaceForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ej. Casa de Moneda, discoteca, mirador..."
              />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select
                value={placeForm.category}
                onChange={(event) => setPlaceForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="Turistico">Turistico</option>
                <option value="Diversion">Diversion</option>
                <option value="Referencia">Referencia</option>
                <option value="Salud">Salud</option>
                <option value="Comercio">Comercio</option>
              </select>
            </label>
            <label className="field">
              <span>Descripcion</span>
              <textarea
                rows="3"
                value={placeForm.description}
                onChange={(event) => setPlaceForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Ayuda al usuario a reconocer el lugar."
              />
            </label>
            <button
              className={isPickingPlace ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => setIsPickingPlace((current) => !current)}
            >
              {isPickingPlace ? "Haz clic en el mapa" : "Marcar punto del lugar"}
            </button>
            {placeForm.lat && placeForm.lng ? <p className="muted">{`Punto: ${Number(placeForm.lat).toFixed(5)}, ${Number(placeForm.lng).toFixed(5)}`}</p> : null}
            <button className="primary-button" type="submit">
              {editingPlaceId ? "Guardar lugar" : "Crear lugar"}
            </button>
            {editingPlaceId ? (
              <button className="secondary-button" type="button" onClick={resetPlaceForm}>
                Cancelar lugar
              </button>
            ) : null}
            <ul className="route-list compact">
              {guides.places.map((place) => (
                <li key={place.id}>
                  <strong>{place.name}</strong>
                  <small>{`${place.category} · ${place.description || "Sin descripcion"}`}</small>
                  <div className="route-actions">
                    <button className="small-button" type="button" onClick={() => handleEditPlace(place)}>
                      Editar
                    </button>
                    <button className="small-button danger" type="button" onClick={() => handleDeletePlace(place.id)}>
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
                {route.reference_points?.length ? (
                  <small>{`Puntos: ${route.reference_points.map((point) => point.nombre).join(" · ")}`}</small>
                ) : null}
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
          {guides.events.map((event) => (
            <Polyline
              key={`event-${event.id}`}
              positions={event.route}
              pathOptions={{
                color: event.routeColor || "#dc2626",
                weight: editingEventId === event.id ? 7 : 4,
                opacity: editingEventId === event.id ? 0.95 : 0.55,
                dashArray: "12 8",
              }}
            >
              <Popup>
                <strong>{event.title}</strong>
                <br />
                {event.subtitle || "Recorrido de evento"}
              </Popup>
            </Polyline>
          ))}
          {guides.places.map((place) => (
            <Marker key={`place-${place.id}`} position={place.position}>
              <Popup>
                <strong>{place.name}</strong>
                <br />
                {place.category}
              </Popup>
            </Marker>
          ))}
          {placeForm.lat && placeForm.lng ? (
            <Marker position={[Number(placeForm.lat), Number(placeForm.lng)]}>
              <Popup>{placeForm.name || "Lugar seleccionado"}</Popup>
            </Marker>
          ) : null}
          {highlightedReferencePoints.map((point, index) => (
            <Marker key={`${point.nombre}-${point.lat}-${point.lng}-${index}`} position={[point.lat, point.lng]}>
              <Popup>
                <strong>{point.nombre}</strong>
                <br />
                {routeSummary ? `${routeSummary.linea_display} · ${routeSummary.linea_operativa}` : "Punto de referencia"}
              </Popup>
            </Marker>
          ))}
          <ReferencePointPicker
            enabled={isAddingReferencePoint}
            onPickPlace={
              isPickingPlace
                ? ([lat, lng]) => {
                    setPlaceForm((current) => ({ ...current, lat, lng }));
                    setIsPickingPlace(false);
                    setMessage("Punto del lugar marcado. Completa los datos y guarda.");
                  }
                : null
            }
            onAddPoint={(point) => {
              setReferencePoints((current) => [...current, point]);
              setMessage(`Punto agregado: ${point.nombre}.`);
            }}
          />
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
