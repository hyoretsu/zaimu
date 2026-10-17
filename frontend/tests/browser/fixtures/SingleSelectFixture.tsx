import "@/index.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CustomSelect, type Option } from "@/components/ui/CustomSelect";

function SingleSelectFixture() {
	const [value, setValue] = useState("");
	const [changes, setChanges] = useState(0);
	const [props, setProps] = useState<{
		options: Option[];
		disabled?: boolean;
		isLoading?: boolean;
		error?: string;
		value?: string;
		values?: string[];
	}>({ options: [] });
	Object.assign(window, {
		configureSelect: (next: typeof props) => {
			setValue(next.value ?? "");
			setChanges(0);
			setProps(next);
		},
	});
	return (
		<>
			<CustomSelect
				{...props}
				label="Conta"
				onValueChange={next => {
					setValue(next);
					setChanges(count => count + 1);
				}}
				placeholder="Selecione conta"
				searchable
				value={value}
			/>
			<output data-testid="value">{value}</output>
			<output data-testid="changes">{changes}</output>
		</>
	);
}

const root = createRoot(document.getElementById("root")!);
if (location.search) {
	const { SingleSelectImportFixture } = await import("./SingleSelectImportFixture");
	root.render(<SingleSelectImportFixture />);
} else {
	root.render(<SingleSelectFixture />);
}
