/** Keep zero visible without rounding the domain up to the next grid line. */
export function chartScale(values: number[]) {
	const finite = values.filter(Number.isFinite);
	const min = Math.min(0, ...finite);
	const max = Math.max(0, ...finite);
	if (min === max) return { domain: [0, 1] as [number, number], ticks: [0, 0.25, 0.5, 0.75, 1] };

	const range = max - min;
	const padding = range * 0.04;
	const domain: [number, number] = [min < 0 ? min - padding : 0, max > 0 ? max + padding : 0];
	const roughStep = range / 4;
	const magnitude = 10 ** Math.floor(Math.log10(roughStep));
	const step = ([1, 2, 2.5, 5, 10].find(value => value * magnitude >= roughStep) ?? 10) * magnitude;
	const ticks: number[] = [];
	for (let index = Math.ceil(domain[0] / step); index <= Math.floor(domain[1] / step); index++) {
		ticks.push(Number((index * step).toPrecision(12)));
	}
	return { domain, ticks };
}
