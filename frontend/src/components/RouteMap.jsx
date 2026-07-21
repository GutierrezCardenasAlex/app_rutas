import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/images/marker-icon.png";
import "leaflet/dist/images/marker-shadow.png";

const userIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [12, 41],
});

const destinationIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [12, 41],
  className: "destination-marker",
});

const transferIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [12, 41],
  className: "transfer-marker",
});

function RecenterMap({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom(), {
        animate: true,
      });
    }
  }, [center, map]);

  return null;
}

function geometryToLatLngs(geometry) {
  if (!geometry?.coordinates) {
    return [];
  }

  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

function DestinationSelector({ onDestinationSelect }) {
  useMapEvents({
    click(event) {
      onDestinationSelect?.([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function RouteMap({
  center,
  destinationPoint,
  transferPoint,
  onDestinationSelect,
  routes,
  selectedRouteId,
  selectedRouteIds = [],
  height = "70vh",
}) {
  const highlightedIds = new Set([selectedRouteId, ...selectedRouteIds].filter(Boolean));

  return (
    <MapContainer center={center || [-19.5836, -65.7531]} zoom={13} scrollWheelZoom className="map" style={{ height }}>
      <DestinationSelector onDestinationSelect={onDestinationSelect} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {center ? (
        <>
          <RecenterMap center={center} />
          <Marker position={center} icon={userIcon}>
            <Popup>Tu ubicacion actual</Popup>
          </Marker>
        </>
      ) : null}
      {destinationPoint ? (
        <Marker position={destinationPoint} icon={destinationIcon}>
          <Popup>Destino marcado en el mapa</Popup>
        </Marker>
      ) : null}
      {center && destinationPoint ? (
        <Polyline
          positions={[center, destinationPoint]}
          pathOptions={{
            color: "#16a34a",
            dashArray: "8 10",
            weight: 4,
          }}
        />
      ) : null}
      {transferPoint ? (
        <Marker position={transferPoint} icon={transferIcon}>
          <Popup>Punto aproximado para cambiar de micro</Popup>
        </Marker>
      ) : null}
      {routes.map((route) => (
        <Polyline
          key={route.id}
          positions={geometryToLatLngs(route.geometry)}
          pathOptions={{
            color: highlightedIds.has(route.id) ? "#d9480f" : "#1d4ed8",
            weight: highlightedIds.has(route.id) ? 6 : 4,
          }}
        >
          <Popup>
            <strong>{route.linea_display}</strong>
            <br />
            {`${route.linea_operativa} · ${route.sentido}`}
            <br />
            {route.nombre}
            <br />
            {route.descripcion || "Sin descripcion"}
            {route.referencias?.length ? (
              <>
                <br />
                {route.referencias.join(" · ")}
              </>
            ) : null}
          </Popup>
        </Polyline>
      ))}
    </MapContainer>
  );
}

export default RouteMap;
