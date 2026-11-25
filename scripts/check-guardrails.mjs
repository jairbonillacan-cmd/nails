import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

const GENERATED_SKIP_PREFIXES = [
  'src/astryx-themes.ts',
  'src/themes/',
];

const ASTRYX_BOUNDARY_EXEMPT = new Set([
  'src/app/layout.tsx',
  'src/app/manifest.ts',
]);

const PURE_DOMAIN_FILES = new Set([
  'src/lib/types.ts',
  'src/lib/format.ts',
  'src/lib/ics.ts',
]);

const FORBIDDEN_DOMAIN_PACKAGES = [
  'react',
  'react-dom',
  'next',
  '@supabase/',
];

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/;
const PX_UNIT_RE = /\b\d+(?:\.\d+)?px\b/i;

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      const rel = toPosix(path.relative(ROOT, full));
      if (
        GENERATED_SKIP_PREFIXES.some(
          (prefix) => rel === prefix || rel.startsWith(prefix),
        )
      ) {
        continue;
      }
      out.push({ full, rel });
    }
  }
  return out;
}

function getLineCol(sf, pos) {
  const { line, character } = sf.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, col: character + 1 };
}

function resolveImportToRel(fromFullPath, specifier) {
  if (specifier.startsWith('@/')) {
    return toPosix(path.join('src', specifier.slice(2)));
  }
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFullPath), specifier);
    return toPosix(path.relative(ROOT, resolved));
  }
  return null;
}

function isPureDomainFile(rel) {
  return (
    PURE_DOMAIN_FILES.has(rel) || rel.startsWith('src/lib/availability/')
  );
}

function isProductUiFile(rel) {
  return rel.startsWith('src/app/') || rel.startsWith('src/components/');
}

const violations = [];

function addViolation(rel, line, col, rule, message) {
  violations.push({ rel, line, col, rule, message });
}

function checkComments(rel, text, sf) {
  const seen = new Set();

  function inspectRanges(ranges) {
    if (!ranges) return;
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const commentText = text.slice(range.pos, range.end).trim();
      const { line, col } = getLineCol(sf, range.pos);

      if (/@ts-ignore\b|@ts-expect-error\b/.test(commentText)) {
        addViolation(
          rel,
          line,
          col,
          'no-type-escapes',
          `Prohibida directiva de escape de tipos: ${commentText}`,
        );
      } else if (/^\/\/\s*INVARIANT:\s+\S/.test(commentText)) {
        continue;
      } else if (/^\/\/\/\s*<reference\s/.test(commentText)) {
        continue;
      } else {
        addViolation(
          rel,
          line,
          col,
          'no-comments',
          `Comentario prohibido (solo se permite "// INVARIANT: ..." para invariantes imposibles en tipos): ${commentText.slice(0, 80)}`,
        );
      }
    }
  }

  function walkComments(node) {
    inspectRanges(ts.getLeadingCommentRanges(text, node.getFullStart()));
    inspectRanges(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, walkComments);
  }

  walkComments(sf);
  inspectRanges(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
}

function checkFile({ full, rel }) {
  const text = fs.readFileSync(full, 'utf-8');
  const scriptKind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, scriptKind);

  checkComments(rel, text, sf);

  const productUi = isProductUiFile(rel);
  const checkAstryx = productUi && !ASTRYX_BOUNDARY_EXEMPT.has(rel);
  const pureDomain = isPureDomainFile(rel);
  const inComponents = rel.startsWith('src/components/');

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line, col } = getLineCol(sf, node.getStart(sf));
      addViolation(rel, line, col, 'no-type-escapes', 'Uso prohibido del tipo "any".');
    }

    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      const { line, col } = getLineCol(sf, node.getStart(sf));
      addViolation(
        rel,
        line,
        col,
        'no-type-escapes',
        'Doble cast prohibido ("as unknown as"). Usa tipos explícitos o type guards.',
      );
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const { line, col } = getLineCol(sf, node.moduleSpecifier.getStart(sf));
      const resolvedRel = resolveImportToRel(full, spec);

      if (productUi && spec === 'react' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const el of node.importClause.namedBindings.elements) {
          if (el.name.text === 'useEffect') {
            addViolation(
              rel,
              line,
              col,
              'no-product-effects',
              'Prohibido importar useEffect en código de producto. Encapsula efectos de infraestructura en src/lib/hooks/.',
            );
          }
        }
      }

      if (pureDomain) {
        const forbiddenPkg = FORBIDDEN_DOMAIN_PACKAGES.some(
          (pkg) => spec === pkg || spec.startsWith(`${pkg}/`) || (pkg.endsWith('/') && spec.startsWith(pkg)),
        );
        if (forbiddenPkg) {
          addViolation(
            rel,
            line,
            col,
            'dependency-graph',
            `El dominio puro (${rel}) no puede importar "${spec}".`,
          );
        }
        if (
          resolvedRel &&
          (resolvedRel.startsWith('src/lib/repositories/') ||
            resolvedRel.startsWith('src/lib/integrations/'))
        ) {
          addViolation(
            rel,
            line,
            col,
            'dependency-graph',
            `El dominio puro (${rel}) no puede importar "${spec}" (${resolvedRel}).`,
          );
        }
      }

      if (inComponents && resolvedRel) {
        if (
          resolvedRel.startsWith('src/lib/repositories/') ||
          resolvedRel.startsWith('src/lib/integrations/') ||
          resolvedRel.startsWith('src/lib/auth/')
        ) {
          addViolation(
            rel,
            line,
            col,
            'dependency-graph',
            `Los componentes UI (${rel}) no pueden importar "${spec}" (${resolvedRel}).`,
          );
        }
      }
    }

    if (productUi) {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        let calleeName = null;
        if (ts.isIdentifier(expr)) {
          calleeName = expr.text;
        } else if (ts.isPropertyAccessExpression(expr)) {
          calleeName = expr.name.text;
        }
        if (calleeName === 'useEffect' || calleeName === 'setTimeout') {
          const { line, col } = getLineCol(sf, expr.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-product-effects',
            `Prohibido usar "${calleeName}" en ${rel}. Muévelo a un hook dedicado en src/lib/hooks/ o resuélvelo en render/handlers.`,
          );
        }
      }
    }

    if (checkAstryx) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        (node.tagName.text === 'div' || node.tagName.text === 'span')
      ) {
        const { line, col } = getLineCol(sf, node.tagName.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'astryx-boundaries',
          `Elemento crudo <${node.tagName.text}> prohibido. Usa componentes de layout/texto de Astryx (VStack, HStack, Grid, Section, Text).`,
        );
      }

      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        const val = node.text;
        const { line, col } = getLineCol(sf, node.getStart(sf));
        if (HEX_COLOR_RE.test(val)) {
          addViolation(
            rel,
            line,
            col,
            'astryx-boundaries',
            `Color #hex inline prohibido en UI ("${val}"). Usa tokens de Astryx o presets en src/lib/theme-presets.ts.`,
          );
        }
        if (PX_UNIT_RE.test(val)) {
          addViolation(
            rel,
            line,
            col,
            'astryx-boundaries',
            `Unidad px inline prohibida en UI ("${val}"). Usa props de escala de Astryx, tokens o AspectRatio.`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
}

const files = walkSourceFiles(SRC_DIR);
for (const f of files) {
  checkFile(f);
}

if (violations.length > 0) {
  console.error(`\n[guardrails] ${violations.length} violación(es) detectada(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}:${v.col}  [${v.rule}]  ${v.message}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`[guardrails] OK — ${files.length} archivos verificados con 0 violaciones.`);
