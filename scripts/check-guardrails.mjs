import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const SATORI_OG_IMAGE_RE = /^src\/app\/(?:.+\/)?(?:opengraph|twitter)-image\.tsx$/;

const PURE_DOMAIN_FILES = new Set([
  'src/lib/types.ts',
  'src/lib/format.ts',
  'src/lib/ics.ts',
  'src/lib/public-dto.ts',
  'src/lib/sanitize.ts',
  'src/lib/clock.ts',
  'src/lib/qr.ts',
  'src/lib/contrast.ts',
]);

const PUBLIC_UI_DTO_BOUNDARY_FILES = new Set([
  'src/app/page.tsx',
  'src/components/LandingView.tsx',
  'src/components/BookingWidget.tsx',
  'src/components/ManageBookingView.tsx',
]);

const INTERNAL_DTO_FIELDS = new Set([
  'commissionPercent',
  'defaultCommissionPercent',
]);

const SAFE_HTML_FORMAT_CALLEES = new Set([
  'Number',
  'formatCurrency',
  'formatPrice',
  'formatDateLongInTimezone',
  'formatTimeInTimezone',
  'getDateKeyInTimezone',
]);

const SAFE_HTML_STRING_METHODS = new Set([
  'replace',
  'replaceAll',
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'slice',
]);

const SAFE_HTML_NUMERIC_METHODS = new Set([
  'toFixed',
  'toPrecision',
  'toLocaleString',
]);

const HTML_CLOSING_TAG_RE = /<\/[a-z][a-z0-9-]*\s*>/i;
const HTML_SELF_CLOSING_TAG_RE = /<[a-z][a-z0-9-]*(?:\s+[^>]*)?\/>/i;
const HTML_KNOWN_OPEN_TAG_RE =
  /<(?:div|span|p|a|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|strong|em|b|i|br|hr|img|section|header|footer|main|article|html|head|body|style|blockquote|pre|code)\b[^>]*>/i;

const FORBIDDEN_DOMAIN_PACKAGES = [
  'react',
  'react-dom',
  'next',
  '@supabase/',
];

const HTTP_HANDLER_NAMES = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const PRIVILEGED_PUBLIC_BOOKING_FIELDS = new Set([
  'forceConfirmed',
  'source',
  'role',
]);

const ZOD_OBJECT_METHODS = new Set([
  'object',
  'strictObject',
  'looseObject',
  'extend',
]);

const INPLACE_ARRAY_METHODS = new Set([
  'sort',
  'reverse',
  'splice',
]);

const SNAPSHOT_MUTATING_ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

const SNAPSHOT_SHALLOW_COPY_METHODS = new Set([
  'filter',
  'slice',
  'toSorted',
  'toReversed',
  'toSpliced',
  'concat',
  'values',
]);

const SNAPSHOT_ELEMENT_ACCESS_METHODS = new Set([
  'find',
  'findLast',
  'at',
]);

const SNAPSHOT_CALLBACK_METHODS = new Set([
  'forEach',
  'map',
  'filter',
  'find',
  'findLast',
  'some',
  'every',
]);

const ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/;
const PX_UNIT_RE = /\b\d+(?:\.\d+)?px\b/i;
const DEMO_BYPASS_HEADER_RE = /^x-[a-z0-9-]*demo[a-z0-9-]*$/i;
const SECRET_ENV_NAME_RE = /(SECRET|TOKEN|KEY|PASSWORD)/i;
const LOCALHOST_URL_RE = /https?:\/\/localhost(?::\d+)?(?=$|\/|[?#\s'"`])|https?:\/\/localhost:$/i;

const SEO_NO_LOCALHOST_FILES = new Set([
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  'src/app/layout.tsx',
]);

const SENSITIVE_ADMIN_SECRET_FIELDS = new Set([
  'ownerPinHash',
  'accessTokenEncrypted',
  'refreshTokenEncrypted',
]);

const ADMIN_SECRET_SANITIZER_CALLEES = new Set([
  'toAdminSettingsDTO',
  'toPublicSettingsDTO',
  'toAdminCalendarConnectionDTO',
]);

const RAW_SETTINGS_PRODUCERS = new Set([
  'updateSalonSettings',
]);

const RAW_CALENDAR_PRODUCERS = new Set([
  'updateCalendarConnection',
]);

const RAW_SETTINGS_CONTAINER_PRODUCERS = new Set([
  'saveOnboardingSetup',
]);

function isSeoNoLocalhostFile(rel) {
  if (isTestFile(rel)) return false;
  return SEO_NO_LOCALHOST_FILES.has(rel) || rel.startsWith('src/lib/seo/');
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isTestFile(rel) {
  return /\.test\.(ts|tsx)$/.test(rel);
}

function isPureDomainFile(rel) {
  return (
    PURE_DOMAIN_FILES.has(rel) ||
    rel.startsWith('src/lib/contracts/') ||
    rel.startsWith('src/lib/availability/') ||
    rel.startsWith('src/lib/booking/') ||
    rel.startsWith('src/lib/loyalty/') ||
    rel.startsWith('src/lib/payments/') ||
    rel.startsWith('src/lib/notifications/')
  );
}

function isProductUiFile(rel) {
  return rel.startsWith('src/app/') || rel.startsWith('src/components/');
}

function isAstryxBoundaryExempt(rel) {
  return ASTRYX_BOUNDARY_EXEMPT.has(rel) || SATORI_OG_IMAGE_RE.test(rel);
}

function isPublicUiDtoBoundaryFile(rel) {
  if (isTestFile(rel)) return false;
  return (
    PUBLIC_UI_DTO_BOUNDARY_FILES.has(rel) ||
    rel.startsWith('src/app/reservar/') ||
    SATORI_OG_IMAGE_RE.test(rel)
  );
}

function isAdminRouteRequiringAuth(rel) {
  return (
    rel.startsWith('src/app/api/admin/') &&
    rel.endsWith('/route.ts') &&
    rel !== 'src/app/api/admin/session/route.ts'
  );
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
  const clamped = Math.max(0, Math.min(pos, sf.text.length));
  const { line, character } = sf.getLineAndCharacterOfPosition(clamped);
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

function unwrapExpression(expr) {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getStringLiteralValue(node) {
  const unwrapped = unwrapExpression(node);
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text;
  }
  return null;
}

function getPropertyNameText(nameNode) {
  if (ts.isIdentifier(nameNode)) return nameNode.text;
  if (ts.isStringLiteral(nameNode) || ts.isNoSubstitutionTemplateLiteral(nameNode)) {
    return nameNode.text;
  }
  return null;
}

function getEntityNameRightmostText(typeName) {
  if (ts.isIdentifier(typeName)) return typeName.text;
  if (ts.isQualifiedName(typeName)) return typeName.right.text;
  return null;
}

function getCalleeMethodName(expr) {
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  if (ts.isElementAccessExpression(expr) && expr.argumentExpression) {
    return getStringLiteralValue(expr.argumentExpression);
  }
  return null;
}

function isProcessEnvExpression(expr) {
  const unwrapped = unwrapExpression(expr);
  return (
    ts.isPropertyAccessExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === 'process' &&
    unwrapped.name.text === 'env'
  );
}

function extractSecretEnvName(expr) {
  const unwrapped = unwrapExpression(expr);

  if (ts.isPropertyAccessExpression(unwrapped) && isProcessEnvExpression(unwrapped.expression)) {
    const name = unwrapped.name.text;
    return SECRET_ENV_NAME_RE.test(name) ? name : null;
  }

  if (ts.isElementAccessExpression(unwrapped) && isProcessEnvExpression(unwrapped.expression)) {
    const key = unwrapped.argumentExpression
      ? getStringLiteralValue(unwrapped.argumentExpression)
      : null;
    return key && SECRET_ENV_NAME_RE.test(key) ? key : null;
  }

  if (
    ts.isCallExpression(unwrapped) &&
    ts.isPropertyAccessExpression(unwrapped.expression)
  ) {
    return extractSecretEnvName(unwrapped.expression.expression);
  }

  if (
    ts.isBinaryExpression(unwrapped) &&
    (unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return (
      extractSecretEnvName(unwrapped.left) || extractSecretEnvName(unwrapped.right)
    );
  }

  return null;
}

function checkComments(rel, text, sf, scriptKind, addViolation) {
  const languageVariant =
    scriptKind === ts.ScriptKind.TSX
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard;

  const seenPositions = new Set();

  function inspectTriviaSlice(sliceStart, sliceEnd) {
    if (sliceEnd <= sliceStart) return;
    const slice = text.slice(sliceStart, sliceEnd);
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      languageVariant,
      slice,
    );

    let prevPos = -1;
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
      const currentPos = scanner.getTextPos();
      if (currentPos <= prevPos) break;
      prevPos = currentPos;

      const tokenKind = scanner.getToken();
      if (
        tokenKind !== ts.SyntaxKind.SingleLineCommentTrivia &&
        tokenKind !== ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        continue;
      }

      const absStart = sliceStart + scanner.getTokenStart();
      const absEnd = sliceStart + currentPos;
      if (seenPositions.has(absStart)) continue;
      seenPositions.add(absStart);

      const commentText = text.slice(absStart, absEnd).trim();
      const { line, col } = getLineCol(sf, absStart);

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

  let prevEnd = 0;

  function walkTokens(node) {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(sf);
    if (children.length === 0) {
      if (node.kind === ts.SyntaxKind.SyntaxList) return;
      const tokenStart = node.getStart(sf);
      const tokenEnd = node.getEnd();
      if (tokenStart > prevEnd) {
        inspectTriviaSlice(prevEnd, tokenStart);
      }
      if (tokenEnd > prevEnd) {
        prevEnd = tokenEnd;
      }
      return;
    }
    for (const child of children) {
      walkTokens(child);
    }
  }

  walkTokens(sf);
  if (text.length > prevEnd) {
    inspectTriviaSlice(prevEnd, text.length);
  }
}

function hasExportModifier(node) {
  return Boolean(
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function checkAdminAuthRequired(rel, sf, addViolation) {
  const localFunctions = new Map();
  const exportedHandlers = [];

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      localFunctions.set(stmt.name.text, stmt);
      if (hasExportModifier(stmt) && HTTP_HANDLER_NAMES.has(stmt.name.text)) {
        exportedHandlers.push({ name: stmt.name.text, node: stmt });
      }
    } else if (ts.isVariableStatement(stmt)) {
      const exported = hasExportModifier(stmt);
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        localFunctions.set(decl.name.text, decl.initializer);
        if (exported && HTTP_HANDLER_NAMES.has(decl.name.text)) {
          exportedHandlers.push({ name: decl.name.text, node: decl.initializer });
        }
      }
    }
  }

  function callsRequireAdmin(rootNode, visited = new Set()) {
    let found = false;

    function scan(node) {
      if (found) return;
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (
          (ts.isIdentifier(expr) && expr.text === 'requireAdmin') ||
          (ts.isPropertyAccessExpression(expr) && expr.name.text === 'requireAdmin')
        ) {
          found = true;
          return;
        }
        if (ts.isIdentifier(expr) && localFunctions.has(expr.text) && !visited.has(expr.text)) {
          visited.add(expr.text);
          if (callsRequireAdmin(localFunctions.get(expr.text), visited)) {
            found = true;
            return;
          }
        }
      } else if (
        node === rootNode &&
        ts.isIdentifier(node) &&
        localFunctions.has(node.text) &&
        !visited.has(node.text)
      ) {
        visited.add(node.text);
        if (callsRequireAdmin(localFunctions.get(node.text), visited)) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, scan);
    }

    scan(rootNode);
    return found;
  }

  if (exportedHandlers.length === 0) {
    if (!callsRequireAdmin(sf)) {
      addViolation(
        rel,
        1,
        1,
        'admin-auth-required',
        `Toda ruta admin (${rel}) debe invocar requireAdmin().`,
      );
    }
    return;
  }

  for (const handler of exportedHandlers) {
    if (!callsRequireAdmin(handler.node)) {
      const { line, col } = getLineCol(sf, handler.node.getStart(sf));
      addViolation(
        rel,
        line,
        col,
        'admin-auth-required',
        `El handler admin ${handler.name} en ${rel} debe invocar requireAdmin().`,
      );
    }
  }
}

function checkSnapshotMutation(rel, sf, addViolation) {
  const scopes = [new Map()];

  function currentScope() {
    return scopes[scopes.length - 1];
  }

  function getTaint(name) {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      if (scopes[i].has(name)) {
        return scopes[i].get(name);
      }
    }
    return 'clean';
  }

  function isGetSnapshotCall(expr) {
    let current = unwrapExpression(expr);
    if (ts.isAwaitExpression(current)) {
      current = unwrapExpression(current.expression);
    }
    if (!ts.isCallExpression(current)) return false;
    const callee = current.expression;
    return (
      (ts.isIdentifier(callee) && callee.text === 'getSnapshot') ||
      (ts.isPropertyAccessExpression(callee) && callee.name.text === 'getSnapshot')
    );
  }

  function classifyExpression(expr) {
    const unwrapped = unwrapExpression(expr);

    if (isGetSnapshotCall(unwrapped)) {
      return 'ref';
    }

    if (ts.isIdentifier(unwrapped)) {
      return getTaint(unwrapped.text);
    }

    if (ts.isPropertyAccessExpression(unwrapped)) {
      return classifyExpression(unwrapped.expression) === 'ref' ? 'ref' : 'clean';
    }

    if (ts.isElementAccessExpression(unwrapped)) {
      const baseTaint = classifyExpression(unwrapped.expression);
      return baseTaint === 'ref' || baseTaint === 'elem' ? 'ref' : 'clean';
    }

    if (ts.isCallExpression(unwrapped)) {
      const method = getCalleeMethodName(unwrapped.expression);
      if (
        method &&
        (ts.isPropertyAccessExpression(unwrapped.expression) ||
          ts.isElementAccessExpression(unwrapped.expression))
      ) {
        const receiverTaint = classifyExpression(unwrapped.expression.expression);
        if (receiverTaint === 'ref' || receiverTaint === 'elem') {
          if (SNAPSHOT_SHALLOW_COPY_METHODS.has(method)) {
            return 'elem';
          }
          if (SNAPSHOT_ELEMENT_ACCESS_METHODS.has(method)) {
            return 'ref';
          }
        }
      }
    }

    if (ts.isArrayLiteralExpression(unwrapped)) {
      for (const el of unwrapped.elements) {
        if (ts.isSpreadElement(el)) {
          const spreadTaint = classifyExpression(el.expression);
          if (spreadTaint === 'ref' || spreadTaint === 'elem') {
            return 'elem';
          }
        }
      }
    }

    return 'clean';
  }

  function bindPattern(nameNode, taint, scope) {
    if (ts.isIdentifier(nameNode)) {
      scope.set(nameNode.text, taint);
    } else if (ts.isObjectBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        bindPattern(el.name, taint, scope);
      }
    } else if (ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (ts.isBindingElement(el)) {
          bindPattern(el.name, taint === 'elem' ? 'ref' : taint, scope);
        }
      }
    }
  }

  function walk(node, preBoundScope = null) {
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) {
        walk(node.initializer);
      }
      const taint = node.initializer ? classifyExpression(node.initializer) : 'clean';
      bindPattern(node.name, taint, currentScope());
      return;
    }

    if (ts.isForOfStatement(node)) {
      walk(node.expression);
      const exprTaint = classifyExpression(node.expression);
      const itemTaint = exprTaint === 'ref' || exprTaint === 'elem' ? 'ref' : 'clean';
      const loopScope = new Map();
      if (ts.isVariableDeclarationList(node.initializer)) {
        const decl = node.initializer.declarations[0];
        if (decl) {
          bindPattern(decl.name, itemTaint, loopScope);
        }
      }
      scopes.push(loopScope);
      walk(node.statement);
      scopes.pop();
      return;
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const fnScope = preBoundScope ?? new Map();
      for (const param of node.parameters) {
        if (!preBoundScope) {
          bindPattern(param.name, 'clean', fnScope);
        }
      }
      scopes.push(fnScope);
      if (node.body) {
        walk(node.body);
      }
      scopes.pop();
      return;
    }

    if (ts.isBlock(node)) {
      scopes.push(new Map());
      for (const stmt of node.statements) {
        walk(stmt);
      }
      scopes.pop();
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
    ) {
      const left = unwrapExpression(node.left);
      if (
        (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) &&
        classifyExpression(left.expression) === 'ref'
      ) {
        const { line, col } = getLineCol(sf, left.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-snapshot-mutation',
          'Prohibido mutar propiedades sobre datos obtenidos de getSnapshot(). Realiza las mutaciones dentro de withWriteLock() o trabaja sobre una copia.',
        );
      }
    }

    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const operand = unwrapExpression(node.operand);
      if (
        (ts.isPropertyAccessExpression(operand) ||
          ts.isElementAccessExpression(operand)) &&
        classifyExpression(operand.expression) === 'ref'
      ) {
        const { line, col } = getLineCol(sf, operand.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-snapshot-mutation',
          'Prohibido mutar propiedades sobre datos obtenidos de getSnapshot().',
        );
      }
    }

    if (ts.isDeleteExpression(node)) {
      const target = unwrapExpression(node.expression);
      if (
        (ts.isPropertyAccessExpression(target) ||
          ts.isElementAccessExpression(target)) &&
        classifyExpression(target.expression) === 'ref'
      ) {
        const { line, col } = getLineCol(sf, node.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-snapshot-mutation',
          'Prohibido eliminar propiedades sobre datos obtenidos de getSnapshot().',
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const method = getCalleeMethodName(node.expression);
      if (
        method &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression))
      ) {
        const receiver = node.expression.expression;
        const receiverTaint = classifyExpression(receiver);

        if (
          SNAPSHOT_MUTATING_ARRAY_METHODS.has(method) &&
          receiverTaint === 'ref'
        ) {
          const { line, col } = getLineCol(sf, node.expression.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-snapshot-mutation',
            `Prohibido invocar ".${method}()" sobre datos obtenidos de getSnapshot(). Usa métodos inmutables o withWriteLock().`,
          );
        }

        if (
          method === 'assign' &&
          ts.isIdentifier(receiver) &&
          receiver.text === 'Object' &&
          node.arguments[0] &&
          classifyExpression(node.arguments[0]) === 'ref'
        ) {
          const { line, col } = getLineCol(sf, node.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-snapshot-mutation',
            'Prohibido invocar Object.assign() mutando un objeto obtenido de getSnapshot().',
          );
        }

        if (
          SNAPSHOT_CALLBACK_METHODS.has(method) &&
          (receiverTaint === 'ref' || receiverTaint === 'elem') &&
          node.arguments[0] &&
          (ts.isArrowFunction(node.arguments[0]) ||
            ts.isFunctionExpression(node.arguments[0]))
        ) {
          walk(node.expression);
          const callback = node.arguments[0];
          const cbScope = new Map();
          for (let i = 0; i < callback.parameters.length; i += 1) {
            bindPattern(
              callback.parameters[i].name,
              i === 0 ? 'ref' : 'clean',
              cbScope,
            );
          }
          walk(callback, cbScope);
          for (let i = 1; i < node.arguments.length; i += 1) {
            walk(node.arguments[i]);
          }
          return;
        }
      }
    }

    ts.forEachChild(node, (child) => walk(child));
  }

  walk(sf);
}

