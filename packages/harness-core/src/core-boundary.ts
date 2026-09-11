import ts from 'typescript';

/** Internal test scanner: parsing keeps comments and literal text out of code visits. */
export function findProcessAccessInCode(source: string): Array<{ line: number; kind: string }> {
  const file = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  const hits: Array<{ line: number; kind: string }> = [];
  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'process' && ['argv', 'exit'].includes(node.name.text)) {
      hits.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, kind: node.name.text });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return hits;
}

/** Count import declarations, import-equals, require, dynamic imports and process.getBuiltinModule, not mentions. */
export function countIoImports(
  source: string,
  modules: readonly string[] = ['node:fs', 'fs', 'node:child_process', 'child_process', 'node:https', 'https'],
): { files: number; imports: number } {
  const file = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  let imports = 0;
  function visit(node: ts.Node): void {
    let specifier: ts.Node | undefined;
    if (ts.isImportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = node.moduleReference.expression;
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      specifier = node.arguments[0];
    } else if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'process'
      && node.expression.name.text === 'getBuiltinModule') {
      specifier = node.arguments[0];
    }
    if (specifier && ts.isStringLiteralLike(specifier)
      && modules.some((name) => specifier.text === name || specifier.text.startsWith(`${name}/`))) {
      imports += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { files: imports > 0 ? 1 : 0, imports };
}
