/**
 * 米粒冠 icon set — duotone filled, round, warm. 24×24 SVG.
 * Ported from Claude Design Icons.jsx to react-native-svg.
 * Primary fill = color prop, secondary accent uses fillOpacity for depth.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  stroke?: number;
}

// ─── Crown (echoes the logo — 5 points, ball tips) ─────────────────────────
export function Crown({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.4 9.6c-.4-.3-.1-1 .4-.9l3.6 1.2L11 4.6a1.2 1.2 0 0 1 2 0l3.6 5.3 3.6-1.2c.5-.1.8.6.4.9L18.3 18c-.2 1-1 1.6-2 1.6H7.7c-1 0-1.8-.6-2-1.6L3.4 9.6Z"
        fill={color}
      />
      <Circle cx={3.4} cy={9} r={1.5} fill={color} />
      <Circle cx={8} cy={6.5} r={1.4} fill={color} />
      <Circle cx={12} cy={4.2} r={1.5} fill={color} />
      <Circle cx={16} cy={6.5} r={1.4} fill={color} />
      <Circle cx={20.6} cy={9} r={1.5} fill={color} />
    </Svg>
  );
}

// ─── Scan (chunky rounded rects + center bar) ───────────────────────────────
export function Scan({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5V7a3 3 0 0 1 3-3h1.5M20 8.5V7a3 3 0 0 0-3-3h-1.5M4 15.5V17a3 3 0 0 0 3 3h1.5M20 15.5V17a3 3 0 0 1-3 3h-1.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={3} y={11} width={18} height={2.2} rx={1.1} fill={color} />
    </Svg>
  );
}

// ─── QR code ────────────────────────────────────────────────────────────────
export function QR({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={7.5} height={7.5} rx={2} fill={color} fillOpacity={0.18} />
      <Rect x={5} y={5} width={3.5} height={3.5} rx={1} fill={color} />
      <Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} fill={color} fillOpacity={0.18} />
      <Rect x={15.5} y={5} width={3.5} height={3.5} rx={1} fill={color} />
      <Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} fill={color} fillOpacity={0.18} />
      <Rect x={5} y={15.5} width={3.5} height={3.5} rx={1} fill={color} />
      <Rect x={13.5} y={13.5} width={3} height={3} rx={0.8} fill={color} />
      <Rect x={18} y={13.5} width={3} height={3} rx={0.8} fill={color} />
      <Rect x={13.5} y={18} width={3} height={3} rx={0.8} fill={color} />
      <Rect x={18} y={18} width={3} height={3} rx={0.8} fill={color} />
    </Svg>
  );
}

// ─── Chart (bars + increasing height) ───────────────────────────────────────
export function Chart({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={13} width={4} height={8} rx={1.2} fill={color} fillOpacity={0.35} />
      <Rect x={10} y={9} width={4} height={12} rx={1.2} fill={color} fillOpacity={0.6} />
      <Rect x={17} y={5} width={4} height={16} rx={1.2} fill={color} />
    </Svg>
  );
}

// ─── Trophy (filled cup) ─────────────────────────────────────────────────────
export function Trophy({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 3h10v6a5 5 0 0 1-10 0V3Z" fill={color} />
      <Path
        d="M7 5H5.5A2.5 2.5 0 0 0 5.5 10H8M17 5h1.5A2.5 2.5 0 0 1 18.5 10H16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={10} y={13} width={4} height={4} rx={1} fill={color} />
      <Rect x={7} y={19} width={10} height={2.4} rx={1.2} fill={color} />
      <Rect x={9} y={17} width={6} height={2.2} rx={1} fill={color} fillOpacity={0.6} />
    </Svg>
  );
}

// ─── User ────────────────────────────────────────────────────────────────────
export function User({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} fill={color} />
      <Path d="M3 21a9 9 0 0 1 18 0" fill={color} fillOpacity={0.35} />
      <Path
        d="M3 21a9 9 0 0 1 18 0"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Building (branch office) ────────────────────────────────────────────────
export function Building({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={3} width={16} height={18} rx={2} fill={color} fillOpacity={0.22} />
      <Rect
        x={4} y={3} width={16} height={18} rx={2}
        stroke={color} strokeWidth={2} fill="none"
      />
      <Rect x={7} y={6} width={3} height={3} rx={0.6} fill={color} />
      <Rect x={14} y={6} width={3} height={3} rx={0.6} fill={color} />
      <Rect x={7} y={11} width={3} height={3} rx={0.6} fill={color} />
      <Rect x={14} y={11} width={3} height={3} rx={0.6} fill={color} />
      <Rect x={10} y={16} width={4} height={5} rx={0.8} fill={color} />
    </Svg>
  );
}

// ─── Store (awning + shop front) ─────────────────────────────────────────────
export function Store({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 4h17l1.2 4a2.7 2.7 0 0 1-5.3.8 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 2.3 8L3.5 4Z"
        fill={color}
      />
      <Path
        d="M5 11.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={9} y={14} width={6} height={7} rx={1} fill={color} fillOpacity={0.5} />
    </Svg>
  );
}

// ─── Package (box) ───────────────────────────────────────────────────────────
export function Package({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.8 3 6.5v11L12 21.2l9-3.7v-11L12 2.8Z" fill={color} fillOpacity={0.3} />
      <Path
        d="M12 2.8 3 6.5v11L12 21.2l9-3.7v-11L12 2.8Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 6.5l9 3.7 9-3.7M12 10.2v11M7.5 4.6 16.5 8.3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Clipboard (orders) ──────────────────────────────────────────────────────
export function Clipboard({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={17} rx={2.5} fill={color} fillOpacity={0.22} />
      <Rect
        x={5} y={4} width={14} height={17} rx={2.5}
        stroke={color} strokeWidth={2} fill="none"
      />
      <Rect x={8.5} y={2.5} width={7} height={4} rx={1.3} fill={color} />
      <Path
        d="M9 11h6M9 14h6M9 17h4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Users (two people) ──────────────────────────────────────────────────────
export function Users({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3.6} fill={color} />
      <Path d="M2.5 20a6.5 6.5 0 0 1 13 0" fill={color} fillOpacity={0.35} />
      <Circle cx={17} cy={9} r={2.8} fill={color} fillOpacity={0.55} />
      <Path
        d="M15 14.5a5.5 5.5 0 0 1 6.5 5.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────
export function Home({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11l9-7 9 7v9a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v6.5H4.5A1.5 1.5 0 0 1 3 20v-9Z"
        fill={color}
        fillOpacity={0.3}
      />
      <Path
        d="M3 11l9-7 9 7v9a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v6.5H4.5A1.5 1.5 0 0 1 3 20v-9Z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Bell (notification) ─────────────────────────────────────────────────────
export function Bell({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 16.5C6.5 15 7 13.8 7 11V9.5a5 5 0 1 1 10 0V11c0 2.8.5 4 1.5 5.5H5.5Z"
        fill={color}
      />
      <Path
        d="M10 20a2 2 0 0 0 4 0"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
export function Settings({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l1.8 1.3 2.2-.3.6 2.2 2.2.7-.3 2.2L20 10l-1.5 1.9.3 2.2-2.2.7-.6 2.2-2.2-.3L12 18l-1.8-1.3-2.2.3-.6-2.2-2.2-.7.3-2.2L4 10l1.5-1.9-.3-2.2 2.2-.7.6-2.2 2.2.3L12 2Z"
        fill={color}
      />
      <Circle cx={12} cy={10} r={3} fill="#fff" />
    </Svg>
  );
}

// ─── Help ────────────────────────────────────────────────────────────────────
export function Help({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} fill={color} />
      <Path
        d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.3-1 .9-1 1.7"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={12} cy={17} r={1} fill="#fff" />
    </Svg>
  );
}

// ─── Chevron (right arrow) ───────────────────────────────────────────────────
export function Chevron({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5.5l6.5 6.5L9 18.5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── ChevronLeft ─────────────────────────────────────────────────────────────
export function ChevronLeft({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5.5L8.5 12 15 18.5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── ArrowUp ─────────────────────────────────────────────────────────────────
export function ArrowUp({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 19V5M6 11l6-6 6 6"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── ArrowDown ───────────────────────────────────────────────────────────────
export function ArrowDown({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M6 13l6 6 6-6"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Check ───────────────────────────────────────────────────────────────────
export function Check({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12.5l5 5L20 6.5"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── X (close / fail) ────────────────────────────────────────────────────────
export function X({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── AlertDot (warning in filled circle) ─────────────────────────────────────
export function AlertDot({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} fill={color} />
      <Path
        d="M12 7.5v6"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={16.8} r={1.2} fill="#fff" />
    </Svg>
  );
}

// ─── Wallet ───────────────────────────────────────────────────────────────────
export function Wallet({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={6} width={19} height={14} rx={2.5} fill={color} fillOpacity={0.3} />
      <Rect
        x={2.5} y={6} width={19} height={14} rx={2.5}
        stroke={color} strokeWidth={2} fill="none"
      />
      <Path
        d="M2.5 11h19"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Circle cx={17.5} cy={15.5} r={1.5} fill={color} />
    </Svg>
  );
}

// ─── Coin ─────────────────────────────────────────────────────────────────────
export function Coin({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} fill={color} />
      <Path
        d="M12 7v10M9 10.5h4.5a1.75 1.75 0 0 1 0 3.5H9h5.5a1.75 1.75 0 0 1 0 3.5H9"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Sparkle (decorative star) ────────────────────────────────────────────────
export function Sparkle({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Z"
        fill={color}
      />
      <Circle cx={19} cy={17} r={1.5} fill={color} fillOpacity={0.6} />
      <Circle cx={5} cy={18} r={1} fill={color} fillOpacity={0.5} />
    </Svg>
  );
}

// ─── Bolt (lightning) ─────────────────────────────────────────────────────────
export function Bolt({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13.5 2 4 14h6l-1 8 9-12h-6l1.5-8Z" fill={color} />
    </Svg>
  );
}

// ─── Flame ────────────────────────────────────────────────────────────────────
export function Flame({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5c.3 3.3-3.3 4.3-3.3 8.3a5.3 5.3 0 1 0 10.6 0c0-2.5-1.7-3.8-1.7-6 0 0 2.2 1 2.2 4 0 3-2.5 5.3-5.3 5.3-2 0-3.5-1.2-3.5-3.2 0-2.4 2.5-3.3 2.5-5.6 0-1.2 1-2.3 3-2.8Z"
        fill={color}
      />
    </Svg>
  );
}

// ─── Lock (security) ─────────────────────────────────────────────────────────
export function Lock({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={10} rx={2.5} fill={color} fillOpacity={0.3} />
      <Rect
        x={5} y={11} width={14} height={10} rx={2.5}
        stroke={color} strokeWidth={2} fill="none"
      />
      <Path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={16} r={1.5} fill={color} />
    </Svg>
  );
}

// ─── History (clock with arrow) ───────────────────────────────────────────────
export function History({ size = 22, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={13} r={8} fill={color} fillOpacity={0.22} />
      <Circle
        cx={12} cy={13} r={8}
        stroke={color} strokeWidth={2} fill="none"
      />
      <Path
        d="M12 9v4l3 2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.5 5.5A10 10 0 0 1 12 3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M4.5 5.5L3 3.5M4.5 5.5l2.5-.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