function isHtmlTemplateExpression(node) {
  let staticText = node.head.text;
  for (const span of node.templateSpans) {
    staticText += span.literal.text;
  }
  return (
    HTML_CLOSING_TAG_RE.test(staticText) ||
    HTML_SELF_CLOSING_TAG_RE.test(staticText) ||
    HTML_KNOWN_OPEN_TAG_RE.test(staticText)
  );
}

function checkRawHtmlInterpolation(rel, sf, addViolation) {
  const localFns = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      localFns.set(stmt.name.text, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          localFns.set(decl.name.text, decl.initializer);
        }
      }
    }
  }

  const scopes = [new Map()];

  function currentScope() {
    return scopes[scopes.length - 1];
  }

  function isSafeIdentifier(name) {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      if (scopes[i].has(name)) {
        return scopes[i].get(name) === 'safe';
      }
    }
    return false;
  }

  function isFnReturningSafeHtml(fnNode, visitedFns) {
    if (!fnNode.body) return false;
    if (!ts.isBlock(fnNode.body)) {
      return isSafeExpr(fnNode.body, visitedFns);
    }

    const fnScope = new Map();
    for (const param of fnNode.parameters) {
      if (ts.isIdentifier(param.name)) {
        fnScope.set(param.name.text, 'unsafe');
      }
    }
    scopes.push(fnScope);

    const returns = [];
    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const safe = node.initializer ? isSafeExpr(node.initializer, visitedFns) : false;
        fnScope.set(node.name.text, safe ? 'safe' : 'unsafe');
        return;
      }
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        return;
      }
      if (ts.isReturnStatement(node)) {
        returns.push(node.expression ?? null);
        return;
      }
      ts.forEachChild(node, collect);
    }
    for (const stmt of fnNode.body.statements) {
      collect(stmt);
    }

    const allSafe =
      returns.length > 0 &&
      returns.every((ret) => ret !== null && isSafeExpr(ret, visitedFns));

    scopes.pop();
    return allSafe;
  }

  function isSafeExpr(expr, visitedFns = new Set()) {
    const unwrapped = unwrapExpression(expr);

    if (
      ts.isNumericLiteral(unwrapped) ||
      ts.isBigIntLiteral(unwrapped) ||
      ts.isStringLiteral(unwrapped) ||
      ts.isNoSubstitutionTemplateLiteral(unwrapped) ||
      unwrapped.kind === ts.SyntaxKind.TrueKeyword ||
      unwrapped.kind === ts.SyntaxKind.FalseKeyword ||
      unwrapped.kind === ts.SyntaxKind.NullKeyword
    ) {
      return true;
    }

    if (ts.isIdentifier(unwrapped)) {
      return isSafeIdentifier(unwrapped.text);
    }

    if (ts.isPrefixUnaryExpression(unwrapped)) {
      return isSafeExpr(unwrapped.operand, visitedFns);
    }

    if (ts.isConditionalExpression(unwrapped)) {
      return (
        isSafeExpr(unwrapped.whenTrue, visitedFns) &&
        isSafeExpr(unwrapped.whenFalse, visitedFns)
      );
    }

    if (ts.isBinaryExpression(unwrapped)) {
      const op = unwrapped.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        return isSafeExpr(unwrapped.right, visitedFns);
      }
      if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.PlusToken ||
        op === ts.SyntaxKind.MinusToken ||
        op === ts.SyntaxKind.AsteriskToken ||
        op === ts.SyntaxKind.SlashToken ||
        op === ts.SyntaxKind.PercentToken ||
        op === ts.SyntaxKind.AsteriskAsteriskToken
      ) {
        return (
          isSafeExpr(unwrapped.left, visitedFns) &&
          isSafeExpr(unwrapped.right, visitedFns)
        );
      }
      return false;
    }

    if (ts.isTemplateExpression(unwrapped)) {
      return unwrapped.templateSpans.every((span) =>
        isSafeExpr(span.expression, visitedFns),
      );
    }

    if (ts.isCallExpression(unwrapped)) {
      const callee = unwrapped.expression;

      if (ts.isIdentifier(callee)) {
        if (callee.text === 'escapeHtml' || SAFE_HTML_FORMAT_CALLEES.has(callee.text)) {
          return true;
        }
        if (localFns.has(callee.text) && !visitedFns.has(callee.text)) {
          const nextVisited = new Set(visitedFns);
          nextVisited.add(callee.text);
          return isFnReturningSafeHtml(localFns.get(callee.text), nextVisited);
        }
        return false;
      }

      const method = getCalleeMethodName(callee);
      if (
        method &&
        (ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee))
      ) {
        const receiver = callee.expression;

        if (method === 'escapeHtml') {
          return true;
        }
        if (ts.isIdentifier(receiver) && receiver.text === 'Math') {
          return true;
        }
        if (SAFE_HTML_NUMERIC_METHODS.has(method)) {
          return true;
        }
        if (SAFE_HTML_STRING_METHODS.has(method)) {
          if (!isSafeExpr(receiver, visitedFns)) return false;
          if (
            (method === 'replace' || method === 'replaceAll') &&
            unwrapped.arguments[1]
          ) {
            return isSafeExpr(unwrapped.arguments[1], visitedFns);
          }
          return true;
        }
        if (method === 'join') {
          const sepSafe =
            unwrapped.arguments.length === 0 ||
            isSafeExpr(unwrapped.arguments[0], visitedFns);
          if (!sepSafe) return false;
          const recv = unwrapExpression(receiver);
          if (ts.isCallExpression(recv) && getCalleeMethodName(recv.expression) === 'map') {
            const cb = recv.arguments[0] ? unwrapExpression(recv.arguments[0]) : null;
            if (!cb) return false;
            if (ts.isIdentifier(cb) && cb.text === 'escapeHtml') return true;
            if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
              return isFnReturningSafeHtml(cb, visitedFns);
            }
          }
          return isSafeExpr(receiver, visitedFns);
        }
      }
    }

    return false;
  }

  function walk(node) {
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) {
        walk(node.initializer);
      }
      if (ts.isIdentifier(node.name)) {
        const safe = node.initializer ? isSafeExpr(node.initializer) : false;
        currentScope().set(node.name.text, safe ? 'safe' : 'unsafe');
      }
      return;
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const fnScope = new Map();
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name)) {
          fnScope.set(param.name.text, 'unsafe');
        }
      }
      scopes.push(fnScope);
      if (node.body) {
        walk(node.body);
      }
      scopes.pop();
      return;
    }

    if (ts.isBlock(node)) {
      scopes.push(new Map());
      for (const stmt of node.statements) {
        walk(stmt);
      }
      scopes.pop();
      return;
    }

    if (ts.isTemplateExpression(node) && isHtmlTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        if (!isSafeExpr(span.expression)) {
          const { line, col } = getLineCol(sf, span.expression.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-raw-html-interpolation',
            'Interpolación HTML sin escapar en notificaciones. Envuelve los valores dinámicos con escapeHtml(...).',
          );
        }
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(sf);
}

