import { useState } from "react";
import { LuEye, LuEyeOff, LuLockKeyhole } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

interface PasswordFieldProps {
	autoComplete: string;
	description?: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	placeholder: string;
	value: string;
}

export function PasswordField(props: PasswordFieldProps) {
	const [visible, setVisible] = useState(false);
	return (
		<FormField
			autoComplete={props.autoComplete}
			className="pr-12"
			description={props.description}
			id={props.id}
			label={props.label}
			leading={<LuLockKeyhole className="size-4" />}
			name={props.id}
			onChange={event => props.onChange(event.currentTarget.value)}
			placeholder={props.placeholder}
			required
			trailing={
				<Button
					aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
					className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-full"
					onClick={() => setVisible(current => !current)}
					size="icon-sm"
					type="button"
					variant="outline"
				>
					{visible ? <LuEyeOff /> : <LuEye />}
				</Button>
			}
			type={visible ? "text" : "password"}
			value={props.value}
		/>
	);
}
