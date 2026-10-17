"use client";

import { MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Category } from "@/lib/types";

const filters: { category: Category; symbol: string }[] = [
  { category: "FOODIE", symbol: "F" },
  { category: "PARTY", symbol: "P" },
  { category: "EVENTS", symbol: "E" },
  { category: "CHILL", symbol: "C" },
];

interface VibeHeaderProps {
  category: Category;
  onCategoryChange: (category: Category) => void;
  onOpenProfile: () => void;
  locationLabel: string;
}

export default function VibeHeader({ category, onCategoryChange, onOpenProfile, locationLabel }: VibeHeaderProps) {
  return (
    <header className="app-header">
      <Link href="/" className="wordmark" aria-label="Find Tony home">
        <Image
          key="/icons/find-tony-logo-png.png?v=20261017"
          className="wordmark-logo"
          src="/icons/find-tony-logo-png.png?v=20261017"
          alt=""
          width={42}
          height={42}
          priority
          unoptimized
        />
        <span>FIND TONY</span>
      </Link>
      <div className="header-location"><MapPin size={15} /><span>{locationLabel}</span></div>
      <nav className="vibe-filters" aria-label="Filter places by vibe">
        {filters.map(({ category: item, symbol }) => (
          <button
            key={item}
            className={`filter-chip ${category === item ? "is-active" : ""}`}
            aria-pressed={category === item}
            onClick={() => onCategoryChange(item)}
          >
            <span className={`chip-symbol symbol-${item.toLowerCase()}`}>{symbol}</span>{item}
          </button>
        ))}
      </nav>
      <button className="profile-trigger" onClick={onOpenProfile} aria-label="Open profile" title="Profile">
        <span className="profile-avatar"><UserRound size={17} /></span>
      </button>
    </header>
  );
}
