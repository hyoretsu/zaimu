import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectedTags } from "./SelectedTags";

test("selected tags retain names independently of the searched page", () => {
	const html = renderToStaticMarkup(
		<SelectedTags
			failed={false}
			ids={["outside-page"]}
			pending={false}
			tags={[{ id: "outside-page", name: "Viagem", userId: "owner" }]}
		/>,
	);
	expect(html).toContain("Viagem");
	expect(html).not.toContain("Selecione ou crie");
});
test("pending and failed lookup never render an empty selection", () => {
	const pending = renderToStaticMarkup(<SelectedTags failed={false} ids={["tag"]} pending tags={[]} />);
	expect(pending).not.toContain("Selecione ou crie");
	expect(pending).not.toContain("Tag indisponível");
	const failed = renderToStaticMarkup(<SelectedTags failed ids={["tag"]} pending={false} tags={[]} />);
	expect(failed).toContain("Tags indisponíveis");
});
