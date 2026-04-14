import { useEffect, useMemo, useState } from "react";
import RouteMap from "../components/RouteMap.jsx";
import { fetchNearbyRoutes, fetchRoutes } from "../lib/api.js";

function HomePage() {
  const [position, setPosition] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [nearbyRoutes, setNearbyRoutes] = useState([]);
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("Solicitando ubicacion...");
  const [error, setError] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  useEffect(() => {
    fetchRoutes()
      .then(setAllRoutes)
      .catch((apiError) => setError(apiError.message));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalizacion.");
      setStatus("Geolocalizacion no disponible");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (coords) => {
        const nextPosition = [coords.coords.latitude, coords.coords.longitude];
        setPosition(nextPosition);
        setStatus("Ubicacion actualizada en tiempo real");

        try {
          const routes = await fetchNearbyRoutes(coords.coords.latitude, coords.coords.longitude);
          setNearbyRoutes(routes);
          setSelectedRouteId(routes[0]?.id ?? null);
        } catch (apiError) {
          setError(apiError.message);
        }
      },
      (geoError) => {
        setError(geoError.message);
        setStatus("No se pudo obtener tu ubicacion");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const routesToDisplay = useMemo(() => {
    if (nearbyRoutes.length > 0) {
      return nearbyRoutes;
    }

    return allRoutes;
  }, [allRoutes, nearbyRoutes]);

  return (
    <section className="layout">
      <aside className="panel">
        <h2>Planifica tu recorrido</h2>
        <p className="muted">{status}</p>

        <label className="field">
          <span>Destino</span>
          <input
            type="text"
            placeholder="Ej. Prado, terminal, mercado..."
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>

        <div className="card">
          <h3>Rutas cercanas</h3>
          {nearbyRoutes.length === 0 ? (
            <p className="muted">Aun no hay rutas dentro de 500 metros. Mostrando todas las rutas registradas.</p>
          ) : (
            <ul className="route-list">
              {nearbyRoutes.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    className={route.id === selectedRouteId ? "route-button active" : "route-button"}
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    <span>{route.nombre}</span>
                    <small>{route.distance_meters} m</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Resumen</h3>
          <p>{destination ? `Destino ingresado: ${destination}` : "Ingresa un destino para orientar la recomendacion visual."}</p>
          <p>{`Rutas disponibles en el mapa: ${routesToDisplay.length}`}</p>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </aside>

      <div className="map-panel">
        <RouteMap center={position} routes={routesToDisplay} selectedRouteId={selectedRouteId} />
      </div>
    </section>
  );
}

export default HomePage;
