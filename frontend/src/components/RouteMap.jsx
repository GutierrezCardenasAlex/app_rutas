import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/images/marker-icon.png";
import "leaflet/dist/images/marker-shadow.png";

const userIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [12, 41],
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

function RouteMap({ center, routes, selectedRouteId, height = "70vh" }) {
  return (
    <MapContainer center={center || [-19.5836, -65.7531]} zoom={13} scrollWheelZoom className="map" style={{ height }}>
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
      {routes.map((route) => (
        <Polyline
          key={route.id}
          positions={geometryToLatLngs(route.geometry)}
          pathOptions={{
            color: route.id === selectedRouteId ? "#d9480f" : "#1d4ed8",
            weight: route.id === selectedRouteId ? 6 : 4,
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
          </Popup>
        </Polyline>
      ))}
    </MapContainer>
  );
}

export default RouteMap;
