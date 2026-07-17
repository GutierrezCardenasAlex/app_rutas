import { useEffect, useMemo, useState } from "react";
import RouteMap from "../components/RouteMap.jsx";
import { fetchNearbyRoutes, fetchRoutePlan, fetchRoutes } from "../lib/api.js";

function pickReference(references, fraction, fallback) {
  if (!Array.isArray(references) || references.length === 0 || !Number.isFinite(Number(fraction))) {
    return fallback;
  }

  const safeFraction = Math.min(1, Math.max(0, Number(fraction)));
  const index = Math.round(safeFraction * (references.length - 1));
  return references[index] || fallback;
}

function HomePage() {
  const [position, setPosition] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [nearbyRoutes, setNearbyRoutes] = useState([]);
  const [destination, setDestination] = useState("");
  const [destinationPoint, setDestinationPoint] = useState(null);
  const [status, setStatus] = useState("Solicitando ubicacion...");
  const [error, setError] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routePlan, setRoutePlan] = useState(null);
  const [planStatus, setPlanStatus] = useState("");
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  useEffect(() => {
    fetchRoutes()
      .then(setAllRoutes)
      .catch((apiError) => setError(apiError.message));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("Ubicacion en tiempo real deshabilitada");
      setError("La geolocalizacion solo funciona en HTTPS o en localhost. En la VPS por HTTP podras seguir viendo y registrando rutas, pero no detectar tu ubicacion.");
      return undefined;
    }

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
    const baseRoutes = nearbyRoutes.length > 0 ? nearbyRoutes : allRoutes;
    const routeMap = new Map(baseRoutes.map((route) => [route.id, route]));

    routePlan?.direct?.forEach((route) => {
      routeMap.set(route.id, route);
    });

    routePlan?.transfers?.forEach((plan) => {
      routeMap.set(plan.first_route_id, {
        id: plan.first_route_id,
        linea_display: plan.first_linea_display,
        linea_operativa: plan.first_linea_operativa,
        sentido: plan.first_sentido,
        nombre: plan.first_nombre,
        descripcion: plan.first_descripcion,
        referencias: plan.first_referencias,
        geometry: plan.first_geometry,
      });
      routeMap.set(plan.second_route_id, {
        id: plan.second_route_id,
        linea_display: plan.second_linea_display,
        linea_operativa: plan.second_linea_operativa,
        sentido: plan.second_sentido,
        nombre: plan.second_nombre,
        descripcion: plan.second_descripcion,
        referencias: plan.second_referencias,
        geometry: plan.second_geometry,
      });
    });

    return Array.from(routeMap.values());
  }, [allRoutes, nearbyRoutes, routePlan]);

  useEffect(() => {
    if (!position || !destinationPoint) {
      setRoutePlan(null);
      setPlanStatus("");
      return undefined;
    }

    let ignore = false;
    setPlanStatus("Calculando combinacion de lineas...");

    fetchRoutePlan(position[0], position[1], destinationPoint[0], destinationPoint[1])
      .then((plan) => {
        if (ignore) {
          return;
        }

        setRoutePlan(plan);
        setSelectedPlanIndex(0);

        if (plan.direct.length > 0) {
          setSelectedRouteId(plan.direct[0].id);
          setPlanStatus("Se encontro una linea directa.");
          return;
        }

        if (plan.transfers.length > 0) {
          setSelectedRouteId(plan.transfers[0].first_route_id);
          setPlanStatus("Se encontro una combinacion con transbordo.");
          return;
        }

        setPlanStatus("No encontramos una combinacion cercana con las rutas registradas.");
      })
      .catch((apiError) => {
        if (!ignore) {
          setPlanStatus(apiError.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [destinationPoint, position]);

  const recommendations = useMemo(() => {
    if (!routePlan) {
      return [];
    }

    return [
      ...routePlan.direct.map((route) => ({
        type: "direct",
        title: `Toma la linea ${route.linea_display}`,
        routeIds: [route.id],
        description: `Sube a ${route.linea_operativa} (${route.sentido}) cerca de ${pickReference(route.referencias, route.origin_fraction, "tu ubicacion")}. Mantente en esa linea hasta ${pickReference(route.referencias, route.destination_fraction, "el destino marcado")}.`,
        details: `Estas a ${route.origin_distance_meters} m de la linea y te deja a ${route.destination_distance_meters} m del destino.`,
      })),
      ...routePlan.transfers.map((plan) => {
        const [transferLng, transferLat] = plan.transfer_point.coordinates;
        const firstStop = pickReference(plan.first_referencias, plan.first_transfer_fraction, "el punto de transbordo");
        const secondStop = pickReference(plan.second_referencias, plan.second_transfer_fraction, "el punto de transbordo");
        const finalStop = pickReference(plan.second_referencias, plan.destination_fraction, "el destino marcado");

        return {
          type: "transfer",
          title: `Toma ${plan.first_linea_display} y luego ${plan.second_linea_display}`,
          routeIds: [plan.first_route_id, plan.second_route_id],
          description: `Primero toma ${plan.first_linea_operativa} (${plan.first_sentido}) y baja cerca de ${firstStop}. Luego busca ${plan.second_linea_operativa} (${plan.second_sentido}) cerca de ${secondStop} y sigue hasta ${finalStop}.`,
          details: `Transbordo aproximado: ${transferLat.toFixed(5)}, ${transferLng.toFixed(5)}. Las lineas se acercan a ${plan.transfer_distance_meters} m.`,
        };
      }),
    ];
  }, [routePlan]);

  const selectedRecommendation = recommendations[selectedPlanIndex] || null;

  const handleDestinationSelect = (point) => {
    setDestinationPoint(point);
    setStatus("Destino marcado en el mapa");
  };

  const clearDestinationPoint = () => {
    setDestinationPoint(null);
    setRoutePlan(null);
    setPlanStatus("");
  };

  const destinationSummary = destinationPoint
    ? `Destino marcado: ${destinationPoint[0].toFixed(5)}, ${destinationPoint[1].toFixed(5)}`
    : "";

  return (
    <section className="layout">
      <aside className="panel">
        <h2>Planifica tu recorrido</h2>
        <p className="muted">{status}</p>
        <p className="muted">Sistema pensado para lineas de Potosi como A, J, X, P, 010, 08, 012, G-L o CH.</p>

        <label className="field">
          <span>Destino</span>
          <input
            type="text"
            placeholder="Ej. Plaza 10 de Noviembre, terminal, mercado..."
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>

        <div className="card destination-card">
          <h3>Destino en mapa</h3>
          <p className="muted">
            {destinationPoint
              ? destinationSummary
              : "Tambien puedes tocar el mapa para marcar tu destino sin escribirlo."}
          </p>
          {destinationPoint ? (
            <button className="secondary-button" type="button" onClick={clearDestinationPoint}>
              Quitar marcador
            </button>
          ) : null}
        </div>

        <div className="card">
          <h3>Como llegar</h3>
          {!position ? <p className="muted">Activa tu ubicacion para calcular desde donde estas.</p> : null}
          {!destinationPoint ? <p className="muted">Marca tu destino en el mapa para calcular lineas y transbordos.</p> : null}
          {planStatus ? <p className="muted">{planStatus}</p> : null}
          {recommendations.length > 0 ? (
            <ul className="route-list">
              {recommendations.map((recommendation, index) => (
                <li key={`${recommendation.type}-${index}`}>
                  <button
                    type="button"
                    className={index === selectedPlanIndex ? "route-button active" : "route-button"}
                    onClick={() => {
                      setSelectedPlanIndex(index);
                      setSelectedRouteId(recommendation.routeIds[0]);
                    }}
                  >
                    <span>{recommendation.title}</span>
                    <small>{recommendation.type === "direct" ? "Directo" : "Transbordo"}</small>
                  </button>
                  {index === selectedPlanIndex ? (
                    <div className="plan-detail">
                      <p>{recommendation.description}</p>
                      <p className="muted">{recommendation.details}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

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
                    <span>{`${route.linea_display} · ${route.sentido}`}</span>
                    <small>{`${route.distance_meters} m`}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Resumen</h3>
          <p>
            {destination
              ? `Destino ingresado: ${destination}`
              : destinationPoint
                ? destinationSummary
                : "Ingresa un destino o marca un punto en el mapa."}
          </p>
          <p>{`Rutas disponibles en el mapa: ${routesToDisplay.length}`}</p>
          {routesToDisplay[0] ? (
            <p>{`Linea destacada: ${routesToDisplay[0].linea_display} (${routesToDisplay[0].linea_operativa} · ${routesToDisplay[0].sentido})`}</p>
          ) : null}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </aside>

      <div className="map-panel">
        <RouteMap
          center={position}
          destinationPoint={destinationPoint}
          onDestinationSelect={handleDestinationSelect}
          routes={routesToDisplay}
          selectedRouteId={selectedRouteId}
          selectedRouteIds={selectedRecommendation?.routeIds || []}
        />
      </div>
    </section>
  );
}

export default HomePage;
