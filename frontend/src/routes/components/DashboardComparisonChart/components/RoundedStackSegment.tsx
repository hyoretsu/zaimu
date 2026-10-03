import { type BarShapeProps, Rectangle } from "recharts";

export function RoundedStackSegment({
	rounded,
	x,
	y,
	width,
	height,
	fill,
}: BarShapeProps & { rounded: boolean }) {
	return (
		<Rectangle fill={fill} height={height} radius={rounded ? [4, 4, 0, 0] : 0} width={width} x={x} y={y} />
	);
}
