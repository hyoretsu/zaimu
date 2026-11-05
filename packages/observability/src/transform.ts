import { relative } from "node:path";
import ts from "typescript";
export function transform(source: string, filename: string, root: string) {
	const path = relative(root, filename).replaceAll("\\", "/");
	const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
	const helper = ts.factory.createUniqueName("__otelCall");
	const iteratorHelper = ts.factory.createUniqueName("__otelIterator");
	let changed = false;
	const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
		const f = context.factory;
		const visit: ts.Visitor = node => {
			const visited = ts.visitEachChild(node, visit, context);
			if (!(
				ts.isFunctionDeclaration(visited) ||
				ts.isFunctionExpression(visited) ||
				ts.isArrowFunction(visited) ||
				ts.isMethodDeclaration(visited) ||
				ts.isGetAccessor(visited) ||
				ts.isSetAccessor(visited)
			))
				return visited;
			if (
				!visited.body ||
				source.slice(node.getFullStart(), node.getStart(file)).includes("@otel-ignore")
			)
				return visited;
			const position = file.getLineAndCharacterOfPosition(node.getStart(file));
			const label =
				"name" in visited && visited.name
					? visited.name.getText(file)
					: `${position.line + 1}:${position.character + 1}`;
			const name = `${path}:${label}`;
			const asyncModifier = visited.modifiers?.find(
				modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword,
			);
			const body = visited.body;
			const call = f.createCallExpression(helper, undefined, [
				f.createStringLiteral(name),
				f.createStringLiteral(`${path}:${position.line + 1}`),
				f.createArrayLiteralExpression(
					visited.parameters.map(parameter =>
						ts.isIdentifier(parameter.name)
							? f.createIdentifier(parameter.name.text)
							: f.createStringLiteral("[destructured]"),
					),
				),
				f.createArrowFunction(
					asyncModifier ? [f.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined,
					undefined,
					[],
					undefined,
					f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					body,
				),
				asyncModifier ? f.createTrue() : f.createFalse(),
			]);
			changed = true;
			if (ts.isArrowFunction(visited))
				return f.updateArrowFunction(
					visited,
					visited.modifiers,
					visited.typeParameters,
					visited.parameters,
					visited.type,
					visited.equalsGreaterThanToken,
					call,
				);
			const generator = "asteriskToken" in visited && visited.asteriskToken;
			const finish = f.createUniqueName("__otelFinish");
			const failure = f.createUniqueName("__otelError");
			const wrapped =
				generator && ts.isBlock(body)
					? f.createBlock(
							[
								f.createVariableStatement(
									undefined,
									f.createVariableDeclarationList(
										[
											f.createVariableDeclaration(
												finish,
												undefined,
												undefined,
												f.createCallExpression(iteratorHelper, undefined, [
													f.createStringLiteral(name),
													f.createStringLiteral(`${path}:${position.line + 1}`),
												]),
											),
										],
										ts.NodeFlags.Const,
									),
								),
								f.createTryStatement(
									body,
									f.createCatchClause(
										f.createVariableDeclaration(failure),
										f.createBlock(
											[
												f.createExpressionStatement(
													f.createCallExpression(finish, undefined, [
														f.createTrue(),
													]),
												),
												f.createThrowStatement(failure),
											],
											true,
										),
									),
									f.createBlock(
										[
											f.createExpressionStatement(
												f.createCallExpression(finish, undefined, []),
											),
										],
										true,
									),
								),
							],
							true,
						)
					: f.createBlock([f.createReturnStatement(call)], true);
			if (ts.isFunctionDeclaration(visited))
				return f.updateFunctionDeclaration(
					visited,
					visited.modifiers,
					visited.asteriskToken,
					visited.name,
					visited.typeParameters,
					visited.parameters,
					visited.type,
					wrapped,
				);
			if (ts.isFunctionExpression(visited))
				return f.updateFunctionExpression(
					visited,
					visited.modifiers,
					visited.asteriskToken,
					visited.name,
					visited.typeParameters,
					visited.parameters,
					visited.type,
					wrapped,
				);
			if (ts.isMethodDeclaration(visited))
				return f.updateMethodDeclaration(
					visited,
					visited.modifiers,
					visited.asteriskToken,
					visited.name,
					visited.questionToken,
					visited.typeParameters,
					visited.parameters,
					visited.type,
					wrapped,
				);
			if (ts.isGetAccessor(visited))
				return f.updateGetAccessorDeclaration(
					visited,
					visited.modifiers,
					visited.name,
					visited.parameters,
					visited.type,
					wrapped,
				);
			return f.updateSetAccessorDeclaration(
				visited,
				visited.modifiers,
				visited.name,
				visited.parameters,
				wrapped,
			);
		};
		return input => {
			const result = ts.visitNode(input, visit) as ts.SourceFile;
			if (!changed) return result;
			const declaration = f.createImportDeclaration(
				undefined,
				f.createImportClause(
					false,
					undefined,
					f.createNamedImports([
						f.createImportSpecifier(false, f.createIdentifier("functionCall"), helper),
						f.createImportSpecifier(false, f.createIdentifier("startDependency"), iteratorHelper),
					]),
				),
				f.createStringLiteral("@zaimu/observability"),
			);
			return f.updateSourceFile(result, [declaration, ...result.statements]);
		};
	};
	return ts.transpileModule(source, {
		compilerOptions: {
			inlineSourceMap: true,
			inlineSources: true,
			module: ts.ModuleKind.ESNext,
			sourceMap: false,
			target: ts.ScriptTarget.ESNext,
		},
		fileName: filename,
		transformers: { before: [transformer] },
	}).outputText;
}
