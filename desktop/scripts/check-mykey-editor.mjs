import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/ga-mykey.ts", import.meta.url), "utf8");
const testableSource = source.replace(
  'import { invoke } from "@tauri-apps/api/core";',
  "const invoke = async () => { throw new Error('invoke is not available in parser tests'); };",
);
const js = ts.transpileModule(testableSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mod = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`);

const fixture = [
  "# existing hand-edited mykey.py",
  "_SETUP_DONE = 'manual'",
  "",
  "mixin_config = {",
  "    'llm_nos': ['gpt-native'],",
  "    'max_retries': 10,",
  "    'base_delay': 0.5,",
  "}",
  "",
  "native_oai_config = {",
  "    'name': 'gpt-native',",
  "    'apikey': 'old-secret',",
  "    'apibase': 'https://api.openai.com/v1',",
  "    'model': 'gpt-5.4',",
  "    'api_mode': 'chat_completions',",
  "    'read_timeout': 120,",
  "}",
  "",
  "tg_bot_token = 'old-token'",
  "custom_config = {'keep': True}",
  "",
].join("\n");

const doc = mod.parseMyKeyDocument({
  exists: true,
  path: "C:/GenericAgent/mykey.py",
  content: fixture,
});

assert.equal(doc.models.length, 1);
assert.equal(doc.models[0].varName, "native_oai_config");
assert.equal(doc.models[0].fields.apikey, "old-secret");
assert.equal(doc.mixin.fields.llm_nos, "gpt-native");
assert.equal(doc.platforms.tg_bot_token, "old-token");

doc.models[0].fields.apikey = "new-secret";
doc.mixin.fields.llm_nos = "gpt-native, fallback";
doc.platforms.tg_bot_token = "new-token";

const rendered = mod.renderMyKeyContent(doc);
assert.match(rendered, /'apikey': "new-secret"/);
assert.match(rendered, /'llm_nos': \["gpt-native", "fallback"\]/);
assert.match(rendered, /tg_bot_token = "new-token"/);
assert.match(rendered, /custom_config = \{'keep': True\}/);
assert.doesNotMatch(rendered, /old-secret/);
assert.doesNotMatch(rendered, /old-token/);

const validation = mod.validateMyKeyEditor(doc);
assert.equal(validation, null);

console.log("mykey editor parser/renderer fixtures passed");
