/**
 * pg-query-emscripten no trae tipos. Se declara aqui solo la superficie que
 * usa tests/migration.test.ts, no la API entera: un .d.ts que promete mas de
 * lo que se ha comprobado es peor que ninguno.
 *
 * `error` llega como null cuando no hay error, no como undefined.
 */
declare module 'pg-query-emscripten' {
  type PgError = {
    message: string;
    funcname?: string;
    filename?: string;
    lineno?: number;
    cursorpos?: number;
    context?: string;
  };

  type ParseResult = {
    error: PgError | null;
    parse_tree?: { stmts?: unknown[] };
  };

  type PlpgsqlResult = {
    error: PgError | null;
    plpgsql_funcs?: unknown[];
  };

  type PgQueryModule = {
    parse(sql: string): ParseResult;
    parsePlpgsql(sql: string): PlpgsqlResult;
  };

  const init: () => Promise<PgQueryModule>;
  export default init;
}
