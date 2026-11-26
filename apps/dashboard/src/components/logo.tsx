import type { SVGProps } from "react";

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

export const Logo = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 32 32" {...props}>
    <rect fill="#0d0906" height="32" rx="8" width="32" />
    {PETALS.map((a) => (
      <g key={a} transform={`rotate(${a} 16 16)`}>
        <path
          d="M16 15C13.9 12 14.2 7 16 3.6 17.8 7 18.1 12 16 15Z"
          fill="#f2b64c"
        />
        <ellipse cx="16" cy="9.6" fill="#0d0906" rx=".9" ry="1.6" />
      </g>
    ))}
    <circle cx="16" cy="16" fill="#f6ebd7" r="1.6" />
  </svg>
);
