// Small collectors over the maintained TypeScript-ESLint AST, not a new parser.
import { hash } from './policy.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
export function sourceWithoutComments(source, comments) {
  let result = '',
    offset = 0;
  for (const comment of [...comments].sort((a, b) => a.range[0] - b.range[0])) {
    result += source.slice(offset, comment.range[0]);
    result += source.slice(comment.range[0], comment.range[1]).replace(/[^\r\n]/gu, ' ');
    offset = comment.range[1];
  }
  return result + source.slice(offset);
}
function nameOf(node, parent, signature) {
  return (
    node.id?.name ??
    (parent?.type === 'VariableDeclarator' ? parent.id?.name : undefined) ??
    (['MethodDefinition', 'Property', 'PropertyDefinition'].includes(parent?.type)
      ? (parent.key?.name ??
        (parent.key?.value !== undefined
          ? String(parent.key.value)
          : `computed-${signature(parent.key).slice(0, 12)}`))
      : undefined) ??
    `anonymous-${parent?.callee?.name ?? parent?.callee?.property?.name ?? parent?.type ?? 'callback'}-${typeof parent?.arguments?.[0]?.value === 'string' ? hash(parent.arguments[0].value).slice(0, 10) : ''}`
  );
}
function children(node, visitorKeys) {
  const keys =
    visitorKeys[node.type] ??
    Object.keys(node).filter((k) => !['parent', 'loc', 'range', 'tokens', 'comments'].includes(k));
  return keys
    .flatMap((k) => (Array.isArray(node[k]) ? node[k] : [node[k]]))
    .filter((v) => v && typeof v.type === 'string');
}
export function collectFacts(source, filename, parser) {
  const parsed = parser.parseForESLint(source, {
    filePath: filename,
    loc: true,
    range: true,
    tokens: true,
    comment: true,
    jsx: true,
    ecmaFeatures: { jsx: true },
    sourceType: filename.endsWith('.cjs') ? 'script' : 'module',
  });
  const clean = sourceWithoutComments(source, parsed.ast.comments ?? []),
    lines = clean.split(/\r?\n/u);
  const nloc = (n) => lines.slice(n.loc.start.line - 1, n.loc.end.line).filter((x) => x.trim()).length;
  const tokens = parsed.ast.tokens ?? [];
  const signature = (n, end = n.range[1]) =>
    hash(
      JSON.stringify(
        tokens.filter((t) => t.range[0] >= n.range[0] && t.range[1] <= end).map((t) => [t.type, t.value]),
      ),
    );
  const exportedNames = new Set(
    parsed.ast.body.flatMap((n) =>
      n.type === 'ExportNamedDeclaration' && !n.source
        ? (n.specifiers ?? []).map((s) => s.local?.name)
        : n.type === 'ExportDefaultDeclaration' && n.declaration?.type === 'Identifier'
          ? [n.declaration.name]
          : [],
    ),
  );
  const facts = {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    names: [],
    styles: [],
    dynamicStyles: [],
    classNames: [],
  };
  const stack = [{ node: parsed.ast, parent: null, owner: '', fn: null, depth: 0, exported: false }];
  while (stack.length) {
    const state = stack.pop(),
      { node, parent } = state;
    let { owner, fn, depth, exported } = state;
    if (node.type.startsWith('Export')) exported = true;
    if (FUNCTIONS.has(node.type)) {
      const local = nameOf(node, parent, signature),
        symbol = owner ? `${owner}.${local}` : local;
      fn = {
        symbol,
        start: node.loc.start.line,
        end: node.loc.end.line,
        nloc: nloc(node),
        parameters: node.params.length,
        signature: signature(parent?.type === 'MethodDefinition' ? parent : node, node.body.range[0]),
        complexity: 1,
        nesting: 0,
        exported: exported || exportedNames.has(local),
      };
      facts.functions.push(fn);
      facts.names.push({ name: local, role: 'function', line: node.loc.start.line, exported });
      owner = symbol;
      depth = 0;
      exported = false;
    } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const local = nameOf(node, parent, signature);
      const methods = node.body.body.filter((m) => m.type === 'MethodDefinition');
      const symbol = owner ? `${owner}.${local}` : local;
      const publicFields = node.body.body
        .filter(
          (m) =>
            m.type === 'PropertyDefinition' &&
            m.accessibility !== 'private' &&
            m.key.type !== 'PrivateIdentifier',
        )
        .map((m) => ({
          name: nameOf(m.value ?? {}, m, signature),
          readonly: m.readonly === true,
          signature: signature(m, m.value?.range[0] ?? m.range[1]),
          line: m.loc.start.line,
        }));
      const publicMethods = methods.filter(
        (m) => m.accessibility !== 'private' && m.key.type !== 'PrivateIdentifier',
      );
      const surface = publicMethods.map((m) => ({
        name: nameOf(m.value, m, signature),
        line: m.loc.start.line,
        signature: signature(m, m.value.body?.range[0] ?? m.range[1]),
      }));
      facts.classes.push({
        symbol,
        signature: hash(
          JSON.stringify([
            signature(node, node.body.range[0]),
            surface.map((m) => [m.name, m.signature]),
            publicFields.map((m) => [m.name, m.signature]),
          ]),
        ),
        methods: surface,
        public_fields: publicFields,
        start: node.loc.start.line,
        end: node.loc.end.line,
        nloc: nloc(node),
        public_methods: methods.filter(
          (m) =>
            m.kind !== 'constructor' && m.accessibility !== 'private' && m.key.type !== 'PrivateIdentifier',
        ).length,
        static_only:
          methods.some((m) => m.kind !== 'constructor') &&
          methods.filter((m) => m.kind !== 'constructor').every((m) => m.static),
        exported: exported || exportedNames.has(local),
      });
      facts.names.push({ name: local, role: 'type', line: node.loc.start.line });
      owner = symbol;
      fn = null;
      exported = false;
    }
    if (
      fn &&
      [
        'IfStatement',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WhileStatement',
        'DoWhileStatement',
        'CatchClause',
        'ConditionalExpression',
        'LogicalExpression',
      ].includes(node.type)
    ) {
      fn.complexity += 1;
      if (node.type !== 'LogicalExpression') depth += 1;
      fn.nesting = Math.max(fn.nesting, depth);
    }
    if (fn && node.type === 'SwitchCase' && node.test) fn.complexity += 1;
    if (node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') {
      facts.names.push({ name: node.id.name, role: 'type', line: node.loc.start.line });
      facts.interfaces.push({
        symbol: node.id.name,
        signature: signature(node),
        exported: exported || exportedNames.has(node.id.name),
        line: node.loc.start.line,
      });
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
      facts.names.push({
        name: node.id.name,
        role: 'variable',
        line: node.loc.start.line,
        boolean:
          typeof node.init?.value === 'boolean' ||
          node.id.typeAnnotation?.typeAnnotation?.type === 'TSBooleanKeyword',
      });
    if (
      node.source?.value &&
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
    )
      facts.imports.push({
        target: node.source.value,
        line: node.loc.start.line,
        typeOnly: node.importKind === 'type',
      });
    if (node.type === 'ImportExpression')
      facts.imports.push({
        target: typeof node.source.value === 'string' ? node.source.value : null,
        line: node.loc.start.line,
        dynamic: true,
      });
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require')
      facts.imports.push({
        target: typeof node.arguments[0]?.value === 'string' ? node.arguments[0].value : null,
        line: node.loc.start.line,
        dynamic: true,
      });
    if (node.type === 'JSXAttribute' && node.name.name === 'style') {
      const value = node.value?.expression;
      if (value?.type === 'ObjectExpression') {
        for (const property of value.properties) {
          const key = property.key?.name ?? property.key?.value,
            literal = property.value;
          if (
            property.type === 'Property' &&
            !property.computed &&
            typeof key === 'string' &&
            ['string', 'number'].includes(typeof literal?.value)
          )
            facts.styles.push({
              property: key.replace(/[A-Z]/gu, (s) => `-${s.toLowerCase()}`),
              value: String(literal.value),
              line: property.loc.start.line,
            });
          else facts.dynamicStyles.push({ line: property.loc.start.line });
        }
      } else facts.dynamicStyles.push({ line: node.loc.start.line });
    }
    if (
      node.type === 'JSXAttribute' &&
      node.name.name === 'className' &&
      typeof node.value?.value === 'string'
    )
      facts.classNames.push({ value: node.value.value, line: node.loc.start.line });
    for (const child of children(node, parsed.visitorKeys ?? {}).reverse())
      stack.push({ node: child, parent: node, owner, fn, depth, exported });
  }
  return facts;
}
