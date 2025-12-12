import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface NavigationPoint {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'start' | 'waypoint' | 'end';
  order: number;
}

interface RoadSegment {
  id: string;
  startNavPointId: string;
  endNavPointId: string;
}

interface MapViewerProps {
  navigationPoints: NavigationPoint[];
  roadSegments?: RoadSegment[];
  onMapClick?: (position: { x: number; y: number }) => void;
  robotPosition?: { x: number; y: number };
  center?: [number, number];
  zoom?: number;
}

const MapUpdater: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

const MapEvents: React.FC<{ onMapClick?: (position: { x: number; y: number }) => void }> = ({ onMapClick }) => {
  const map = useMap();
  useEffect(() => {
    if (onMapClick) {
      const handleClick = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onMapClick({ x: lng, y: lat });
      };
      map.on('click', handleClick);
      return () => {
        map.off('click', handleClick);
      };
    }
  }, [map, onMapClick]);
  return null;
};

const MapViewer: React.FC<MapViewerProps> = ({
  navigationPoints,
  roadSegments = [],
  onMapClick,
  robotPosition,
  center = [0, 0],
  zoom = 15,
}) => {
  const mapRef = useRef<L.Map | null>(null);

  const getMarkerIcon = (type: string) => {
    const colors: Record<string, string> = {
      start: 'green',
      waypoint: 'blue',
      end: 'red',
    };
    const color = colors[type] || 'gray';
    
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background-color: ${color};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      "></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  };

  const robotIcon = L.divIcon({
    className: 'robot-marker',
    html: `<div style="
      background-color: orange;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    ">🤖</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });

  const getPathLines = () => {
    if (roadSegments.length === 0 || navigationPoints.length === 0) return [];

    return roadSegments.map((segment) => {
      const startPoint = navigationPoints.find((p) => p.id === segment.startNavPointId);
      const endPoint = navigationPoints.find((p) => p.id === segment.endNavPointId);

      if (startPoint && endPoint) {
        return {
          id: segment.id,
          positions: [
            [startPoint.position.y, startPoint.position.x] as [number, number],
            [endPoint.position.y, endPoint.position.x] as [number, number],
          ],
        };
      }
      return null;
    }).filter(Boolean) as { id: string; positions: [number, number][] }[];
  };

  const pathLines = getPathLines();

  return (
    <div style={{ height: '500px', width: '100%' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        zoomControl={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        dragging={true}
      >
        <MapUpdater center={center} zoom={zoom} />
        <MapEvents onMapClick={onMapClick} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {navigationPoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.position.y, point.position.x]}
            icon={getMarkerIcon(point.type)}
            eventHandlers={{
              click: () => {
                console.log('Clicked point:', point);
              },
            }}
          >
            <Popup>
              <div>
                <strong>{point.name}</strong>
                <br />
                类型: {point.type === 'start' ? '起点' : point.type === 'end' ? '终点' : '路径点'}
                <br />
                顺序: {point.order}
                <br />
                坐标: ({point.position.x.toFixed(2)}, {point.position.y.toFixed(2)})
              </div>
            </Popup>
          </Marker>
        ))}

        {pathLines.map((line) => (
          <Polyline
            key={line.id}
            positions={line.positions}
            color="blue"
            weight={5}
            opacity={0.7}
            interactive={true}
          />
        ))}

        {robotPosition && (
          <Marker
            position={[robotPosition.y, robotPosition.x]}
            icon={robotIcon}
          >
            <Popup>
              <div>
                <strong>机器人当前位置</strong>
                <br />
                坐标: ({robotPosition.x.toFixed(2)}, {robotPosition.y.toFixed(2)})
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapViewer;
