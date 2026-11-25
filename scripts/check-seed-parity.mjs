import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = process.cwd();
const DEMO_SEED_PATH = path.join(ROOT, 'src', 'lib', 'demo-seed.ts');
const SEED_SQL_PATH = path.join(ROOT, 'supabase', 'seed.sql');

function getPropName(prop) {
  if (!ts.isPropertyAssignment(prop)) return null;
  if (ts.isIdentifier(prop.name)) return prop.name.text;
  if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
    return prop.name.text;
  }
  return null;
}

function getLiteralValue(expr) {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isNumericLiteral(expr)) {
    return Number(expr.text);
  }
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return -Number(expr.operand.text);
  }
  return null;
}

function findObjectProperty(objLiteral, key) {
  for (const prop of objLiteral.properties) {
    if (getPropName(prop) === key) {
      return prop.initializer;
    }
  }
  return null;
}

function extractDemoSeedEntities(demoSeedText) {
  const sf = ts.createSourceFile(
    DEMO_SEED_PATH,
    demoSeedText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let rootObj = null;
  function findReturnObject(node) {
    if (rootObj) return;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'createInitialDemoDatabase' &&
      node.body
    ) {
      for (const stmt of node.body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression && ts.isObjectLiteralExpression(stmt.expression)) {
          rootObj = stmt.expression;
          return;
        }
      }
    }
    ts.forEachChild(node, findReturnObject);
  }
  findReturnObject(sf);

  if (!rootObj) {
    throw new Error('No se encontró el objeto retornado por createInitialDemoDatabase() en src/lib/demo-seed.ts');
  }

  const settingsObj = findObjectProperty(rootObj, 'settings');
  const salonName =
    settingsObj && ts.isObjectLiteralExpression(settingsObj)
      ? getLiteralValue(findObjectProperty(settingsObj, 'name'))
      : null;

  function readArrayObjects(propName, fieldNames) {
    const arr = findObjectProperty(rootObj, propName);
    if (!arr || !ts.isArrayLiteralExpression(arr)) return [];
    const items = [];
    for (const el of arr.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const record = {};
      for (const field of fieldNames) {
        record[field] = getLiteralValue(findObjectProperty(el, field));
      }
      items.push(record);
    }
    return items;
  }

  return {
    salonName,
    staff: readArrayObjects('staff', ['bookingSlug', 'name']),
    categories: readArrayObjects('categories', ['slug', 'name']),
    services: readArrayObjects('services', ['slug', 'name', 'durationMinutes', 'priceCents']),
    addons: readArrayObjects('addons', ['name', 'extraMinutes', 'extraPriceCents']),
    coupons: readArrayObjects('coupons', ['code', 'kind', 'discountType', 'discountValue']),
  };
}

function stripSqlLineComments(sqlText) {
  let out = '';
  let inSingleQuote = false;
  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];
    if (inSingleQuote) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      out += ch;
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sqlText.length && sqlText[i] !== '\n') {
        i += 1;
      }
      if (i < sqlText.length) out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

function extractInsertBlock(cleanSql, tableName) {
  const re = new RegExp(
    `INSERT\\s+INTO\\s+public\\.${tableName}\\b[\\s\\S]*?;`,
    'gi',
  );
  const matches = cleanSql.match(re);
  return matches ? matches.join('\n') : '';
}

