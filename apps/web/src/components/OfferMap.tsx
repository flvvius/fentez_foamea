"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
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
  const featured = useMemo(() => featuredPinIds(pins), [pins]);
  return (
    <MapContainer center={[origin.lat, origin.lon]} zoom={14} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <FollowOrigin origin={origin} />
      <ZoomClass />
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
