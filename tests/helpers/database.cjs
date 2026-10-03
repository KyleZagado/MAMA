const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const modules = new Map();

function loadSource(relativePath) {
  const filePath = path.resolve(root, relativePath);
  if (modules.has(filePath)) return modules.get(filePath);
  const compiled = ts.transpileModule(readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  modules.set(filePath, module.exports);
  const requireSource = (specifier) => {
    if (specifier === 'expo-crypto') return { randomUUID };
    if (specifier.startsWith('.')) {
      return loadSource(path.relative(root, path.resolve(path.dirname(filePath), `${specifier}.ts`)));
    }
    throw new Error(`Unexpected runtime dependency: ${specifier}`);
  };
  new Function('require', 'module', 'exports', compiled)(requireSource, module, module.exports);
  return module.exports;
}

function database(filename = ':memory:') {
  const native = new DatabaseSync(filename);
  const db = {
    execAsync: async (sql) => native.exec(sql),
    runAsync: async (sql, ...args) => native.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) => native.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => native.prepare(sql).all(...args),
    withTransactionAsync: async (callback) => {
      native.exec('BEGIN');
      try {
        await callback();
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
  };
  db.withExclusiveTransactionAsync = (callback) => db.withTransactionAsync(() => callback(db));
  return { native, db };
}

function removeTaskV10Schema(native) {
  removeTaskV11Schema(native);
  native.exec('DROP INDEX idx_tasks_date; DROP TABLE task_undo');
  for (const name of ['due_time', 'end_time', 'all_day', 'subtasks', 'photos', 'links',
    'tags', 'color', 'location', 'estimated_minutes', 'actual_minutes', 'archived_at', 'sort_order']) {
    native.exec(`ALTER TABLE tasks DROP COLUMN ${name}`);
  }
}

function removeTaskV11Schema(native) {
  removeTaskV12Schema(native);
  native.exec('DROP INDEX idx_task_occurrence');
  for (const name of ['recurrence_rule', 'series_id', 'occurrence_date']) native.exec(`ALTER TABLE tasks DROP COLUMN ${name}`);
}

function removeTaskV12Schema(native) {
  native.exec('DROP TABLE task_lists');
  for (const name of ['scheduled', 'favorite', 'list_name', 'project']) native.exec(`ALTER TABLE tasks DROP COLUMN ${name}`);
}

module.exports = { loadSource, database, removeTaskV10Schema, removeTaskV11Schema, removeTaskV12Schema };
