import type { ComponentProps, ReactNode } from "react";
import { Input } from "./Input";
import { Label } from "./Label";
import { RequiredMark } from "./RequiredMark";

type FormFieldProps = ComponentProps<typeof Input> & {
	description?: string;
	error?: string;
	label: string;
	leading?: ReactNode;
	trailing?: ReactNode;
};

export function FormField({
	description,
	error,
	id,
	label,
	leading,
	trailing,
	required,
	className,
	...inputProps
}: FormFieldProps) {
	return (
		<div className="grid content-start gap-2">
			<Label htmlFor={id}>
				<span>
					{label} {required && <RequiredMark />}
				</span>
			</Label>
			<div className="relative">
				{leading && (
					<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
						{leading}
					</span>
				)}
				<Input
					aria-describedby={description || error ? `${id}-description` : undefined}
					aria-invalid={Boolean(error)}
					className={`${leading ? "pl-10" : ""} ${className ?? ""}`}
					id={id}
					required={required}
					{...inputProps}
				/>
				{trailing}
			</div>
			{(error || description) && (
				<p
					className={error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
					id={`${id}-description`}
				>
					{error || description}
				</p>
			)}
		</div>
	);
}
