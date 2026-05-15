// deserialize.js — LibSerialize deserialization via fengari-web (Lua VM in JS).
// Requires: window.fengari (loaded via <script src="fengari-web.js"> before this module)
// Requires: royale/src/lua/compat.lua, LibStub.lua, LibSerialize.lua, LibJSON.lua

const LUA_FILES = [
  "/royale/src/lua/compat.lua",
  "/royale/src/lua/LibStub.lua",
  "/royale/src/lua/LibSerialize.lua",
  "/royale/src/lua/LibJSON.lua",
];

let L = null;

async function initLua() {
  if (L) return;

  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = window.fengari;

  L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  const sources = await Promise.all(LUA_FILES.map(url =>
    fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
      return r.text();
    })
  ));

  for (let i = 0; i < sources.length; i++) {
    const rc = lauxlib.luaL_dostring(L, to_luastring(sources[i]));
    if (rc !== lua.LUA_OK) {
      const msg = to_jsstring(lua.lua_tostring(L, -1));
      lua.lua_pop(L, 1);
      throw new Error(`${LUA_FILES[i]}: ${msg}`);
    }
  }
}

// Lua wrapper: reads WR_RAW_BYTES global, deserializes, encodes to JSON string.
const DESERIALIZE_LUA = `
  local ls = LibStub("LibSerialize")
  local ok, data = ls:Deserialize(WR_RAW_BYTES)
  if ok then
    WR_RESULT = WR_JSONEncode(data)
    WR_ERROR  = nil
  else
    WR_RESULT = nil
    WR_ERROR  = tostring(data)
  end
`;

export async function deserialize(decompressed) {
  await initLua();

  const { lua, lauxlib, to_luastring, to_jsstring } = window.fengari;

  // Pass decompressed bytes as a Lua string global
  lua.lua_pushlstring(L, decompressed, decompressed.length);
  lua.lua_setglobal(L, to_luastring("WR_RAW_BYTES"));

  const rc = lauxlib.luaL_dostring(L, to_luastring(DESERIALIZE_LUA));
  if (rc !== lua.LUA_OK) {
    const msg = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_pop(L, 1);
    throw new Error("Lua wrapper: " + msg);
  }

  lua.lua_getglobal(L, to_luastring("WR_RESULT"));
  if (lua.lua_isnil(L, -1)) {
    lua.lua_pop(L, 1);
    lua.lua_getglobal(L, to_luastring("WR_ERROR"));
    const msg = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_pop(L, 1);
    throw new Error("LibSerialize: " + msg);
  }

  const jsonStr = to_jsstring(lua.lua_tostring(L, -1));
  lua.lua_pop(L, 1);

  return JSON.parse(jsonStr);
}
