import { useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import AdminDrawControl from "../components/AdminDrawControl.jsx";
import { createRoute, fetchRoutes } from "../lib/api.js";

const defaultCenter = [-19.5836, -65.7531];

function AdminPage() {
  const [form, setForm] = useState({
    lineaDisplay: "",
    lineaOperativa: "",
    sentido: "subida",
    nombre: "",
    descripcion: "",
  });
  const [draftGeoJson, setDraftGeoJson] = useState(null);
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState([]);
  const [clearSignal, setClearSignal] = useState(0);

  useEffect(() => {
    fetchRoutes().then(setRoutes).catch((error) => setMessage(error.message));
  }, []);

  const handleCreated = (geoJson) => {
    setDraftGeoJson(geoJson);
    setMessage("Linea capturada. Completa el formulario para guardar la ruta.");
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
      await createRoute({
        ...form,
        geojson: draftGeoJson,
      });

      setForm({
        lineaDisplay: "",
        lineaOperativa: "",
        sentido: "subida",
        nombre: "",
        descripcion: "",
      });
      setDraftGeoJson(null);
      setClearSignal((current) => current + 1);
      setMessage("Ruta guardada correctamente.");

      const updatedRoutes = await fetchRoutes();
      setRoutes(updatedRoutes);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section className="layout admin-layout">
      <aside className="panel">
        <h2>Panel admin</h2>
        <p className="muted">Registra lineas de Potosi con su sentido real. Ejemplos: G-L con G de subida y L de bajada, o CH para ambos sentidos.</p>

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

          <button className="primary-button" type="submit">
            Guardar ruta
          </button>
        </form>

        <div className="card">
          <h3>Estado</h3>
          <p>{draftGeoJson ? "Hay una geometria lista para guardar." : "Aun no hay una linea dibujada."}</p>
          <p className="muted">Cada trazo debe representar una sola operacion: una subida, una bajada o una linea bidireccional.</p>
          {message ? <p className="muted">{message}</p> : null}
        </div>

        <div className="card">
          <h3>Rutas registradas</h3>
          <ul className="route-list compact">
            {routes.map((route) => (
              <li key={route.id}>
                <strong>{route.linea_display}</strong>
                <span>{` ${route.linea_operativa} · ${route.sentido}`}</span>
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
          <AdminDrawControl onCreated={handleCreated} onDeleted={handleDeleted} clearSignal={clearSignal} />
        </MapContainer>
      </div>
    </section>
  );
}

export default AdminPage;
