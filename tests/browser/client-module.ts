/**
 * One way to run a real client module inside a Playwright page.
 *
 * Several browser specs exercise a client class directly instead of booting the
 * whole app: they read `src/client/<name>.ts` off disk, drop its `import`
 * statements, transpile the rest and inject it with `addScriptTag`. Every spec
 * used to hand-roll that, including its own little prelude of stand-ins for
 * whatever the dropped imports used to provide. When `media-element.ts` arrived
 * and client modules switched from `document.createElement('video')` to
 * `createVideo()`, twelve specs broke at once with a bare
 * `ReferenceError: createVideo is not defined` raised inside `page.evaluate`,
 * because nothing checked that the prelude still covered the imports.
 *
 * So this module owns the idiom, and it refuses to build a bundle whose imports
 * are not all accounted for. A client module that gains an import now fails at
 * test time with the symbol, the file that wants it and the file it comes from,
 * rather than at runtime with a name and no context.
 *
 * `import.meta.env` is rewritten to a plain object, because an injected script
 * tag is a classic script and `import.meta` there is a *syntax* error - which
 * kills the whole tag silently and shows up much later as
 * `window.Thing is not a constructor`.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Page } from "@playwright/test";

/** Modules whose real source is always prepended, so the stand-ins are the genuine article. */
const PRELUDE_MODULES = ["media-element"] as const;

const ENV = "__CLIENT_MODULE_ENV";

export interface BundleOptions {
  /**
   * Client module basenames under `src/client/`, in evaluation order
   * (dependencies first). Every import they make must be satisfied by another
   * entry here, by `stubs`, or by the prelude.
   */
  modules: string[];
  /**
   * Deliberate stand-ins, `identifier` to a JavaScript expression. Use these
   * when the spec wants a controlled fake (`handMotion:"()=>({name:'none'})"`),
   * not merely to silence a missing import.
   */
  stubs?: Record<string, string>;
  /** `window` properties to publish, `name` to expression (defaults to the identifier itself). */
  expose?: readonly string[] | Record<string, string>;
  /** Extra code appended after the modules and the `window` assignments. */
  append?: string;
}

interface Processed {
  name: string;
  path: string;
  code: string;
  /** Value imports this module makes, with the specifier they came from. */
  imports: { symbol: string; from: string }[];
  /** Names this module declares at top level once `export` is dropped. */
  declares: string[];
}

function blank(text: string, start: number, end: number) {
  // Keep newlines so reported line numbers still match the file on disk.
  const removed = text.slice(start, end).replace(/[^\r\n]/g, " ");
  return text.slice(0, start) + removed + text.slice(end);
}

function declaredNames(statement: ts.Statement): string[] {
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) {
    return statement.name ? [statement.name.text] : [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  }
  return [];
}

function processModule(name: string): Processed {
  const path = `src/client/${name}.ts`;
  const original = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, original, ts.ScriptTarget.ES2022, true);
  const imports: { symbol: string; from: string }[] = [];
  const declares: string[] = [];
  // Collect edits first, apply back-to-front, so offsets stay valid.
  const cuts: [number, number][] = [];
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      cuts.push([statement.getStart(file), statement.getEnd()]);
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const from = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (clause.name) imports.push({ symbol: clause.name.text, from });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        imports.push({ symbol: bindings.name.text, from });
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) imports.push({ symbol: element.name.text, from });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      // `export {a, b}` / `export default x` carry no declarations of their own.
      cuts.push([statement.getStart(file), statement.getEnd()]);
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const keyword = modifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (keyword) {
      cuts.push([keyword.getStart(file), keyword.getEnd()]);
      declares.push(...declaredNames(statement));
    } else declares.push(...declaredNames(statement));
  }
  let code = original;
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) code = blank(code, start, end);
  code = code.split("import.meta.env").join(ENV);
  if (code.includes("import.meta")) {
    throw new Error(
      `${path}: uses import.meta beyond import.meta.env, which cannot run in an injected classic script. ` +
        `Extend the rewrite in tests/browser/client-module.ts before using this module in a browser spec.`,
    );
  }
  return { name, path, code, imports, declares };
}

