const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Exercise the actual component request handlers without a browser or additional
// test dependencies. React effects run once on mount; subsequent renders retain
// hook state, which lets the tests click the real form and pagination callbacks.
function mount(name, respond, props = {}) {
  const state = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let initial = true;
  const hooks = {
    ...React,
    useState(value) {
      const index = cursor++;
      if (initial) state[index] = value;
      return [state[index], (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (initial) state[index] = { current: value };
      return state[index];
    },
    useEffect(effect) { if (initial) effects.push(effect); },
    useCallback(callback) { return callback; },
    useMemo(callback) { return callback(); },
  };
  function request(table, args) {
    const details = { table, args, orders: [], operation: "select" };
    const query = {
      then(resolve, reject) {
        requests.push(details);
        return Promise.resolve(respond(details)).then(resolve, reject);
      },
      order(column, options) { details.orders.push([column, options]); return query; },
      range(from, to) { details.range = [from, to]; return query; },
      update(values) { details.operation = "update"; details.values = values; return query; },
      insert(values) { details.operation = "insert"; details.values = values; return query; },
    };
    for (const method of ["select", "eq", "single"]) query[method] = () => query;
    return query;
  }
  const channel = { on() { return channel; }, subscribe() { return channel; } };
  const supabase = {
    from: request,
    rpc: request,
    auth: { signInWithPassword: (args) => request("signIn", args) },
    channel: () => channel,
    removeChannel() {},
  };
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "react") return hooks;
      if (specifier.endsWith("/lib/supabase")) return { supabase };
      if (!specifier.startsWith(".")) return require(specifier);
      const base = path.resolve(path.dirname(filename), specifier);
      let target = `${base}.ts`;
      try { readFileSync(target); } catch { target = `${base}.tsx`; }
      return load(target);
    };
    vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  const component = load(path.resolve(__dirname, `../src/components/${name}.tsx`))[name];
  function render() {
    cursor = 0;
    const tree = component(props);
    initial = false;
    return tree;
  }
  function find(predicate) {
    const pending = [render()];
    while (pending.length) {
      const item = pending.shift();
      if (!item || typeof item !== "object") continue;
      if (predicate(item)) return item;
      pending.push(...React.Children.toArray(item.props?.children));
    }
    throw new Error(`Element not found in ${name}`);
  }
  render();
  effects.forEach((effect) => effect());
  return { render, find, requests, html: () => renderToStaticMarkup(render()) };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const leak = "database detail: private@example.test; 123 Secret Street; SQLSTATE 42501";
const failed = { data: null, error: { message: leak } };
const success = (data) => ({ data, error: null });
const alert = { id: "alert-1", official_sources: { corridor_rule_id: "rule-1" } };
const thread = { id: "thread-1", user_id: "user-1", status: "AI", subject: "Support", created_at: "2026-09-14" };

function safeFailure(app) {
  const html = app.html();
  assert.doesNotMatch(html, /private@example|Secret Street|SQLSTATE|database detail/);
  assert.match(html, /Unable to|Your reply was sent/);
}

for (const [name, props] of [
  ["AlertsTable", {}], ["UsersTable", {}], ["WaitlistTable", {}], ["MessagesTable", {}],
  ["UserDetailModal", { userId: "user-1" }], ["EditRuleModal", { alert }],
  ["ThreadModal", { threadId: "thread-1" }],
]) {
  test(`${name} never displays raw response detail on load failure`, async () => {
    const app = mount(name, () => failed, props);
    await settle();
    safeFailure(app);
  });
}

test("login never displays provider detail", async () => {
  const app = mount("LoginForm", () => failed);
  await app.find((element) => element.type === "form").props.onSubmit({ preventDefault() {} });
  safeFailure(app);
});

test("dismiss and approval failures use safe recovery text", async () => {
  const alerts = mount("AlertsTable", ({ table }) => table === "dismiss_rule_change" ? failed : success([
    { ...alert, created_at: "2026-09-14", old_hash: "old", new_hash: "new" },
  ]));
  await settle();
  await alerts.find((element) => element.type === "button" && element.props.children === "Dismiss").props.onClick();
  safeFailure(alerts);
  const rule = mount("EditRuleModal", ({ table }) => table === "approve_rule_change" ? failed : success({
    days_deadline: null, is_mandatory: true, global_tasks: { title_en: "Health coverage" },
  }), { alert });
  await settle();
  await rule.find((element) => element.type === "form").props.onSubmit({ preventDefault() {} });
  safeFailure(rule);
});

for (const label of ["Take over", "Mark resolved"]) {
  test(`${label} failure never displays provider detail`, async () => {
    const app = mount("ThreadModal", ({ table, operation }) => operation === "update" ? failed : success(table === "support_threads" ? thread : []), { threadId: "thread-1" });
    await settle();
    await app.find((element) => element.type === "button" && element.props.children === label).props.onClick();
    safeFailure(app);
  });
}

for (const failInsert of [true, false]) {
  test(`reply ${failInsert ? "insert" : "status"} failure is safe and distinguishes a sent reply`, async () => {
    const app = mount("ThreadModal", ({ table, operation }) => {
      if (operation === "insert") return failInsert ? failed : success({ id: "message-1", sender: "admin", body: "Safe reply", created_at: "2026-09-14" });
      if (operation === "update") return failed;
      return success(table === "support_threads" ? thread : []);
    }, { threadId: "thread-1" });
    await settle();
    app.find((element) => element.type === "textarea").props.onChange({ target: { value: "Safe reply" } });
    await app.find((element) => element.type === "button" && element.props.children === "Send").props.onClick();
    safeFailure(app);
    assert.match(app.html(), failInsert ? /check before sending again/ : /Your reply was sent/);
  });
}

test("overlapping user pages remain unique and advance the database offset", async () => {
  const user = (index, total) => ({ user_id: `user-${index}`, is_anonymous: true, total_count: total, tasks_total: 0, tasks_completed: 0 });
  const app = mount("UsersTable", ({ args }) => {
    if (args.p_offset === 0) return success(Array.from({ length: 50 }, (_, i) => user(i, 100)));
    if (args.p_offset === 50) return success(Array.from({ length: 50 }, (_, i) => user(i + 49, 101)));
    assert.equal(args.p_offset, 100);
    return success([user(99, 101)]);
  });
  await settle();
  const loadMore = () => app.find((element) => element.type === "button" && element.props.children === "Load more").props.onClick();
  await loadMore();
  assert.equal((app.html().match(/Anonymous/g) ?? []).length, 99);
  await loadMore();
  assert.equal((app.html().match(/Anonymous/g) ?? []).length, 100);
  assert.deepEqual(app.requests.map(({ args }) => args.p_offset), [0, 50, 100]);
  assert.doesNotMatch(app.html(), /Load more/);
});

test("both alert pages order equal timestamps by a unique ID", async () => {
  const app = mount("AlertsTable", () => success(Array.from({ length: 50 }, (_, i) => ({
    ...alert, id: `alert-${i}`, created_at: "2026-09-14", old_hash: "old", new_hash: "new",
  }))));
  await settle();
  await app.find((element) => element.type === "button" && element.props.children === "Load more").props.onClick();
  assert.equal(app.requests.length, 2);
  for (const request of app.requests) {
    assert.equal(JSON.stringify(request.orders), JSON.stringify([["created_at", { ascending: false }], ["id", { ascending: false }]]));
  }
});
