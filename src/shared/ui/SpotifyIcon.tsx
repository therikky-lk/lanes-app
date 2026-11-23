export default function SpotifyIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 0 1-.33-1.46c4.57-1.05 8.5-.6 11.66 1.34.35.22.46.68.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.8c4.36-1.32 9.78-.68 13.49 1.59.44.27.58.85.31 1.3Zm.13-3.41c-3.87-2.3-10.25-2.51-13.94-1.39a1.12 1.12 0 0 1-.65-2.15c4.23-1.29 11.28-1.04 15.74 1.61a1.12 1.12 0 1 1-1.15 1.93Z" />
    </svg>
  );
}
