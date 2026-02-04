import type { ConnectionLineComponent } from "@xyflow/react";

const HALF = 0.5;

/**
 * Renders a curved connection line with an endpoint marker between two nodes.
 *
 * @param props - Coordinates provided by React Flow for a custom connection.
 * @returns An SVG group containing the connection path and target marker.
 */
export const Connection: ConnectionLineComponent = (props) => {
  const { fromX, fromY, toX, toY } = props;

  return (
    <g>
      <path
        className="animated"
        d={`M${fromX},${fromY} C ${fromX + (toX - fromX) * HALF},${fromY} ${fromX + (toX - fromX) * HALF},${toY} ${toX},${toY}`}
        fill="none"
        stroke="var(--color-ring)"
        strokeWidth={1}
      />
      <circle
        cx={toX}
        cy={toY}
        fill="var(--color-background)"
        r={3}
        stroke="var(--color-ring)"
        strokeWidth={1}
      />
    </g>
  );
};