function escapeSqlSingleQuote(value) {
  return String(value).replace(/'/g, "''");
}

function hasSqlLiteral(block, value) {
  return block.includes(`'${escapeSqlSingleQuote(value)}'`);
}

function splitTopLevelTuples(valuesBody) {
  const tuples = [];
  let depth = 0;
  let inQuote = false;
  let start = -1;

  for (let i = 0; i < valuesBody.length; i += 1) {
    const ch = valuesBody[i];
    const next = valuesBody[i + 1];
    if (inQuote) {
      if (ch === "'" && next === "'") {
        i += 1;
      } else if (ch === "'") {
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      continue;
    }
    if (ch === '(') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        tuples.push(valuesBody.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return tuples;
}

function getInsertValuesTuples(block) {
  const idx = block.search(/\bVALUES\b/i);
  if (idx === -1) return [];
  const afterValues = block.slice(idx + 6);
  const conflictIdx = afterValues.search(/\bON\s+CONFLICT\b/i);
  const body = conflictIdx === -1 ? afterValues : afterValues.slice(0, conflictIdx);
  return splitTopLevelTuples(body);
}

export function checkSeedParity(demoSeedText, seedSqlText) {
  const demo = extractDemoSeedEntities(demoSeedText);
  const cleanSql = stripSqlLineComments(seedSqlText);
  const diffs = [];

  if (!demo.salonName) {
    diffs.push('No se pudo leer settings.name de src/lib/demo-seed.ts');
  } else {
    const settingsBlock = extractInsertBlock(cleanSql, 'salon_settings');
    if (!hasSqlLiteral(settingsBlock, demo.salonName)) {
      diffs.push(`salon_settings: falta nombre de salón "${demo.salonName}" en supabase/seed.sql`);
    }
  }

  const staffBlock = extractInsertBlock(cleanSql, 'staff_members');
  const staffTuples = getInsertValuesTuples(staffBlock);
  if (demo.staff.length === 0) {
    diffs.push('demo-seed.ts no contiene especialistas en staff[]');
  }
  for (const member of demo.staff) {
    const tuple = staffTuples.find((t) => hasSqlLiteral(t, member.bookingSlug));
    if (!tuple) {
      diffs.push(`staff_members: falta booking_slug "${member.bookingSlug}" en supabase/seed.sql`);
    } else if (!hasSqlLiteral(tuple, member.name)) {
      diffs.push(`staff_members: nombre de "${member.bookingSlug}" difiere (esperado "${member.name}")`);
    }
  }

  const categoriesBlock = extractInsertBlock(cleanSql, 'service_categories');
  const categoryTuples = getInsertValuesTuples(categoriesBlock);
  if (demo.categories.length === 0) {
    diffs.push('demo-seed.ts no contiene categorías en categories[]');
  }
  for (const cat of demo.categories) {
    const tuple = categoryTuples.find((t) => hasSqlLiteral(t, cat.slug));
    if (!tuple) {
      diffs.push(`service_categories: falta slug "${cat.slug}" en supabase/seed.sql`);
    } else if (!hasSqlLiteral(tuple, cat.name)) {
      diffs.push(`service_categories: nombre de "${cat.slug}" difiere (esperado "${cat.name}")`);
    }
  }

  const servicesBlock = extractInsertBlock(cleanSql, 'services');
  const serviceTuples = getInsertValuesTuples(servicesBlock);
  if (demo.services.length === 0) {
    diffs.push('demo-seed.ts no contiene servicios en services[]');
  }
  for (const srv of demo.services) {
    const tuple = serviceTuples.find((t) => hasSqlLiteral(t, srv.slug));
    if (!tuple) {
      diffs.push(`services: falta slug "${srv.slug}" en supabase/seed.sql`);
      continue;
    }
    if (!hasSqlLiteral(tuple, srv.name)) {
      diffs.push(`services: nombre de "${srv.slug}" difiere (esperado "${srv.name}")`);
    }
    if (!new RegExp(`\\b${srv.durationMinutes}\\b`).test(tuple)) {
      diffs.push(`services: duration_minutes de "${srv.slug}" difiere (esperado ${srv.durationMinutes})`);
    }
    if (!new RegExp(`\\b${srv.priceCents}\\b`).test(tuple)) {
      diffs.push(`services: price_cents de "${srv.slug}" difiere (esperado ${srv.priceCents})`);
    }
  }

  const addonsBlock = extractInsertBlock(cleanSql, 'service_addons');
  const addonTuples = getInsertValuesTuples(addonsBlock);
  if (demo.addons.length === 0) {
    diffs.push('demo-seed.ts no contiene extras en addons[]');
  }
  for (const addon of demo.addons) {
    const tuple = addonTuples.find((t) => hasSqlLiteral(t, addon.name));
    if (!tuple) {
      diffs.push(`service_addons: falta extra "${addon.name}" en supabase/seed.sql`);
      continue;
    }
    if (!new RegExp(`\\b${addon.extraMinutes}\\b`).test(tuple)) {
      diffs.push(`service_addons: extra_minutes de "${addon.name}" difiere (esperado ${addon.extraMinutes})`);
    }
    if (!new RegExp(`\\b${addon.extraPriceCents}\\b`).test(tuple)) {
      diffs.push(`service_addons: extra_price_cents de "${addon.name}" difiere (esperado ${addon.extraPriceCents})`);
    }
  }

  const couponsBlock = extractInsertBlock(cleanSql, 'coupons');
  const couponTuples = getInsertValuesTuples(couponsBlock);
  if (demo.coupons.length === 0) {
    diffs.push('demo-seed.ts no contiene cupones en coupons[]');
  }
  for (const coupon of demo.coupons) {
    const tuple = couponTuples.find((t) => hasSqlLiteral(t, coupon.code));
    if (!tuple) {
      diffs.push(`coupons: falta código "${coupon.code}" en supabase/seed.sql`);
      continue;
    }
    if (!hasSqlLiteral(tuple, coupon.kind) || !hasSqlLiteral(tuple, coupon.discountType)) {
      diffs.push(`coupons: tipo/descuento de "${coupon.code}" difiere de demo-seed.ts`);
    }
    if (!new RegExp(`\\b${coupon.discountValue}\\b`).test(tuple)) {
      diffs.push(`coupons: discount_value de "${coupon.code}" difiere (esperado ${coupon.discountValue})`);
    }
  }

  return {
    ok: diffs.length === 0,
    diffs,
    counts: {
      staff: demo.staff.length,
      categories: demo.categories.length,
      services: demo.services.length,
      addons: demo.addons.length,
      coupons: demo.coupons.length,
    },
  };
}

function runCli() {
  const demoSeedText = fs.readFileSync(DEMO_SEED_PATH, 'utf-8');
  const seedSqlText = fs.readFileSync(SEED_SQL_PATH, 'utf-8');
  const result = checkSeedParity(demoSeedText, seedSqlText);

  if (!result.ok) {
    console.error(`\n[seed-parity] ${result.diffs.length} diferencia(s) entre src/lib/demo-seed.ts y supabase/seed.sql:\n`);
    for (const diff of result.diffs) {
      console.error(`  - ${diff}`);
    }
    console.error('');
    process.exit(1);
  }

  const c = result.counts;
  console.log(
    `[seed-parity] OK — paridad verificada (${c.staff} staff, ${c.categories} categorías, ${c.services} servicios, ${c.addons} extras, ${c.coupons} cupones).`,
  );
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