const functionCache = new Map<string, ts.SourceFile>();

/**
 * The source text of one top-level function from a client module, for specs that
 * exercise a single function against hand-written surroundings rather than
 * loading the module. Throws by name if the function is gone or was renamed.
 */
export function clientFunction(module: string, name: string) {
  const path = `src/client/${module}.ts`;
  let file = functionCache.get(path);
  if (!file) {
    file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
    functionCache.set(path, file);
  }
  const declaration = file.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration) {
    throw new Error(`${path} declares no top-level function ${name}(). It was renamed, moved or removed.`);
  }
  return declaration.getText(file);
}

/** Transpile page code. Shared so no spec grows its own compiler options. */
export function transpile(source: string) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

/**
 * Build the injectable script for `options.modules`, failing by name if any
 * import is unaccounted for.
 */
export function clientBundle(options: BundleOptions) {
  const stubs = options.stubs ?? {};
  const prelude = PRELUDE_MODULES.map(processModule);
  const modules = options.modules.map(processModule);
  const all = [...prelude, ...modules];

  const declared = new Map<string, string>();
  for (const module of all) {
    for (const name of module.declares) declared.set(name, module.path);
  }
  for (const name of Object.keys(stubs)) {
    const owner = declared.get(name);
    if (owner) {
      throw new Error(
        `stubs.${name} collides with the real ${name} declared in ${owner}. ` +
          `Drop the stub, or drop that module from the bundle - two declarations of one name is a syntax error in the page.`,
      );
    }
  }

  const missing: string[] = [];
  for (const module of modules) {
    for (const { symbol, from } of module.imports) {
      if (declared.has(symbol) || symbol in stubs) continue;
      const source = from.startsWith(".") ? `${from.replace(/^\.\//, "")}` : from;
      missing.push(
        `  ${symbol} - imported by ${module.path} from '${from}'` +
          (from.startsWith(".")
            ? `; add '${source}' to modules, or pass stubs:{${symbol}:'...'}`
            : `; pass stubs:{${symbol}:'...'}`),
      );
    }
  }
  if (missing.length) {
    throw new Error(
      `tests/browser/client-module.ts: ${missing.length} imported symbol(s) have no definition in this bundle, ` +
        `so the page would fail with a bare ReferenceError inside page.evaluate:\n${missing.join("\n")}`,
    );
  }

  const expose: Record<string, string> = Array.isArray(options.expose)
    ? Object.fromEntries((options.expose as readonly string[]).map((name) => [name, name]))
    : ((options.expose ?? {}) as Record<string, string>);
  for (const [key, value] of Object.entries(expose)) {
    // A typo here used to surface as `window.X is not a constructor`.
    if (/^[A-Za-z_$][\w$]*$/.test(value) && !declared.has(value) && !(value in stubs)) {
      throw new Error(
        `expose.${key} publishes ${value}, which nothing in this bundle declares. ` +
          `Check the spelling, or add the module that exports it.`,
      );
    }
  }

  const head = [
    `const ${ENV}={MODE:'test',DEV:true,PROD:false,BASE_URL:'/'};`,
    ...prelude.map((module) => module.code),
    ...Object.entries(stubs).map(([name, value]) => `const ${name}=${value};`),
  ].join("\n");
  const body = modules.map((module) => module.code).join("\n");
  const tail = Object.keys(expose).length
    ? `\nObject.assign(window,{${Object.entries(expose)
        .map(([key, value]) => (key === value ? key : `${key}:${value}`))
        .join(",")}});`
    : "";
  return transpile([head, body, tail, options.append ?? ""].join("\n"));
}

/** Inject the bundle into `page`. */
export async function injectClient(page: Page, options: BundleOptions) {
  await page.addScriptTag({ content: clientBundle(options) });
}