function checkSensitiveAdminSecretsInApi(rel, sf, addViolation) {
  const scopes = [new Map()];

  const TAINT_PRIORITY = {
    clean: 0,
    snapshot: 1,
    'settings-container': 2,
    'raw-settings': 3,
    'raw-calendar': 3,
    secret: 4,
  };

  function currentScope() {
    return scopes[scopes.length - 1];
  }

  function getTaint(name) {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      if (scopes[i].has(name)) {
        return scopes[i].get(name);
      }
    }
    return 'clean';
  }

  function mergeTaint(a, b) {
    return TAINT_PRIORITY[b] > TAINT_PRIORITY[a] ? b : a;
  }

  function unwrapAwait(expr) {
    let current = unwrapExpression(expr);
    while (ts.isAwaitExpression(current)) {
      current = unwrapExpression(current.expression);
    }
    return current;
  }

  function isJsonResponseCall(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = unwrapExpression(node.expression);
    const method = getCalleeMethodName(callee);
    if (method !== 'json') return false;
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) {
      return false;
    }
    const receiver = unwrapExpression(callee.expression);
    return (
      ts.isIdentifier(receiver) &&
      (receiver.text === 'NextResponse' || receiver.text === 'Response')
    );
  }

  function isSanitizerCall(expr) {
    const node = unwrapAwait(expr);
    if (!ts.isCallExpression(node)) return false;
    const callee = unwrapExpression(node.expression);
    if (ts.isIdentifier(callee)) {
      return ADMIN_SECRET_SANITIZER_CALLEES.has(callee.text);
    }
    const method = getCalleeMethodName(callee);
    return Boolean(method && ADMIN_SECRET_SANITIZER_CALLEES.has(method));
  }

  function isSanitizerCallback(expr) {
    const node = unwrapExpression(expr);
    if (ts.isIdentifier(node)) {
      return ADMIN_SECRET_SANITIZER_CALLEES.has(node.text);
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (!ts.isBlock(node.body)) {
        return isSanitizerCall(node.body);
      }
      const returns = [];
      function collectReturns(inner) {
        if (
          ts.isFunctionDeclaration(inner) ||
          ts.isFunctionExpression(inner) ||
          ts.isArrowFunction(inner)
        ) {
          return;
        }
        if (ts.isReturnStatement(inner)) {
          returns.push(inner.expression ?? null);
          return;
        }
        ts.forEachChild(inner, collectReturns);
      }
      for (const stmt of node.body.statements) {
        collectReturns(stmt);
      }
      return returns.length > 0 && returns.every((ret) => ret !== null && isSanitizerCall(ret));
    }
    return false;
  }

  function classifyExpr(expr) {
    const node = unwrapAwait(expr);

    if (ts.isIdentifier(node)) {
      if (SENSITIVE_ADMIN_SECRET_FIELDS.has(node.text)) {
        return 'secret';
      }
      return getTaint(node.text);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const prop = node.name.text;
      if (SENSITIVE_ADMIN_SECRET_FIELDS.has(prop)) {
        return 'secret';
      }
      const base = classifyExpr(node.expression);
      if (base === 'snapshot') {
        if (prop === 'settings') return 'raw-settings';
        if (prop === 'calendarConnections') return 'raw-calendar';
        return 'clean';
      }
      if (base === 'settings-container' && prop === 'settings') {
        return 'raw-settings';
      }
      return 'clean';
    }

    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression
        ? getStringLiteralValue(node.argumentExpression)
        : null;
      if (key && SENSITIVE_ADMIN_SECRET_FIELDS.has(key)) {
        return 'secret';
      }
      const base = classifyExpr(node.expression);
      if (base === 'raw-calendar') return 'raw-calendar';
      if (base === 'snapshot') {
        if (key === 'settings') return 'raw-settings';
        if (key === 'calendarConnections') return 'raw-calendar';
      }
      if (base === 'settings-container' && key === 'settings') {
        return 'raw-settings';
      }
      return 'clean';
    }

    if (ts.isCallExpression(node)) {
      if (isSanitizerCall(node)) {
        return 'clean';
      }
      const callee = unwrapExpression(node.expression);
      if (ts.isIdentifier(callee)) {
        if (callee.text === 'getSnapshot') return 'snapshot';
        if (RAW_SETTINGS_PRODUCERS.has(callee.text)) return 'raw-settings';
        if (RAW_CALENDAR_PRODUCERS.has(callee.text)) return 'raw-calendar';
        if (RAW_SETTINGS_CONTAINER_PRODUCERS.has(callee.text)) {
          return 'settings-container';
        }
        if (callee.text === 'scopeByStaff' && node.arguments[0]) {
          const argTaint = classifyExpr(node.arguments[0]);
          if (argTaint === 'raw-calendar' || argTaint === 'secret') {
            return argTaint;
          }
        }
        return 'clean';
      }
      const method = getCalleeMethodName(callee);
      if (
        method &&
        (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))
      ) {
        if (method === 'getSnapshot') return 'snapshot';
        if (RAW_SETTINGS_PRODUCERS.has(method)) return 'raw-settings';
        if (RAW_CALENDAR_PRODUCERS.has(method)) return 'raw-calendar';
        if (RAW_SETTINGS_CONTAINER_PRODUCERS.has(method)) {
          return 'settings-container';
        }
        const recvTaint = classifyExpr(callee.expression);
        if (method === 'map') {
          if (node.arguments[0] && isSanitizerCallback(node.arguments[0])) {
            return 'clean';
          }
          if (recvTaint === 'raw-calendar' || recvTaint === 'secret') {
            return recvTaint;
          }
          return 'clean';
        }
        if (
          SNAPSHOT_SHALLOW_COPY_METHODS.has(method) ||
          SNAPSHOT_ELEMENT_ACCESS_METHODS.has(method)
        ) {
          if (
            recvTaint === 'raw-calendar' ||
            recvTaint === 'raw-settings' ||
            recvTaint === 'secret'
          ) {
            return recvTaint;
          }
        }
      }
      return 'clean';
    }

    if (ts.isConditionalExpression(node)) {
      return mergeTaint(classifyExpr(node.whenTrue), classifyExpr(node.whenFalse));
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      return mergeTaint(classifyExpr(node.left), classifyExpr(node.right));
    }

    if (ts.isObjectLiteralExpression(node)) {
      let taint = 'clean';
      for (const prop of node.properties) {
        if (ts.isSpreadAssignment(prop)) {
          taint = mergeTaint(taint, classifyExpr(prop.expression));
        } else if (ts.isPropertyAssignment(prop)) {
          const propName = getPropertyNameText(prop.name);
          if (propName && SENSITIVE_ADMIN_SECRET_FIELDS.has(propName)) {
            return 'secret';
          }
          const valTaint = classifyExpr(prop.initializer);
          if (propName === 'settings' && valTaint === 'clean' && taint === 'settings-container') {
            taint = 'clean';
          } else {
            taint = mergeTaint(taint, valTaint);
          }
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const propName = prop.name.text;
          if (SENSITIVE_ADMIN_SECRET_FIELDS.has(propName)) {
            return 'secret';
          }
          const valTaint = classifyExpr(prop.name);
          if (propName === 'settings' && valTaint === 'clean' && taint === 'settings-container') {
            taint = 'clean';
          } else {
            taint = mergeTaint(taint, valTaint);
          }
        }
      }
      return taint;
    }

    if (ts.isArrayLiteralExpression(node)) {
      let taint = 'clean';
      for (const el of node.elements) {
        taint = mergeTaint(
          taint,
          classifyExpr(ts.isSpreadElement(el) ? el.expression : el),
        );
      }
      return taint;
    }

    return 'clean';
  }

  function bindPattern(nameNode, taint, scope) {
    if (ts.isIdentifier(nameNode)) {
      scope.set(nameNode.text, taint);
    } else if (ts.isObjectBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (el.dotDotDotToken) {
          bindPattern(el.name, taint, scope);
          continue;
        }
        const propName = el.propertyName
          ? getPropertyNameText(el.propertyName)
          : ts.isIdentifier(el.name)
            ? el.name.text
            : null;
        if (propName && SENSITIVE_ADMIN_SECRET_FIELDS.has(propName)) {
          bindPattern(el.name, 'secret', scope);
        } else if (taint === 'snapshot') {
          if (propName === 'settings') {
            bindPattern(el.name, 'raw-settings', scope);
          } else if (propName === 'calendarConnections') {
            bindPattern(el.name, 'raw-calendar', scope);
          } else {
            bindPattern(el.name, 'clean', scope);
          }
        } else if (taint === 'settings-container' && propName === 'settings') {
          bindPattern(el.name, 'raw-settings', scope);
        } else {
          bindPattern(el.name, 'clean', scope);
        }
      }
    } else if (ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (ts.isBindingElement(el)) {
          bindPattern(
            el.name,
            taint === 'raw-calendar' || taint === 'secret' ? taint : 'clean',
            scope,
          );
        }
      }
    }
  }

  function reportSecretTaint(node, taint, detail) {
    const { line, col } = getLineCol(sf, node.getStart(sf));
    if (taint === 'raw-settings' || taint === 'settings-container' || taint === 'snapshot') {
      addViolation(
        rel,
        line,
        col,
        'no-sensitive-admin-secrets-in-api',
        `Prohibido devolver SalonSettings sin sanitizar en NextResponse.json() (${detail}). Usa toAdminSettingsDTO(...) o toPublicSettingsDTO(...) para omitir ownerPinHash.`,
      );
    } else if (taint === 'raw-calendar') {
      addViolation(
        rel,
        line,
        col,
        'no-sensitive-admin-secrets-in-api',
        `Prohibido devolver CalendarConnection sin sanitizar en NextResponse.json() (${detail}). Usa toAdminCalendarConnectionDTO(...) para omitir accessTokenEncrypted/refreshTokenEncrypted.`,
      );
    } else {
      addViolation(
        rel,
        line,
        col,
        'no-sensitive-admin-secrets-in-api',
        `Campo secreto sensible prohibido en NextResponse.json() (${detail}). Nunca devuelvas ownerPinHash, accessTokenEncrypted ni refreshTokenEncrypted.`,
      );
    }
  }

  function inspectJsonPayload(expr) {
    const node = unwrapAwait(expr);

    if (ts.isObjectLiteralExpression(node)) {
      const hasCleanSettingsOverrideAfter = (startIndex) => {
        for (let j = startIndex + 1; j < node.properties.length; j += 1) {
          const later = node.properties[j];
          if (ts.isPropertyAssignment(later) && getPropertyNameText(later.name) === 'settings') {
            return classifyExpr(later.initializer) === 'clean';
          }
          if (ts.isShorthandPropertyAssignment(later) && later.name.text === 'settings') {
            return classifyExpr(later.name) === 'clean';
          }
        }
        return false;
      };

      for (let i = 0; i < node.properties.length; i += 1) {
        const prop = node.properties[i];
        if (ts.isSpreadAssignment(prop)) {
          const spreadTaint = classifyExpr(prop.expression);
          if (spreadTaint === 'settings-container' && hasCleanSettingsOverrideAfter(i)) {
            continue;
          }
          if (spreadTaint !== 'clean') {
            reportSecretTaint(prop.expression, spreadTaint, prop.expression.getText(sf));
          }
        } else if (ts.isPropertyAssignment(prop)) {
          const propName = getPropertyNameText(prop.name);
          if (propName && SENSITIVE_ADMIN_SECRET_FIELDS.has(propName)) {
            reportSecretTaint(prop.name, 'secret', propName);
            continue;
          }
          inspectJsonPayload(prop.initializer);
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const propName = prop.name.text;
          if (SENSITIVE_ADMIN_SECRET_FIELDS.has(propName)) {
            reportSecretTaint(prop.name, 'secret', propName);
            continue;
          }
          const valTaint = classifyExpr(prop.name);
          if (valTaint !== 'clean') {
            reportSecretTaint(prop.name, valTaint, propName);
          }
        }
      }
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      for (const el of node.elements) {
        inspectJsonPayload(ts.isSpreadElement(el) ? el.expression : el);
      }
      return;
    }

    if (ts.isConditionalExpression(node)) {
      inspectJsonPayload(node.whenTrue);
      inspectJsonPayload(node.whenFalse);
      return;
    }

    const taint = classifyExpr(node);
    if (taint !== 'clean') {
      reportSecretTaint(node, taint, node.getText(sf));
    }
  }

  function walk(node) {
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) {
        walk(node.initializer);
      }
      const taint = node.initializer ? classifyExpr(node.initializer) : 'clean';
      bindPattern(node.name, taint, currentScope());
      return;
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const fnScope = new Map();
      for (const param of node.parameters) {
        bindPattern(param.name, 'clean', fnScope);
      }
      scopes.push(fnScope);
      if (node.body) {
        walk(node.body);
      }
      scopes.pop();
      return;
    }

    if (ts.isBlock(node)) {
      scopes.push(new Map());
      for (const stmt of node.statements) {
        walk(stmt);
      }
      scopes.pop();
      return;
    }

    if (isJsonResponseCall(node) && node.arguments[0]) {
      inspectJsonPayload(node.arguments[0]);
    }

    ts.forEachChild(node, walk);
  }

  walk(sf);
}

