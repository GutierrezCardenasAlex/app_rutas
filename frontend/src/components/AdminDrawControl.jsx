import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import { useMap } from "react-leaflet";

function createLayerFromGeometry(geometry) {
  if (!geometry?.coordinates?.length) {
    return null;
  }

  const latLngs = geometry.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
  return L.polyline(latLngs);
}

function AdminDrawControl({ onGeometryChange, onDeleted, clearSignal, initialGeometry }) {
  const map = useMap();
  const drawnItemsRef = useRef(null);
  const activeLayerRef = useRef(null);

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
        edit: true,
        remove: true,
      },
    });

    const syncLayer = (layer) => {
      drawnItems.clearLayers();
      if (layer) {
        drawnItems.addLayer(layer);
        activeLayerRef.current = layer;
        onGeometryChange(layer.toGeoJSON().geometry);
      } else {
        activeLayerRef.current = null;
      }
    };

    const handleCreate = (event) => {
      syncLayer(event.layer);
    };

    const handleEdit = (event) => {
      event.layers.eachLayer((layer) => {
        syncLayer(layer);
      });
    };

    const handleDelete = () => {
      drawnItems.clearLayers();
      activeLayerRef.current = null;
      onDeleted();
    };

    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, handleCreate);
    map.on(L.Draw.Event.EDITED, handleEdit);
    map.on(L.Draw.Event.DELETED, handleDelete);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreate);
      map.off(L.Draw.Event.EDITED, handleEdit);
      map.off(L.Draw.Event.DELETED, handleDelete);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onGeometryChange, onDeleted]);

  useEffect(() => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
      activeLayerRef.current = null;
    }
  }, [clearSignal]);

  useEffect(() => {
    if (!drawnItemsRef.current) {
      return;
    }

    drawnItemsRef.current.clearLayers();
    activeLayerRef.current = null;

    const layer = createLayerFromGeometry(initialGeometry);
    if (layer) {
      drawnItemsRef.current.addLayer(layer);
      activeLayerRef.current = layer;
      map.fitBounds(layer.getBounds(), { padding: [24, 24] });
    }
  }, [initialGeometry, map]);

  return null;
}

export default AdminDrawControl;
