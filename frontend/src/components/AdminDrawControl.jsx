import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import { useMap } from "react-leaflet";

function AdminDrawControl({ onCreated, onDeleted, clearSignal }) {
  const map = useMap();
  const drawnItemsRef = useRef(null);

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polygon: false,
        polyline: true,
      },
      edit: {
        featureGroup: drawnItems,
        edit: false,
        remove: true,
      },
    });

    const handleCreate = (event) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      onCreated(event.layer.toGeoJSON().geometry);
    };

    const handleDelete = () => {
      drawnItems.clearLayers();
      onDeleted();
    };

    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, handleCreate);
    map.on(L.Draw.Event.DELETED, handleDelete);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreate);
      map.off(L.Draw.Event.DELETED, handleDelete);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onCreated, onDeleted]);

  useEffect(() => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
  }, [clearSignal]);

  return null;
}

export default AdminDrawControl;
