import config, { generateIgnores } from "@hyoretsu/configs/eslint";

const jsxInput = type =>
	`JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value=${type}])`;

export default [
	generateIgnores(),
	...config,
	{
		files: ["frontend/src/**/*.{ts,tsx}"],
		ignores: ["frontend/src/components/ui/Checkbox.tsx", "frontend/src/components/ui/chart.tsx"],
		rules: {
			"no-restricted-globals": [
				"error",
				{
					message: "Use the shared toast/ConfirmActionButton instead of native dialogs.",
					name: "alert",
				},
				{ message: "Use ConfirmActionButton instead of native dialogs.", name: "confirm" },
			],
			"no-restricted-syntax": [
				"error",
				{
					message: "Import React APIs by name; never use the React namespace.",
					selector: "ImportNamespaceSpecifier[parent.source.value='react']",
				},
				{
					message: "Import React APIs by name; never use the React namespace.",
					selector: "TSQualifiedName[left.name='React']",
				},
				{
					message: "Import React APIs by name; never use the React namespace.",
					selector: "MemberExpression[object.name='React']",
				},
				{
					message:
						'Use type="text" with inputMode and explicit parsing, or NumericField/MoneyField.',
					selector: jsxInput("'number'"),
				},
				{
					message: "Use Checkbox from @/components/ui/Checkbox.",
					selector: jsxInput("'checkbox'"),
				},
				{
					message: "Use DateField/DateRangePicker; native date inputs are forbidden.",
					selector: jsxInput("/^(date|datetime-local|month|week)$/"),
				},
				{
					message: "Use CustomSelect from @/components/ui/CustomSelect.",
					selector: "JSXOpeningElement[name.name='select']",
				},
			],
		},
	},
	{
		files: ["backend/src/**/*.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					message:
						"Compose DTOs with a t.Object properties spread; t.Intersect resolves poorly at runtime.",
					selector: "CallExpression[callee.object.name='t'][callee.property.name='Intersect']",
				},
			],
		},
	},
];
