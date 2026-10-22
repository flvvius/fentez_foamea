"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLon } from "@fentezfoamea/core";
import { formatPrice } from "@/lib/format";
import { featuredPinIds, type VenuePin } from "./explore";

type Props = {
  pins: VenuePin[];
  origin: LatLon;
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
};

export default function OfferMap({ pins, origin, selectedVenueId, onSelectVenue }: Readonly<Props>) {
  const [view, setView] = useState<MapView | null>(null);
  const featured = useMemo(() => {
    if (!view) return new Set<string>();
    const visible = pins.filter((pin) => view.bounds.contains([pin.lat, pin.lon]));
    return featuredPinIds(visible, view.metersPerPixel * FEATURED_SPACING_PX);
  }, [pins, view]);
  return (
    <MapContainer center={[origin.lat, origin.lon]} zoom={14} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <FollowOrigin origin={origin} />
      <ZoomClass />
      <TrackView onChange={setView} />
      <CircleMarker center={[origin.lat, origin.lon]} radius={7} pathOptions={{ className: "origin-dot" }} />
      {pins.map((pin) => (
        <PricePin
          key={pin.venueId}
          pin={pin}
          selected={pin.venueId === selectedVenueId}
          featured={featured.has(pin.venueId)}
          onSelect={onSelectVenue}
        />
      ))}
    </MapContainer>
  );
}

function PricePin({
  pin,
  selected,
  featured,
  onSelect,
}: Readonly<{ pin: VenuePin; selected: boolean; featured: boolean; onSelect: Props["onSelectVenue"] }>) {
  const label = pinLabel(pin);
  const { count } = pin;
  const icon = useMemo(() => {
    const more = count > 1 ? `<span class="pin-count">${count}</span>` : "";
    return L.divIcon({
      className: "",
      html: `<span class="pin${selected ? " pin-selected" : ""}${featured ? " pin-featured" : ""}">${label}${more}</span>`,
      iconSize: undefined,
      iconAnchor: [0, 0],
    });
  }, [label, count, selected, featured]);

  const toggle = () => onSelect(selected ? null : pin.venueId);

  return (
    <Marker
      position={[pin.lat, pin.lon]}
      icon={icon}
      zIndexOffset={selected ? 1000 : featured ? 500 : Math.round(pin.bestDiscount ?? 0)}
      eventHandlers={{
        click: toggle,
        keypress: (event) => {
          if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") toggle();
        },
      }}
      title={pin.name}
      alt={`${pin.name}, ${pin.minPrice === null ? "ofertă" : `de la ${formatPrice(pin.minPrice)} lei`}`}
    />
  );
}

function FollowOrigin({ origin }: { origin: LatLon }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([origin.lat, origin.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, origin.lat, origin.lon]);
  return null;
}

const FEATURED_SPACING_PX = 110;

type MapView = { bounds: L.LatLngBounds; metersPerPixel: number };

function TrackView({ onChange }: { onChange: (view: MapView) => void }) {
  const map = useMap();
  const report = () => {
    const center = map.getCenter();
    const metersPerPixel = (40_075_016 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
    onChange({ bounds: map.getBounds().pad(-0.1), metersPerPixel });
  };
  useMapEvents({ moveend: report });
  useEffect(report, [map]);
  return null;
}

const CLOSE_ZOOM = 16;

function ZoomClass() {
  const map = useMap();
  const apply = () => {
    map.getContainer().classList.toggle("map-far", map.getZoom() < CLOSE_ZOOM);
  };
  useMapEvents({ zoomend: apply });
  useEffect(() => {
    apply();
  });
  return null;
}

function pinLabel(pin: VenuePin): string {
  if (pin.minPrice !== null) return `${formatPrice(pin.minPrice)} lei`;
  if (pin.bestDiscount !== null) return `−${pin.bestDiscount}%`;
  return "ofertă";
}
