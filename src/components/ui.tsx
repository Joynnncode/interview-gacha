/**
 * Small shared pieces. Kept together because each one is a handful of lines and
 * splitting them into eleven files would make them harder to keep consistent.
 */

import type { ReactNode } from 'react';
import { Illustration, type IllustrationName } from './illustrations';
import type { Category, Rarity } from '../types';

// ---------------------------------------------------------------------------
// Rarity and category presentation
// ---------------------------------------------------------------------------

export const RARITY_LABEL: Record<Rarity, string> = {
  N: 'Common',
  R: 'Rare',
  SR: 'Super Rare',
  SSR: 'Legendary',
};

/** Border and text treatment per rarity. SSR gets the rainbow, applied separately. */
export const RARITY_STYLE: Record<Rarity, string> = {
  N: 'bg-rarity-n/50 text-ink-soft',
  R: 'bg-rarity-r/60 text-ink',
  SR: 'bg-rarity-sr/60 text-ink',
  SSR: 'bg-gold/70 text-ink',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  behavioral: 'Behavioural',
  tech: 'Tech',
};

export const CATEGORY_STYLE: Record<Category, string> = {
  behavioral: 'bg-behavioural/60 text-ink',
  tech: 'bg-tech/60 text-ink',
};

export function RarityChip({ rarity }: { rarity: Rarity }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${RARITY_STYLE[rarity]}`}
    >
      {rarity === 'SSR' ? '✨' : null}
      {rarity}
      <span className="font-medium opacity-70">{RARITY_LABEL[rarity]}</span>
    </span>
  );
}

export function CategoryChip({ category }: { category: Category }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide ${CATEGORY_STYLE[category]}`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-cream-deep px-3 py-1 text-xs font-medium text-ink-soft">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonTone = 'primary' | 'secondary' | 'quiet';

/**
 * Tones carry colour only. The lift-on-hover and press-down-on-click come from
 * the shared .toy-press class, so every button in the app gives way under the
 * cursor in exactly the same way.
 */
const TONE_STYLE: Record<ButtonTone, string> = {
  primary: 'bg-peach text-white shadow-soft hover:bg-peach-deep disabled:bg-ink-faint',
  secondary: 'bg-card text-ink shadow-soft ring-1 ring-ink/5 hover:bg-cream-deep',
  quiet: 'bg-transparent text-ink-soft hover:bg-cream-deep hover:text-ink',
};

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** Larger hit area for the main action on a screen. */
  size?: 'md' | 'lg';
  type?: 'button' | 'submit';
  title?: string;
}

export function Button({
  children,
  onClick,
  tone = 'secondary',
  disabled = false,
  size = 'md',
  type = 'button',
  title,
}: ButtonProps) {
  const sizing = size === 'lg' ? 'px-8 py-4 text-lg' : 'px-5 py-2.5 text-sm';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`toy-press rounded-toy font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${TONE_STYLE[tone]}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  tint,
}: {
  children: ReactNode;
  className?: string;
  /** Optional top edge colour, used to signal category on a card. */
  tint?: Category;
}) {
  const edge =
    tint === 'behavioral'
      ? 'before:bg-behavioural'
      : tint === 'tech'
        ? 'before:bg-tech'
        : 'before:hidden';

  return (
    <section
      className={`relative overflow-hidden rounded-toy-lg bg-card p-6 shadow-soft before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:content-[''] ${edge} ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-bold text-ink">{children}</h2>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
    </header>
  );
}

/**
 * Empty states are friendly and never scolding.
 *
 * Each one gets a small drawn illustration — never a bare "No data". The words
 * always say what to do next rather than what is absent.
 */
export function EmptyState({
  illustration,
  title,
  body,
}: {
  illustration: IllustrationName;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-toy-lg bg-cream-deep/70 px-6 py-10 text-center">
      <Illustration name={illustration} className="mx-auto" />
      <h3 className="mt-2 font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** English convention: 14 Aug 2026. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '—';
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}