export function checkSourceText(rawRel, text) {
  const rel = toPosix(rawRel);
  const full = path.resolve(ROOT, rel);
  const scriptKind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, scriptKind);

  const violations = [];
  function addViolation(fileRel, line, col, rule, message) {
    violations.push({ rel: fileRel, line, col, rule, message });
  }

  checkComments(rel, text, sf, scriptKind, addViolation);

  const testFile = isTestFile(rel);
  const productUi = isProductUiFile(rel);
  const checkAstryx = productUi && !isAstryxBoundaryExempt(rel);
  const pureDomain = isPureDomainFile(rel);
  const inComponents = rel.startsWith('src/components/');
  const inLib = rel.startsWith('src/lib/');
  const isClockFile = rel === 'src/lib/clock.ts';
  const isPublicUiDtoBoundary = isPublicUiDtoBoundaryFile(rel);
  const isPublicBookingsRoute = rel === 'src/app/api/bookings/route.ts';
  const isBookingContractsFile = rel === 'src/lib/contracts/bookings.ts';
  const isNotificationsFile = rel === 'src/lib/integrations/notifications.ts';
  const isSeoNoLocalhost = isSeoNoLocalhostFile(rel);
  const isApiRoute = rel.startsWith('src/app/api/') && !testFile;
  const hasCsvContentType = !testFile && text.toLowerCase().includes('text/csv');

  if (isAdminRouteRequiringAuth(rel)) {
    checkAdminAuthRequired(rel, sf, addViolation);
  }

  if (isApiRoute) {
    checkSensitiveAdminSecretsInApi(rel, sf, addViolation);
  }

  if (!testFile) {
    checkSnapshotMutation(rel, sf, addViolation);
  }

  if (rel.startsWith('src/app/') && !testFile) {
    for (const stmt of sf.statements) {
      if (
        ts.isImportDeclaration(stmt) &&
        ts.isStringLiteral(stmt.moduleSpecifier) &&
        stmt.moduleSpecifier.text === '@/lib/repositories/db' &&
        stmt.importClause?.namedBindings &&
        ts.isNamedImports(stmt.importClause.namedBindings)
      ) {
        for (const el of stmt.importClause.namedBindings.elements) {
          const importedName = el.propertyName?.text ?? el.name.text;
          if (importedName === 'getSnapshot') {
            const { line, col } = getLineCol(sf, el.getStart(sf));
            addViolation(
              rel,
              line,
              col,
              'no-sync-snapshot-in-app',
              'Prohibido importar getSnapshot() síncrono en src/app/**. Usa "await getRepository().getSnapshot()" para garantizar persistencia en Supabase/Workers.',
            );
          }
        }
      }
    }
  }

  if (isNotificationsFile) {
    checkRawHtmlInterpolation(rel, sf, addViolation);
  }

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

    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      ts.isTypeReferenceNode(node.type) &&
      getEntityNameRightmostText(node.type.typeName) === 'DemoDatabase'
    ) {
      const { line, col } = getLineCol(sf, node.getStart(sf));
      addViolation(
        rel,
        line,
        col,
        'no-unsafe-db-cast',
        'Prohibido castear sin validar con "as DemoDatabase". Usa parseDemoDatabase(...) con Zod.',
      );
    }

    if (inLib && !isClockFile && !testFile && ts.isCallExpression(node)) {
      const method = getCalleeMethodName(node.expression);
      if (
        method === 'random' &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression)) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Math'
      ) {
        const { line, col } = getLineCol(sf, node.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-direct-math-random',
          'Prohibido usar Math.random() en src/lib/**. Usa crypto.randomUUID() o un Clock inyectado.',
        );
      }
    }

    if (!testFile) {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node)
      ) {
        if (DEMO_BYPASS_HEADER_RE.test(node.text)) {
          const { line, col } = getLineCol(sf, node.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-demo-bypass-headers',
            `Header de bypass demo prohibido ("${node.text}"). Las rutas deben validar firmas o sesiones reales.`,
          );
        }
      }
    }

    if (
      isSeoNoLocalhost &&
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      LOCALHOST_URL_RE.test(node.text)
    ) {
      const { line, col } = getLineCol(sf, node.getStart(sf));
      addViolation(
        rel,
        line,
        col,
        'no-localhost-in-seo',
        `Prohibida URL literal de localhost ("${node.text}") en metadatos/SEO (${rel}). Usa getSiteOrigin() o getSiteMetadataBase() de @/lib/seo/site-url.`,
      );
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      const secretEnvName = extractSecretEnvName(node.left);
      const fallbackValue = getStringLiteralValue(node.right);
      if (secretEnvName && fallbackValue !== null && fallbackValue.length > 0) {
        const { line, col } = getLineCol(sf, node.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-secret-fallbacks',
          `Prohibido usar un valor por defecto literal para el secreto "process.env.${secretEnvName}". Falla cerrado si falta el secreto.`,
        );
      }
    }

    if (isPublicUiDtoBoundary) {
      if (ts.isIdentifier(node) && INTERNAL_DTO_FIELDS.has(node.text)) {
        const { line, col } = getLineCol(sf, node.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-internal-dto-in-public-ui',
          `Campo interno "${node.text}" prohibido en UI pública (${rel}). Usa PublicStaffDTO / PublicSettingsDTO.`,
        );
      } else if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        INTERNAL_DTO_FIELDS.has(node.text)
      ) {
        const { line, col } = getLineCol(sf, node.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-internal-dto-in-public-ui',
          `Campo interno "${node.text}" prohibido en UI pública (${rel}). Usa PublicStaffDTO / PublicSettingsDTO.`,
        );
      }
    }

    if (
      isBookingContractsFile &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'PublicCreateBookingSchema' &&
      node.initializer
    ) {
      function scanPublicContract(inner) {
        if (ts.isCallExpression(inner)) {
          const method = getCalleeMethodName(inner.expression);
          const firstArg = inner.arguments[0] ? unwrapExpression(inner.arguments[0]) : null;
          if (
            method &&
            ZOD_OBJECT_METHODS.has(method) &&
            firstArg &&
            ts.isObjectLiteralExpression(firstArg)
          ) {
            for (const prop of firstArg.properties) {
              if (
                ts.isPropertyAssignment(prop) ||
                ts.isShorthandPropertyAssignment(prop) ||
                ts.isMethodDeclaration(prop)
              ) {
                const propName = getPropertyNameText(prop.name);
                if (propName && PRIVILEGED_PUBLIC_BOOKING_FIELDS.has(propName)) {
                  const { line, col } = getLineCol(sf, prop.name.getStart(sf));
                  addViolation(
                    rel,
                    line,
                    col,
                    'no-privileged-public-fields',
                    `Campo privilegiado "${propName}" prohibido en PublicCreateBookingSchema.`,
                  );
                }
              }
            }
          }
        }
        ts.forEachChild(inner, scanPublicContract);
      }
      scanPublicContract(node.initializer);
    }

    if (isPublicBookingsRoute && ts.isCallExpression(node)) {
      const method = getCalleeMethodName(node.expression);
      const firstArg = node.arguments[0] ? unwrapExpression(node.arguments[0]) : null;
      if (
        method &&
        ZOD_OBJECT_METHODS.has(method) &&
        firstArg &&
        ts.isObjectLiteralExpression(firstArg)
      ) {
        for (const prop of firstArg.properties) {
          if (
            ts.isPropertyAssignment(prop) ||
            ts.isShorthandPropertyAssignment(prop) ||
            ts.isMethodDeclaration(prop)
          ) {
            const propName = getPropertyNameText(prop.name);
            if (propName && PRIVILEGED_PUBLIC_BOOKING_FIELDS.has(propName)) {
              const { line, col } = getLineCol(sf, prop.name.getStart(sf));
              addViolation(
                rel,
                line,
                col,
                'no-privileged-public-fields',
                `Campo privilegiado "${propName}" prohibido en el esquema Zod del endpoint público de reservas.`,
              );
            }
          }
        }
      }
    }

    if (productUi && !testFile && ts.isCallExpression(node)) {
      const method = getCalleeMethodName(node.expression);
      if (method && INPLACE_ARRAY_METHODS.has(method)) {
        const { line, col } = getLineCol(sf, node.expression.getStart(sf));
        addViolation(
          rel,
          line,
          col,
          'no-inplace-array-mutation',
          `Prohibido mutar arreglos en su lugar con ".${method}()" en ${rel}. Usa alternativas inmutables (toSorted, toReversed, toSpliced).`,
        );
      }
    }

    if (hasCsvContentType && ts.isCallExpression(node)) {
      const method = getCalleeMethodName(node.expression);
      if (method === 'join') {
        const isRawCommaJoin =
          node.arguments.length === 0 ||
          (node.arguments.length === 1 &&
            getStringLiteralValue(node.arguments[0]) === ',');
        if (isRawCommaJoin) {
          const { line, col } = getLineCol(sf, node.expression.getStart(sf));
          addViolation(
            rel,
            line,
            col,
            'no-raw-csv-join',
            'Prohibido construir CSV con ".join(\',\')" crudo. Usa un serializador RFC 4180 con protección contra inyección de fórmulas.',
          );
        }
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const { line, col } = getLineCol(sf, node.moduleSpecifier.getStart(sf));
      const resolvedRel = resolveImportToRel(full, spec);

      if (
        productUi &&
        spec === 'react' &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
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
          (pkg) =>
            spec === pkg ||
            spec.startsWith(`${pkg}/`) ||
            (pkg.endsWith('/') && spec.startsWith(pkg)),
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
            resolvedRel.startsWith('src/lib/integrations/') ||
            resolvedRel.startsWith('src/lib/auth/'))
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
  return violations;
}

function runCli() {
  const files = walkSourceFiles(SRC_DIR);
  const allViolations = [];

  for (const { full, rel } of files) {
    const text = fs.readFileSync(full, 'utf-8');
    allViolations.push(...checkSourceText(rel, text));
  }

  if (allViolations.length > 0) {
    console.error(`\n[guardrails] ${allViolations.length} violación(es) detectada(s):\n`);
    for (const v of allViolations) {
      console.error(`  ${v.rel}:${v.line}:${v.col}  [${v.rule}]  ${v.message}`);
    }
    console.error('');
    process.exit(1);
  }

  console.log(`[guardrails] OK — ${files.length} archivos verificados con 0 violaciones.`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  entryPath.length > 0 &&
  (process.platform === 'win32'
    ? entryPath.toLowerCase() === selfPath.toLowerCase()
    : entryPath === selfPath);

if (isMain) {
  runCli();
}
